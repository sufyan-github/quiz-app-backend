"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importQuestions = exports.updateQuestion = exports.deleteQuestion = exports.createQuestion = exports.getQuestions = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const realtimeService_1 = require("../services/realtimeService");
const getQuestions = async (req, res) => {
    try {
        const questions = await prisma_1.default.question.findMany({
            include: { options: true, subject: true, topic: true },
            orderBy: { text: 'asc' }
        });
        res.json(questions);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
};
exports.getQuestions = getQuestions;
const createQuestion = async (req, res) => {
    try {
        const { text, type, difficulty, marks, negativeMarks, language, explanation, hint, subjectId, topicId, options } = req.body;
        const question = await prisma_1.default.question.create({
            data: {
                text,
                type,
                difficulty,
                marks,
                negativeMarks,
                language: language || 'english',
                explanation,
                hint,
                subjectId,
                topicId,
                options: {
                    create: options // expects an array of { text, isCorrect }
                }
            },
            include: { options: true }
        });
        realtimeService_1.realtimeService.emit('questions', 'question_created', { question });
        res.status(201).json(question);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create question' });
    }
};
exports.createQuestion = createQuestion;
const deleteQuestion = async (req, res) => {
    try {
        const id = req.params.id;
        // Delete related options first
        await prisma_1.default.option.deleteMany({
            where: { questionId: id }
        });
        // Delete related exam questions
        await prisma_1.default.examQuestion.deleteMany({
            where: { questionId: id }
        });
        // Delete related student answers
        await prisma_1.default.studentAnswer.deleteMany({
            where: { questionId: id }
        });
        // Then delete question
        await prisma_1.default.question.delete({
            where: { id }
        });
        realtimeService_1.realtimeService.emit('questions', 'question_deleted', { id });
        res.json({ success: true, message: 'Question deleted successfully' });
    }
    catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({ error: 'Failed to delete question' });
    }
};
exports.deleteQuestion = deleteQuestion;
const updateQuestion = async (req, res) => {
    try {
        const id = req.params.id;
        const { text, type, difficulty, marks, negativeMarks, language, explanation, hint, subjectId, topicId, options } = req.body;
        // Update question fields
        const question = await prisma_1.default.question.update({
            where: { id },
            data: {
                text,
                type,
                difficulty,
                marks,
                negativeMarks,
                language: language || 'english',
                explanation,
                hint,
                subjectId,
                topicId
            }
        });
        // Update options if provided
        if (options && Array.isArray(options)) {
            // Clean delete existing options
            await prisma_1.default.option.deleteMany({
                where: { questionId: id }
            });
            // Recreate options
            await prisma_1.default.option.createMany({
                data: options.map((opt) => ({
                    text: opt.text,
                    isCorrect: !!opt.isCorrect,
                    questionId: id
                }))
            });
        }
        const updatedQuestion = await prisma_1.default.question.findUnique({
            where: { id },
            include: { options: true }
        });
        realtimeService_1.realtimeService.emit('questions', 'question_updated', { question: updatedQuestion });
        res.json(updatedQuestion);
    }
    catch (error) {
        console.error('Update question error:', error);
        res.status(500).json({ error: 'Failed to update question' });
    }
};
exports.updateQuestion = updateQuestion;
const importQuestions = async (req, res) => {
    try {
        const { csvText } = req.body;
        if (!csvText) {
            res.status(400).json({ error: 'csvText is required' });
            return;
        }
        const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
            res.status(400).json({ error: 'CSV file is empty or missing headers' });
            return;
        }
        const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"' || char === "'") {
                    inQuotes = !inQuotes;
                }
                else if (char === ',' && !inQuotes) {
                    result.push(current.trim().replace(/^["']|["']$/g, ''));
                    current = '';
                }
                else {
                    current += char;
                }
            }
            result.push(current.trim().replace(/^["']|["']$/g, ''));
            return result;
        };
        const headers = parseCSVLine(lines[0] || '').map((h) => h.toLowerCase());
        const importedQuestions = [];
        // Let's find first default subject/topic in database to fallback on
        const defaultTopic = await prisma_1.default.topic.findFirst();
        const defaultSubject = await prisma_1.default.subject.findFirst();
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i] || '');
            if (values.length < headers.length)
                continue;
            const row = {};
            headers.forEach((header, index) => {
                if (header && values[index] !== undefined) {
                    row[header] = values[index];
                }
            });
            const text = row['text'] || '';
            const difficulty = (row['difficulty'] || 'MEDIUM').toUpperCase();
            const explanation = row['explanation'] || '';
            const topicName = row['topicname'] || '';
            const language = (row['language'] || 'english').toLowerCase();
            if (!text)
                continue;
            // Find or create topic if topicName is provided
            let topicId = defaultTopic?.id || null;
            let subjectId = defaultSubject?.id || null;
            if (topicName) {
                let topic = await prisma_1.default.topic.findFirst({
                    where: { name: { equals: topicName, mode: 'insensitive' } }
                });
                if (!topic && defaultSubject) {
                    topic = await prisma_1.default.topic.create({
                        data: {
                            name: topicName,
                            subjectId: defaultSubject.id
                        }
                    });
                }
                if (topic) {
                    topicId = topic.id;
                    subjectId = topic.subjectId;
                }
            }
            const opt1 = row['option1'] || '';
            const opt2 = row['option2'] || '';
            const opt3 = row['option3'] || '';
            const opt4 = row['option4'] || '';
            const correctIdx = parseInt(row['correctoptionindex'] || '1') || 1;
            const optionsData = [
                { text: opt1, isCorrect: correctIdx === 1 },
                { text: opt2, isCorrect: correctIdx === 2 },
                { text: opt3, isCorrect: correctIdx === 3 },
                { text: opt4, isCorrect: correctIdx === 4 }
            ].filter(o => o.text !== '');
            if (optionsData.length === 0)
                continue;
            const question = await prisma_1.default.question.create({
                data: {
                    text,
                    type: 'MCQ',
                    difficulty,
                    marks: 5,
                    language: language,
                    explanation,
                    topicId,
                    subjectId,
                    options: {
                        create: optionsData
                    }
                },
                include: { options: true }
            });
            importedQuestions.push(question);
        }
        res.json({ success: true, count: importedQuestions.length, data: importedQuestions });
    }
    catch (error) {
        console.error('Import questions error:', error);
        res.status(500).json({ error: 'Failed to import questions' });
    }
};
exports.importQuestions = importQuestions;
//# sourceMappingURL=questionController.js.map