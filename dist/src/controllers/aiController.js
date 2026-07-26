"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiController = void 0;
const aiService_1 = require("../services/aiService");
const prisma_1 = require("../prisma");
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function isUserPremium(userId) {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        include: { userSubscriptions: { where: { status: 'ACTIVE', endDate: { gt: new Date() } } } }
    });
    if (!user)
        return false;
    return user.subscription_status === 'REGISTERED' || user.userSubscriptions.length > 0;
}
exports.aiController = {
    async askAiTutor(req, res) {
        try {
            const { prompt, topicId, lessonId } = req.body;
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            if (!prompt) {
                res.status(400).json({ success: false, message: 'Prompt is required' });
                return;
            }
            const premium = await isUserPremium(userId);
            if (!premium) {
                res.status(402).json({ success: false, requirePaywall: true, message: 'AI Tutor requires a premium subscription.' });
                return;
            }
            const answer = await aiService_1.aiService.askTutor(prompt, userId, topicId, lessonId);
            res.json({ success: true, data: { answer } });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to generate AI response' });
        }
    },
    async generateAiHint(req, res) {
        try {
            const { questionId } = req.body;
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            if (!questionId) {
                res.status(400).json({ success: false, message: 'Question ID is required' });
                return;
            }
            const premium = await isUserPremium(userId);
            if (!premium) {
                res.status(402).json({ success: false, requirePaywall: true, message: 'AI Hints require a premium subscription.' });
                return;
            }
            const hint = await aiService_1.aiService.generateHint(questionId, userId);
            res.json({ success: true, data: { hint } });
        }
        catch (error) {
            console.error(error);
            if (error.message === 'Question not found') {
                res.status(404).json({ success: false, message: error.message });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to generate AI hint' });
        }
    },
    // Admin-only: generate questions via AI
    async generateAiQuiz(req, res) {
        try {
            const { topicId, difficulty, count, adminPrompt, language } = req.body;
            const adminId = req.user?.userId;
            if (!adminId || !topicId) {
                res.status(400).json({ success: false, message: 'Missing parameters' });
                return;
            }
            const generated = await aiService_1.aiService.generateQuiz(topicId, adminId, difficulty, count, adminPrompt, language);
            res.json({ success: true, data: generated });
        }
        catch (error) {
            console.error(error);
            if (error.message === 'Topic not found') {
                res.status(404).json({ success: false, message: error.message });
                return;
            }
            res.status(500).json({ success: false, message: 'Failed to generate quiz via AI' });
        }
    },
    // =============================================
    // STUDENT AI QUIZ GENERATOR (with free-plan cap)
    // =============================================
    async studentGenerateAiQuiz(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const { topicId, subjectId, difficulty = 'MEDIUM', count = 10, language = 'english', enableNegativeMarking = false, questionType = 'MCQ', bloomsLevel, examPattern } = req.body;
            if (!topicId) {
                res.status(400).json({ success: false, message: 'topicId is required' });
                return;
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
            const premium = await isUserPremium(userId);
            const resolvedCount = premium ? Number(count) : Math.min(Number(count), 5);
            if (!premium) {
                if ((user?.freeAiGenerationsUsed ?? 0) >= 2) {
                    res.status(402).json({
                        success: false, requirePaywall: true,
                        message: 'Free AI generation limit (2 exams) reached. Upgrade to generate unlimited exams.'
                    });
                    return;
                }
                // Increment counter
                await prisma_1.prisma.user.update({ where: { id: userId }, data: { freeAiGenerationsUsed: { increment: 1 } } });
            }
            // Build enhanced prompt
            const topic = await prisma_1.prisma.topic.findUnique({
                where: { id: topicId },
                include: { subject: { include: { category: true } } }
            });
            if (!topic) {
                res.status(404).json({ success: false, message: 'Topic not found' });
                return;
            }
            const systemPrompt = `You are an expert ${topic.subject?.category?.name ?? 'General'} teacher specializing in ${topic.subject?.name ?? 'the subject'}. Generate exactly ${resolvedCount} ${questionType} questions about "${topic.name}".
      
Requirements:
- Difficulty: ${difficulty}
- Language: ${language === 'bangla' ? 'Bengali (Bangla)' : 'English'}
${bloomsLevel ? `- Bloom's Taxonomy Level: ${bloomsLevel}` : ''}
${examPattern ? `- Exam Pattern: ${examPattern}` : ''}
- Subject context: ${topic.subject?.name ?? ''} > ${topic.subject?.category?.name ?? ''}
- Each question must have exactly 4 options with one correct answer
- Focus specifically on ${topic.name}

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "text": "question text",
      "options": [
        {"text": "option A", "isCorrect": false},
        {"text": "option B", "isCorrect": true},
        {"text": "option C", "isCorrect": false},
        {"text": "option D", "isCorrect": false}
      ],
      "explanation": "why this answer is correct"
    }
  ]
}`;
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: systemPrompt }],
                response_format: { type: 'json_object' },
                max_tokens: 4000
            });
            const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
            const questions = parsed.questions ?? [];
            // Save to DB
            const saved = [];
            for (const q of questions.slice(0, resolvedCount)) {
                const created = await prisma_1.prisma.question.create({
                    data: {
                        text: q.text,
                        type: 'MCQ',
                        difficulty: difficulty.toUpperCase(),
                        marks: 1,
                        language,
                        explanation: q.explanation ?? null,
                        topicId,
                        subjectId: topic.subjectId,
                        options: { create: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) }
                    },
                    include: { options: { select: { id: true, text: true } } }
                });
                saved.push(created);
            }
            res.json({ success: true, data: saved, meta: { generated: saved.length, isPremium: premium } });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to generate AI quiz' });
        }
    },
    // =============================================
    // AI STUDY PLANNER (premium)
    // =============================================
    async getStudyPlan(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const premium = await isUserPremium(userId);
            if (!premium) {
                res.status(402).json({ success: false, requirePaywall: true, message: 'AI Study Planner requires a subscription.' });
                return;
            }
            // Get last 10 exams to analyze weak areas
            const history = await prisma_1.prisma.examHistory.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 10
            });
            const allWeakAreas = [...new Set(history.flatMap(h => h.weakAreas))];
            const allStrongAreas = [...new Set(history.flatMap(h => h.strongAreas))];
            const avgScore = history.length > 0 ? history.reduce((s, h) => s + h.percentage, 0) / history.length : 0;
            const prompt = `A student has average score ${avgScore.toFixed(0)}%.
Weak areas: ${allWeakAreas.join(', ') || 'none identified yet'}.
Strong areas: ${allStrongAreas.join(', ') || 'none identified yet'}.

Create a 7-day personalized study plan with:
- Daily study goals (2-3 topics per day)
- Practice recommendations
- Estimated improvement in score
- Daily time allocation (in minutes)

Return as JSON:
{
  "weeklyPlan": [
    { "day": 1, "topics": [...], "timeMinutes": 60, "focusArea": "..." }
  ],
  "predictedImprovement": "15%",
  "overallTip": "..."
}`;
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
                max_tokens: 1500
            });
            const plan = JSON.parse(completion.choices[0].message.content ?? '{}');
            res.json({ success: true, data: { ...plan, weakAreas: allWeakAreas, strongAreas: allStrongAreas, avgScore: parseFloat(avgScore.toFixed(1)) } });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to generate study plan' });
        }
    },
    // =============================================
    // AI RECOMMENDATIONS (premium)
    // =============================================
    async getRecommendations(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const premium = await isUserPremium(userId);
            if (!premium) {
                res.status(402).json({ success: false, requirePaywall: true, message: 'AI Recommendations require a subscription.' });
                return;
            }
            const history = await prisma_1.prisma.examHistory.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 5
            });
            const weakAreas = [...new Set(history.flatMap(h => h.weakAreas))].slice(0, 5);
            // Find relevant topics to practice
            const topics = await prisma_1.prisma.topic.findMany({
                where: weakAreas.length > 0 ? {
                    name: { in: weakAreas }
                } : {},
                include: { subject: true },
                take: 6
            });
            res.json({
                success: true,
                data: {
                    recommendedTopics: topics.map(t => ({ id: t.id, name: t.name, subjectName: t.subject?.name })),
                    weakAreas,
                    message: weakAreas.length > 0
                        ? `Focus on: ${weakAreas.slice(0, 3).join(', ')}`
                        : 'Keep practicing consistently to build strong foundations!'
                }
            });
        }
        catch (error) {
            res.status(500).json({ success: false, message: 'Failed to get recommendations' });
        }
    },
    // =============================================
    // AI CUSTOM STUDY PLANNER GENERATOR
    // =============================================
    async generateCustomStudyPlan(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const { goal, subject, skillLevel = 'Beginner', hoursPerDay = 2, days = 7, language = 'English', difficulty = 'Medium', preferredDays = 'Every Day' } = req.body;
            const targetGoal = goal || 'Master ' + (subject || 'General Topics');
            const targetSubject = subject || 'General Learning';
            const prompt = `You are an expert AI Learning Strategist. Create a customized, highly detailed ${days}-day learning roadmap for a student.

Goal: "${targetGoal}"
Course/Subject: "${targetSubject}"
Skill Level: ${skillLevel}
Available Time: ${hoursPerDay} hours per day
Language: ${language}
Difficulty: ${difficulty}
Preferred Study Schedule: ${preferredDays}

Generate a JSON object with:
1. "goal": "${targetGoal}"
2. "subject": "${targetSubject}"
3. "skillLevel": "${skillLevel}"
4. "predictedImprovement": "+35%"
5. "estimatedCompletion": "${days} Days"
6. "motivationalTip": "Short inspiring quote in ${language}"
7. "timeline": Array of ${days} day objects. Each day object must contain:
   - "day": day number (1, 2, 3...)
   - "title": "Day title"
   - "topics": ["Topic 1", "Topic 2"]
   - "estimatedTimeMins": ${hoursPerDay * 60}
   - "objective": "What to master today"
   - "practiceTask": "Specific practice exercise"
   - "revision": "Revision requirement"

Return ONLY valid JSON.`;
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
                max_tokens: 3500
            });
            const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
            res.json({ success: true, data: parsed });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to generate custom study plan' });
        }
    }
};
//# sourceMappingURL=aiController.js.map