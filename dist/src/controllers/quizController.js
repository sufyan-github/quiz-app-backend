"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.quizController = void 0;
const prisma_1 = require("../prisma");
const openai_1 = __importDefault(require("openai"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
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
            if (!topicId) {
                res.status(400).json({ success: false, message: 'topicId is required' });
                return;
            }
            // Fetch subject name for auto-config
            const topic = await prisma_1.prisma.topic.findUnique({
                where: { id: String(topicId) },
                include: { subject: true }
            });
            const autoConfig = await getQuizConfig(topic?.subject?.name ?? 'default');
            let resolvedLimit = Number(limit) || autoConfig.questions;
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
            const allQuestions = await prisma_1.prisma.question.findMany({
                where: {
                    topicId: String(topicId),
                    ...(language && language !== 'all' ? { language: String(language) } : {}),
                },
                include: { options: { select: { id: true, text: true } } }
            });
            if (allQuestions.length === 0) {
                res.status(404).json({ success: false, message: 'No questions found for this topic' });
                return;
            }
            const shuffled = allQuestions.sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, resolvedLimit);
            res.json({
                success: true,
                data: selected,
                config: {
                    totalQuestions: selected.length,
                    timeMins: autoConfig.timeMins,
                    totalMarks: selected.length * 1,
                    passingMarks: Math.ceil(selected.length * autoConfig.passingPct / 100),
                    enableNegativeMarking: enableNegativeMarking === 'true',
                    negativeValue: parseFloat(String(negativeValue ?? '0.25')),
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
                const completion = await openai.chat.completions.create({
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
            const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                res.status(404).json({ success: false, message: 'User not found' });
                return;
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
            const existingReward = await prisma_1.prisma.dailyLoginReward.findFirst({
                where: { userId, createdAt: { gte: today, lt: tomorrow } }
            });
            if (existingReward) {
                res.json({ success: false, alreadyClaimed: true, message: 'Already claimed today' });
                return;
            }
            // Calculate streak
            const lastLogin = user.lastLoginDate;
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            const isConsecutive = lastLogin && lastLogin >= yesterday && lastLogin < today;
            const newStreak = isConsecutive ? user.streak + 1 : 1;
            const coinsGranted = 10 + Math.min(newStreak * 2, 30); // bonus for streak
            const xpGranted = 5 + Math.min(newStreak, 10);
            await prisma_1.prisma.dailyLoginReward.create({
                data: { userId, coinsGranted, xpGranted, streakDay: newStreak }
            });
            await prisma_1.prisma.user.update({
                where: { id: userId },
                data: {
                    coins: { increment: coinsGranted },
                    xp: { increment: xpGranted },
                    streak: newStreak,
                    lastLoginDate: new Date()
                }
            });
            res.json({ success: true, data: { coinsGranted, xpGranted, streak: newStreak, alreadyClaimed: false } });
        }
        catch (error) {
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
//# sourceMappingURL=quizController.js.map