"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.quizController = void 0;
const prisma_1 = require("../prisma");
const openai_1 = require("../config/openai");
const pdfkit_1 = __importDefault(require("pdfkit"));
const crypto_1 = __importDefault(require("crypto"));
const quizSessionService_1 = require("../services/quizSessionService");
// =============================================
// SUBJECT AUTO-CONFIG (fallback defaults)
// =============================================
const DEFAULT_QUIZ_CONFIG = {
    'mathematics': { questions: 20, timeMins: 30, passingPct: 40 },
    'physics': { questions: 30, timeMins: 45, passingPct: 40 },
    'chemistry': { questions: 25, timeMins: 40, passingPct: 40 },
    'biology': { questions: 25, timeMins: 40, passingPct: 40 },
    'english': { questions: 25, timeMins: 25, passingPct: 50 },
    'general knowledge': { questions: 50, timeMins: 50, passingPct: 40 },
    'bangladesh': { questions: 40, timeMins: 40, passingPct: 40 },
    'ict': { questions: 25, timeMins: 30, passingPct: 40 },
    'default': { questions: 20, timeMins: 30, passingPct: 40 },
};
async function getQuizConfig(subjectName) {
    const dbConfig = await prisma_1.prisma.subjectQuizConfig.findUnique({
        where: { subjectName: subjectName.toLowerCase() }
    }).catch(() => null);
    if (dbConfig) {
        return { questions: dbConfig.defaultQuestions, timeMins: dbConfig.defaultTimeMins, passingPct: dbConfig.defaultPassingPct };
    }
    return DEFAULT_QUIZ_CONFIG[subjectName.toLowerCase()] ?? DEFAULT_QUIZ_CONFIG['default'];
}
async function isUserPremium(userId) {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        include: {
            userSubscriptions: { where: { status: 'ACTIVE', endDate: { gt: new Date() } } }
        }
    });
    if (!user)
        return false;
    return user.subscription_status === 'REGISTERED' || user.userSubscriptions.length > 0;
}
async function submitIssuedQuiz(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { sessionId, answers, timeTakenSecs = 0 } = req.body;
        if (typeof sessionId !== 'string' || !sessionId || !Array.isArray(answers) || answers.length > 100) {
            res.status(400).json({ success: false, message: 'A valid sessionId and answers array are required' });
            return;
        }
        const session = await prisma_1.prisma.quizSession.findFirst({ where: { id: sessionId, userId } });
        if (!session) {
            res.status(404).json({ success: false, message: 'Quiz session not found' });
            return;
        }
        if (session.submittedAt) {
            res.status(409).json({ success: false, message: 'Quiz session was already submitted' });
            return;
        }
        if (session.expiresAt < new Date()) {
            res.status(410).json({ success: false, message: 'Quiz session expired' });
            return;
        }
        const answerMap = new Map();
        for (const answer of answers) {
            if (!answer || typeof answer.questionId !== 'string' || typeof answer.optionId !== 'string') {
                res.status(400).json({ success: false, message: 'Each answer must contain questionId and optionId' });
                return;
            }
            if (answerMap.has(answer.questionId) || !session.questionIds.includes(answer.questionId)) {
                res.status(400).json({ success: false, message: 'Answers contain duplicate or unissued questions' });
                return;
            }
            answerMap.set(answer.questionId, answer.optionId);
        }
        const questions = await prisma_1.prisma.question.findMany({
            where: { id: { in: session.questionIds } },
            include: { options: true, topic: { include: { subject: { include: { category: true } } } } },
        });
        if (questions.length !== session.questionIds.length) {
            res.status(409).json({ success: false, message: 'Quiz content changed; start a new session' });
            return;
        }
        let correctCount = 0;
        let totalMarks = 0;
        let totalPossibleMarks = 0;
        let negativeTotal = 0;
        let skippedCount = 0;
        const topicBreakdown = {};
        for (const question of questions) {
            totalPossibleMarks += question.marks;
            const topicName = question.topic?.name ?? 'General';
            if (!topicBreakdown[topicName])
                topicBreakdown[topicName] = { correct: 0, wrong: 0, total: 0 };
            topicBreakdown[topicName].total += 1;
            const optionId = answerMap.get(question.id);
            if (!optionId) {
                skippedCount += 1;
                continue;
            }
            const selectedOption = question.options.find((option) => option.id === optionId);
            if (!selectedOption) {
                res.status(400).json({ success: false, message: 'An answer option does not belong to its question' });
                return;
            }
            if (selectedOption.isCorrect) {
                correctCount += 1;
                totalMarks += question.marks;
                topicBreakdown[topicName].correct += 1;
            }
            else {
                topicBreakdown[topicName].wrong += 1;
                if (session.negativeMarking)
                    negativeTotal += session.negativeValue;
            }
        }
        const answeredCount = questions.length - skippedCount;
        const finalScore = Math.max(0, totalMarks - negativeTotal);
        const percentage = totalPossibleMarks > 0 ? Math.min(100, Math.max(0, (finalScore / totalPossibleMarks) * 100)) : 0;
        const accuracy = answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0;
        const xpEarned = correctCount * 10;
        const coinsEarned = correctCount * 5;
        const weakAreas = Object.entries(topicBreakdown).filter(([, value]) => value.correct / value.total < 0.5).map(([name]) => name);
        const strongAreas = Object.entries(topicBreakdown).filter(([, value]) => value.correct / value.total >= 0.7).map(([name]) => name);
        const aiFeedback = weakAreas.length > 0
            ? `Review ${weakAreas.slice(0, 3).join(', ')} and retry the missed questions after a short break.`
            : 'Strong work. Use spaced review to retain what you learned.';
        const topic = questions[0]?.topic;
        const safeTimeTakenSecs = Math.min(session.durationSecs, Math.max(0, Math.floor(Number(timeTakenSecs) || 0)));
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const claimed = await tx.quizSession.updateMany({
                where: { id: session.id, userId, submittedAt: null, expiresAt: { gte: new Date() } },
                data: { submittedAt: new Date() },
            });
            if (claimed.count !== 1)
                throw new Error('QUIZ_ALREADY_SUBMITTED');
            if (!session.premiumAtStart) {
                const paidAccess = await tx.paidExamAccess.findFirst({ where: { userId, examId: session.topicId } });
                if (paidAccess) {
                    await tx.paidExamAccess.delete({ where: { id: paidAccess.id } });
                }
                else {
                    const consumed = await tx.user.updateMany({
                        where: { id: userId, freeExamsUsed: { lt: 1 } },
                        data: { freeExamsUsed: { increment: 1 } },
                    });
                    if (consumed.count !== 1)
                        throw new Error('FREE_ATTEMPT_EXHAUSTED');
                }
            }
            const user = await tx.user.update({
                where: { id: userId },
                data: { xp: { increment: xpEarned }, coins: { increment: coinsEarned } },
                select: { xp: true, level: true },
            });
            const newLevel = Math.floor(user.xp / 100) + 1;
            const levelUp = newLevel > user.level;
            if (levelUp)
                await tx.user.update({ where: { id: userId }, data: { level: newLevel } });
            const history = await tx.examHistory.create({
                data: {
                    userId,
                    quizSessionId: session.id,
                    topicId: session.topicId,
                    subjectId: topic?.subjectId ?? null,
                    topicName: topic?.name ?? null,
                    categoryName: topic?.subject?.category?.name ?? null,
                    totalQuestions: questions.length,
                    correctAnswers: correctCount,
                    wrongAnswers: answeredCount - correctCount,
                    skippedAnswers: skippedCount,
                    score: finalScore,
                    totalMarks: totalPossibleMarks,
                    percentage,
                    timeTakenSecs: safeTimeTakenSecs,
                    accuracy,
                    xpEarned,
                    coinsEarned,
                    negativeMarking: session.negativeMarking,
                    negativeValue: session.negativeValue,
                    language: session.language,
                    aiFeedback,
                    weakAreas,
                    strongAreas,
                    topicBreakdown,
                    isPremium: session.premiumAtStart,
                },
            });
            return { history, newLevel, levelUp };
        }, { isolationLevel: 'Serializable' });
        res.json({
            success: true,
            data: {
                historyId: result.history.id,
                score: finalScore,
                correctAnswers: correctCount,
                wrongAnswers: answeredCount - correctCount,
                skippedAnswers: skippedCount,
                totalQuestions: questions.length,
                percentage: Number(percentage.toFixed(1)),
                accuracy: Number(accuracy.toFixed(1)),
                timeTakenSecs: safeTimeTakenSecs,
                xpEarned,
                coinsEarned,
                newLevel: result.levelUp ? result.newLevel : null,
                aiFeedback,
                weakAreas,
                strongAreas,
                topicBreakdown,
                isPremium: session.premiumAtStart,
            },
        });
    }
    catch (error) {
        if (error?.message === 'QUIZ_ALREADY_SUBMITTED') {
            res.status(409).json({ success: false, message: 'Quiz session was already submitted' });
            return;
        }
        if (error?.message === 'FREE_ATTEMPT_EXHAUSTED') {
            res.status(402).json({ success: false, requirePaywall: true, message: 'Free trial limit reached. Please subscribe to continue.' });
            return;
        }
        console.error('Issued quiz submission failed:', error);
        res.status(500).json({ success: false, message: 'Failed to submit quiz' });
    }
}
exports.quizController = {
    async getCategories(req, res) {
        try {
            const categories = await prisma_1.prisma.category.findMany({
                include: { subjects: { include: { topics: true } } }
            });
            res.json({ success: true, data: categories });
        }
        catch (error) {
            res.status(500).json({ success: false, message: 'Failed to fetch categories' });
        }
    },
    // =============================================
    // GENERATE QUIZ
    // =============================================
    async generateQuiz(req, res) {
        try {
            const userId = req.user?.userId;
            const { topicId, limit, enableNegativeMarking, negativeValue, language } = req.query;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            if (typeof topicId !== 'string' || !topicId) {
                res.status(400).json({ success: false, message: 'topicId is required' });
                return;
            }
            // Fetch subject name for auto-config
            const topic = await prisma_1.prisma.topic.findUnique({
                where: { id: topicId },
                include: { subject: true }
            });
            if (!topic) {
                res.status(404).json({ success: false, message: 'Topic not found' });
                return;
            }
            const autoConfig = await getQuizConfig(topic.subject?.name ?? 'default');
            const requestedLimit = Number(limit);
            let resolvedLimit = Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : autoConfig.questions;
            resolvedLimit = Math.min(100, Math.max(1, resolvedLimit));
            let isPremium = false;
            if (userId) {
                const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
                isPremium = await isUserPremium(userId);
                if (!isPremium && user) {
                    // Check pay-per-exam unlock
                    const paidAccess = await prisma_1.prisma.paidExamAccess.findFirst({
                        where: { userId, examId: String(topicId) }
                    });
                    if (!paidAccess) {
                        if (user.freeExamsUsed >= 1) {
                            res.status(402).json({
                                success: false, requirePaywall: true,
                                message: 'Free trial limit reached. Please subscribe or pay ৳2 to unlock this exam.'
                            });
                            return;
                        }
                        // Enforce 5-question cap for free users
                        resolvedLimit = Math.min(resolvedLimit, 5);
                    }
                }
            }
            const selectedLanguage = language === 'bangla' ? 'bangla' : 'english';
            const requestedNegativeValue = Number(negativeValue);
            const resolvedNegativeValue = Number.isFinite(requestedNegativeValue)
                ? Math.min(1, Math.max(0, requestedNegativeValue))
                : 0.25;
            const resolvedNegativeMarking = isPremium && enableNegativeMarking === 'true';
            const allQuestions = await prisma_1.prisma.question.findMany({
                where: {
                    topicId,
                    language: selectedLanguage,
                    status: 'PUBLISHED',
                },
                select: {
                    id: true,
                    text: true,
                    type: true,
                    difficulty: true,
                    marks: true,
                    language: true,
                    options: { select: { id: true, text: true } },
                },
            });
            if (allQuestions.length === 0) {
                res.status(404).json({ success: false, message: 'No questions found for this topic' });
                return;
            }
            const shuffled = [...allQuestions];
            for (let i = shuffled.length - 1; i > 0; i -= 1) {
                const j = crypto_1.default.randomInt(i + 1);
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const selected = shuffled.slice(0, resolvedLimit);
            const session = await (0, quizSessionService_1.createQuizSession)({
                userId,
                topicId,
                questionIds: selected.map((question) => question.id),
                durationSecs: autoConfig.timeMins * 60,
                negativeMarking: resolvedNegativeMarking,
                negativeValue: resolvedNegativeValue,
                language: selectedLanguage,
                premiumAtStart: isPremium,
            });
            res.json({
                success: true,
                data: selected,
                config: {
                    sessionId: session.id,
                    totalQuestions: selected.length,
                    timeMins: autoConfig.timeMins,
                    totalMarks: selected.length * 1,
                    passingMarks: Math.ceil(selected.length * autoConfig.passingPct / 100),
                    enableNegativeMarking: resolvedNegativeMarking,
                    negativeValue: resolvedNegativeValue,
                    isPremium,
                }
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to generate quiz' });
        }
    },
    // =============================================
    // SUBMIT QUIZ – detailed result + save history
    // =============================================
    submitQuizV2: submitIssuedQuiz,
    async submitQuiz(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const { answers, timeTakenSecs = 0, enableNegativeMarking = false, negativeValue = 0.25, language = 'english' } = req.body;
            if (!Array.isArray(answers)) {
                res.status(400).json({ success: false, message: 'Invalid answers format' });
                return;
            }
            const premium = await isUserPremium(userId);
            let topicId = '';
            let subjectId = '';
            // Determine topic/subject from first answer
            if (answers.length > 0 && answers[0].questionId) {
                const q = await prisma_1.prisma.question.findUnique({
                    where: { id: answers[0].questionId },
                    include: { topic: true, subject: true }
                });
                topicId = q?.topicId ?? '';
                subjectId = q?.subjectId ?? '';
            }
            // Free trial: consume or use paidAccess
            if (!premium) {
                const paidAccess = topicId ? await prisma_1.prisma.paidExamAccess.findFirst({ where: { userId, examId: topicId } }) : null;
                if (paidAccess) {
                    await prisma_1.prisma.paidExamAccess.delete({ where: { id: paidAccess.id } });
                }
                else {
                    await prisma_1.prisma.user.update({ where: { id: userId }, data: { freeExamsUsed: { increment: 1 } } });
                }
            }
            // Evaluate answers
            let correctCount = 0;
            let totalMarks = 0;
            let totalPossibleMarks = 0;
            let negativeTotal = 0;
            const topicBreakdown = {};
            const skippedCount = answers.filter((a) => !a.optionId).length;
            for (const ans of answers) {
                if (!ans.optionId)
                    continue;
                const option = await prisma_1.prisma.option.findUnique({
                    where: { id: ans.optionId },
                    include: { question: { include: { topic: true } } }
                });
                const qMarks = option?.question?.marks ?? 1;
                totalPossibleMarks += qMarks;
                const tName = option?.question?.topic?.name ?? 'General';
                if (!topicBreakdown[tName])
                    topicBreakdown[tName] = { correct: 0, wrong: 0, total: 0 };
                topicBreakdown[tName].total++;
                if (option?.isCorrect && option.questionId === ans.questionId) {
                    correctCount++;
                    totalMarks += qMarks;
                    topicBreakdown[tName].correct++;
                }
                else {
                    topicBreakdown[tName].wrong++;
                    if (enableNegativeMarking)
                        negativeTotal += Number(negativeValue);
                }
            }
            if (totalPossibleMarks === 0)
                totalPossibleMarks = answers.length || 1;
            const finalScore = Math.max(0, totalMarks - negativeTotal);
            const percentage = Math.min(100, Math.max(0, (finalScore / totalPossibleMarks) * 100));
            const accuracy = answers.length > 0 ? (correctCount / (answers.length - skippedCount || 1)) * 100 : 0;
            const xpEarned = correctCount * 10;
            const coinsEarned = correctCount * 5;
            // Update user stats
            const user = await prisma_1.prisma.user.update({
                where: { id: userId },
                data: { xp: { increment: xpEarned }, coins: { increment: coinsEarned } }
            });
            const newLevel = Math.floor(user.xp / 100) + 1;
            if (newLevel > user.level) {
                await prisma_1.prisma.user.update({ where: { id: userId }, data: { level: newLevel } });
            }
            // Determine weak/strong areas
            const weakAreas = Object.entries(topicBreakdown)
                .filter(([, v]) => v.total > 0 && v.correct / v.total < 0.5)
                .map(([k]) => k);
            const strongAreas = Object.entries(topicBreakdown)
                .filter(([, v]) => v.total > 0 && v.correct / v.total >= 0.7)
                .map(([k]) => k);
            // AI Feedback (brief)
            let aiFeedback = '';
            try {
                const completion = await openai_1.openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{
                            role: 'user',
                            content: `A student scored ${correctCount}/${answers.length} (${percentage.toFixed(1)}%) on a quiz. Weak areas: ${weakAreas.join(', ') || 'none'}. Strong areas: ${strongAreas.join(', ') || 'none'}. Give a 2-sentence encouraging feedback and 1 study tip in ${language === 'bangla' ? 'Bangla' : 'English'}.`
                        }],
                    max_tokens: 150
                });
                aiFeedback = completion.choices[0].message.content ?? '';
            }
            catch {
                aiFeedback = 'Keep practicing to improve your score!';
            }
            // Save exam history
            const topicObj = topicId ? await prisma_1.prisma.topic.findUnique({ where: { id: topicId }, include: { subject: { include: { category: true } } } }) : null;
            const history = await prisma_1.prisma.examHistory.create({
                data: {
                    userId,
                    topicId: topicId || null,
                    subjectId: subjectId || null,
                    topicName: topicObj?.name ?? null,
                    categoryName: topicObj?.subject?.category?.name ?? null,
                    totalQuestions: answers.length,
                    correctAnswers: correctCount,
                    wrongAnswers: answers.length - correctCount - skippedCount,
                    skippedAnswers: skippedCount,
                    score: finalScore,
                    totalMarks: totalPossibleMarks,
                    percentage,
                    timeTakenSecs: Number(timeTakenSecs),
                    accuracy,
                    xpEarned,
                    coinsEarned,
                    negativeMarking: Boolean(enableNegativeMarking),
                    negativeValue: Number(negativeValue),
                    language,
                    aiFeedback,
                    weakAreas,
                    strongAreas,
                    topicBreakdown,
                    isPremium: premium,
                }
            });
            res.json({
                success: true,
                data: {
                    historyId: history.id,
                    score: finalScore,
                    correctAnswers: correctCount,
                    wrongAnswers: answers.length - correctCount - skippedCount,
                    skippedAnswers: skippedCount,
                    totalQuestions: answers.length,
                    percentage: parseFloat(percentage.toFixed(1)),
                    accuracy: parseFloat(accuracy.toFixed(1)),
                    timeTakenSecs,
                    xpEarned, coinsEarned,
                    newLevel: newLevel > user.level ? newLevel : null,
                    aiFeedback,
                    weakAreas, strongAreas,
                    topicBreakdown,
                    isPremium: premium,
                }
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to submit quiz' });
        }
    },
    // =============================================
    // EXAM HISTORY
    // =============================================
    async getExamHistory(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const history = await prisma_1.prisma.examHistory.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 50
            });
            res.json({ success: true, data: history });
        }
        catch (error) {
            res.status(500).json({ success: false, message: 'Failed to fetch history' });
        }
    },
    async getExamHistoryDetail(req, res) {
        try {
            const userId = req.user?.userId;
            const id = req.params.id;
            const history = await prisma_1.prisma.examHistory.findFirst({
                where: { id, userId }
            });
            if (!history) {
                res.status(404).json({ success: false, message: 'Report not found' });
                return;
            }
            res.json({ success: true, data: history });
        }
        catch (error) {
            res.status(500).json({ success: false, message: 'Failed to fetch report' });
        }
    },
    async downloadPdfReport(req, res) {
        try {
            const userId = req.user?.userId;
            const id = req.params.id;
            const history = await prisma_1.prisma.examHistory.findFirst({
                where: { id, userId }
            });
            if (!history) {
                res.status(404).json({ success: false, message: 'Report not found' });
                return;
            }
            const doc = new pdfkit_1.default({ margin: 40 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="Quiz_Report_${history.id.substring(0, 8)}.pdf"`);
            doc.pipe(res);
            // Title & Header
            doc.fontSize(22).fillColor('#1E293B').text('QUIZ PERFORMANCE REPORT', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(12).fillColor('#64748B').text(`Topic: ${history.topicName || 'General Quiz'} | Date: ${new Date(history.createdAt).toLocaleDateString()}`, { align: 'center' });
            doc.moveDown(1.5);
            // Score Summary Box
            doc.rect(40, doc.y, 532, 70).fill('#F1F5F9');
            const boxY = doc.y - 60;
            doc.fontSize(26).fillColor('#0D8ABC').text(`${history.percentage.toFixed(1)}%`, 60, boxY, { width: 500, align: 'center' });
            doc.fontSize(11).fillColor('#334155').text(`Score: ${history.score} / ${history.totalMarks} Marks | Accuracy: ${history.accuracy.toFixed(0)}%`, 60, boxY + 35, { width: 500, align: 'center' });
            doc.moveDown(3);
            // Statistics Table
            doc.fontSize(14).fillColor('#0F172A').text('Exam Statistics', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(11).fillColor('#334155');
            doc.text(`Total Questions: ${history.totalQuestions}`);
            doc.text(`Correct Answers: ${history.correctAnswers}`);
            doc.text(`Wrong Answers: ${history.wrongAnswers}`);
            doc.text(`Skipped Questions: ${history.skippedAnswers}`);
            doc.text(`Time Taken: ${history.timeTakenSecs} seconds`);
            doc.text(`XP Earned: +${history.xpEarned} XP`);
            doc.text(`Coins Earned: +${history.coinsEarned} Coins`);
            doc.moveDown(1.5);
            // AI Feedback
            if (history.aiFeedback) {
                doc.fontSize(14).fillColor('#0F172A').text('AI Tutor Feedback & Recommendations', { underline: true });
                doc.moveDown(0.5);
                doc.fontSize(11).fillColor('#475569').text(history.aiFeedback);
            }
            doc.end();
        }
        catch (error) {
            console.error('PDF Generation Error:', error.message);
            res.status(500).json({ success: false, message: 'Failed to generate PDF' });
        }
    },
    // =============================================
    // DASHBOARD
    // =============================================
    async getDashboard(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    mobile: true, xp: true, coins: true, level: true, streak: true,
                    subscription_status: true, freeExamsUsed: true, freeAiGenerationsUsed: true,
                    lastLoginDate: true,
                    userSubscriptions: { where: { status: 'ACTIVE', endDate: { gt: new Date() } }, take: 1 }
                }
            });
            const recentHistory = await prisma_1.prisma.examHistory.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, topicName: true, categoryName: true, percentage: true, score: true, createdAt: true }
            });
            res.json({ success: true, data: { ...user, recentHistory } });
        }
        catch (error) {
            res.status(500).json({ success: false, message: 'Failed to fetch dashboard' });
        }
    },
    // =============================================
    // LEADERBOARD (daily/weekly/monthly)
    // =============================================
    async getLeaderboard(req, res) {
        try {
            const { period = 'ALL_TIME', subjectId } = req.query;
            let dateFilter;
            const now = new Date();
            if (period === 'DAILY') {
                dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            }
            else if (period === 'WEEKLY') {
                dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            }
            else if (period === 'MONTHLY') {
                dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            if (dateFilter) {
                // Aggregate from ExamHistory for time-based
                const grouped = await prisma_1.prisma.examHistory.groupBy({
                    by: ['userId'],
                    where: {
                        createdAt: { gte: dateFilter },
                        ...(subjectId ? { subjectId: String(subjectId) } : {})
                    },
                    _sum: { xpEarned: true },
                    orderBy: { _sum: { xpEarned: 'desc' } },
                    take: 50,
                });
                const userIds = grouped.map(g => g.userId);
                const users = await prisma_1.prisma.user.findMany({
                    where: { id: { in: userIds } },
                    select: { id: true, mobile: true, level: true }
                });
                const result = grouped.map((g, i) => {
                    const u = users.find(u => u.id === g.userId);
                    return {
                        rank: i + 1,
                        userId: g.userId,
                        mobile: u?.mobile ? u.mobile.substring(0, 5) + '***' + u.mobile.slice(-3) : 'Unknown',
                        level: u?.level ?? 1,
                        xp: g._sum.xpEarned ?? 0,
                    };
                });
                res.json({ success: true, data: result, period });
                return;
            }
            // All-time: use user table
            const topUsers = await prisma_1.prisma.user.findMany({
                orderBy: { xp: 'desc' },
                take: 50,
                select: { id: true, mobile: true, xp: true, level: true }
            });
            const masked = topUsers.map((u, i) => ({
                rank: i + 1,
                userId: u.id,
                mobile: u.mobile ? u.mobile.substring(0, 5) + '***' + u.mobile.slice(-3) : 'Unknown',
                level: u.level, xp: u.xp,
            }));
            res.json({ success: true, data: masked, period: 'ALL_TIME' });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
        }
    },
    // =============================================
    // DAILY LOGIN REWARD
    // =============================================
    async claimDailyReward(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const dhakaNow = new Date(Date.now() + 6 * 60 * 60 * 1000);
            const rewardDate = new Date(Date.UTC(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth(), dhakaNow.getUTCDate()));
            const reward = await prisma_1.prisma.$transaction(async (tx) => {
                const user = await tx.user.findUnique({ where: { id: userId } });
                if (!user)
                    throw new Error('USER_NOT_FOUND');
                let isConsecutive = false;
                if (user.lastLoginDate) {
                    const lastDhaka = new Date(user.lastLoginDate.getTime() + 6 * 60 * 60 * 1000);
                    const lastDate = Date.UTC(lastDhaka.getUTCFullYear(), lastDhaka.getUTCMonth(), lastDhaka.getUTCDate());
                    isConsecutive = rewardDate.getTime() - lastDate === 24 * 60 * 60 * 1000;
                }
                const newStreak = isConsecutive ? user.streak + 1 : 1;
                const coinsGranted = 10 + Math.min(newStreak * 2, 30);
                const xpGranted = 5 + Math.min(newStreak, 10);
                await tx.dailyLoginReward.create({
                    data: { userId, rewardDate, coinsGranted, xpGranted, streakDay: newStreak },
                });
                await tx.user.update({
                    where: { id: userId },
                    data: {
                        coins: { increment: coinsGranted },
                        xp: { increment: xpGranted },
                        streak: newStreak,
                        lastLoginDate: new Date(),
                    },
                });
                return { coinsGranted, xpGranted, streak: newStreak, alreadyClaimed: false };
            }, { isolationLevel: 'Serializable' });
            res.json({ success: true, data: reward });
        }
        catch (error) {
            if (error?.code === 'P2002') {
                res.json({ success: false, alreadyClaimed: true, message: 'Already claimed today' });
                return;
            }
            if (error?.message === 'USER_NOT_FOUND') {
                res.status(404).json({ success: false, message: 'User not found' });
                return;
            }
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to claim reward' });
        }
    },
    // =============================================
    // AUTO QUIZ CONFIG
    // =============================================
    async getQuizConfig(req, res) {
        try {
            const { subjectName } = req.query;
            const config = await getQuizConfig(String(subjectName ?? 'default'));
            res.json({ success: true, data: config });
        }
        catch {
            res.status(500).json({ success: false, message: 'Failed to get config' });
        }
    },
    async seedData(req, res) {
        // Testing-only route (see quizRoutes.ts), mounted with no auth at all.
        // Must not run in production: it has no idempotency check, so every
        // call inserts another duplicate Category/Subject/Topic/Question set.
        if (process.env.NODE_ENV === 'production') {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        try {
            const category = await prisma_1.prisma.category.create({
                data: { name: 'Programming', description: 'Test your coding skills' }
            });
            const subject = await prisma_1.prisma.subject.create({
                data: { name: 'Dart & Flutter', categoryId: category.id }
            });
            const topic = await prisma_1.prisma.topic.create({
                data: { name: 'Flutter Basics', subjectId: subject.id }
            });
            await prisma_1.prisma.question.createMany({
                data: [
                    { text: 'What language is Flutter written in?', type: 'MCQ', difficulty: 'EASY', marks: 10, topicId: topic.id, subjectId: subject.id },
                    { text: 'Which widget is used for a scrollable list in Flutter?', type: 'MCQ', difficulty: 'MEDIUM', marks: 10, topicId: topic.id, subjectId: subject.id }
                ]
            });
            res.json({ success: true, message: 'Database seeded successfully' });
        }
        catch (error) {
            res.status(500).json({ success: false, message: 'Failed to seed' });
        }
    }
};
