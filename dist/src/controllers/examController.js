"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteQuestion = exports.addQuestionToExam = exports.getAllResults = exports.generateCertificate = exports.submitExam = exports.saveAnswer = exports.deleteExam = exports.updateExam = exports.createExam = exports.getExams = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const getExams = async (req, res) => {
    try {
        const exams = await prisma_1.default.exam.findMany({
            include: { subject: true, topic: true }
        });
        res.json(exams);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
};
exports.getExams = getExams;
const createExam = async (req, res) => {
    try {
        const { title, description, instructions, subjectId, topicId, creatorId, startDate, endDate, durationMins, passingMarks, maxAttempts, questionIds } = req.body;
        const exam = await prisma_1.default.exam.create({
            data: {
                title, description, instructions, subjectId, topicId,
                creatorId, startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                durationMins, passingMarks, maxAttempts,
                questions: {
                    create: questionIds.map((qId, index) => ({
                        questionId: qId,
                        order: index
                    }))
                }
            },
            include: { questions: true }
        });
        res.status(201).json(exam);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create exam' });
    }
};
exports.createExam = createExam;
const updateExam = async (req, res) => {
    try {
        const id = req.params.id;
        const { title, description, instructions, subjectId, topicId, startDate, endDate, durationMins, passingMarks, maxAttempts } = req.body;
        const exam = await prisma_1.default.exam.update({
            where: { id },
            data: {
                title, description, instructions, subjectId, topicId,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                durationMins, passingMarks, maxAttempts
            }
        });
        res.json(exam);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update exam' });
    }
};
exports.updateExam = updateExam;
const deleteExam = async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.exam.delete({ where: { id } });
        res.json({ message: 'Exam deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete exam' });
    }
};
exports.deleteExam = deleteExam;
const saveAnswer = async (req, res) => {
    try {
        const { attemptId, questionId, selectedOptionId, textAnswer } = req.body;
        // Upsert the answer (if already answered, update it)
        const existing = await prisma_1.default.studentAnswer.findFirst({
            where: { attemptId, questionId }
        });
        let answer;
        if (existing) {
            answer = await prisma_1.default.studentAnswer.update({
                where: { id: existing.id },
                data: { selectedOptionId, textAnswer }
            });
        }
        else {
            answer = await prisma_1.default.studentAnswer.create({
                data: { attemptId, questionId, selectedOptionId, textAnswer }
            });
        }
        res.json(answer);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save answer' });
    }
};
exports.saveAnswer = saveAnswer;
const submitExam = async (req, res) => {
    try {
        const { attemptId } = req.body;
        // Fetch attempt with answers and the actual exam questions/options
        const attempt = await prisma_1.default.examAttempt.findUnique({
            where: { id: attemptId },
            include: {
                answers: true,
                exam: {
                    include: {
                        questions: {
                            include: { question: { include: { options: true } } }
                        }
                    }
                }
            }
        });
        if (!attempt) {
            res.status(404).json({ error: 'Attempt not found' });
            return;
        }
        let totalScore = 0;
        let correctCount = 0;
        let wrongCount = 0;
        let skippedCount = 0;
        let negativeMarks = 0;
        const questionMap = new Map();
        attempt.exam.questions.forEach(eq => {
            questionMap.set(eq.question.id, eq.question);
        });
        // Evaluate answers
        for (const answer of attempt.answers) {
            const question = questionMap.get(answer.questionId);
            if (!question)
                continue;
            if (!answer.selectedOptionId && !answer.textAnswer) {
                skippedCount++;
                continue;
            }
            // Auto evaluate MCQ
            if (question.type === 'MCQ') {
                const correctOption = question.options.find((o) => o.isCorrect);
                if (correctOption && answer.selectedOptionId === correctOption.id) {
                    correctCount++;
                    totalScore += question.marks;
                }
                else {
                    wrongCount++;
                    negativeMarks += question.negativeMarks;
                    totalScore -= question.negativeMarks;
                }
            }
            else {
                // Assume manual evaluation for others right now, or basic text match
                skippedCount++; // Placeholder
            }
        }
        // Finalize score calculation
        const totalQuestions = attempt.exam.questions.length;
        skippedCount = totalQuestions - correctCount - wrongCount;
        const accuracy = correctCount > 0 ? (correctCount / (correctCount + wrongCount)) * 100 : 0;
        const timeTakenSecs = Math.floor((new Date().getTime() - attempt.startTime.getTime()) / 1000);
        const maxScore = attempt.exam.questions.reduce((sum, eq) => sum + eq.question.marks, 0);
        const isPassed = (totalScore / maxScore) * 100 >= attempt.exam.passingMarks;
        const result = await prisma_1.default.result.create({
            data: {
                attemptId,
                totalScore,
                correctCount,
                wrongCount,
                skippedCount,
                negativeMarks,
                timeTakenSecs,
                accuracy,
                grade: isPassed ? 'PASS' : 'FAIL'
            }
        });
        await prisma_1.default.examAttempt.update({
            where: { id: attemptId },
            data: { status: 'COMPLETED', endTime: new Date(), score: totalScore, isPassed }
        });
        res.json(result);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to submit exam' });
    }
};
exports.submitExam = submitExam;
const generateCertificate = async (req, res) => {
    try {
        const attemptId = req.params.attemptId;
        const attempt = await prisma_1.default.examAttempt.findUnique({
            where: { id: attemptId },
            include: {
                student: { include: { profile: true } },
                exam: true,
                result: true
            }
        });
        if (!attempt || !attempt.result || attempt.result.grade === 'FAIL') {
            res.status(400).json({ error: 'Certificate not available or exam failed' });
            return;
        }
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({
            layout: 'landscape',
            size: 'A4',
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=certificate-${attemptId}.pdf`);
        doc.pipe(res);
        // Draw border
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();
        doc.font('Helvetica-Bold').fontSize(40).text('CERTIFICATE OF COMPLETION', 0, 150, { align: 'center' });
        doc.moveDown();
        doc.font('Helvetica').fontSize(20).text('This is to certify that', { align: 'center' });
        doc.moveDown();
        const studentName = attempt.student.profile?.name || attempt.student.email;
        doc.font('Helvetica-Bold').fontSize(30).text(studentName, { align: 'center' });
        doc.moveDown();
        doc.font('Helvetica').fontSize(20).text(`has successfully completed the exam`, { align: 'center' });
        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(25).text(`${attempt.exam.title}`, { align: 'center' });
        doc.moveDown();
        doc.font('Helvetica').fontSize(16).text(`Score: ${attempt.result.totalScore} | Accuracy: ${attempt.result.accuracy.toFixed(2)}%`, { align: 'center' });
        const dateStr = (attempt.endTime || attempt.startTime).toLocaleDateString();
        doc.font('Helvetica').fontSize(16).text(`Date: ${dateStr}`, 50, 450);
        doc.font('Helvetica').fontSize(16).text(`QuizMaster Pro`, doc.page.width - 200, 450);
        doc.end();
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate certificate' });
    }
};
exports.generateCertificate = generateCertificate;
const getAllResults = async (req, res) => {
    try {
        const results = await prisma_1.default.result.findMany({
            include: {
                attempt: {
                    include: {
                        student: { include: { profile: true } },
                        exam: true
                    }
                }
            }
        });
        res.json(results);
    }
    catch (error) {
        console.error('Get all results error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAllResults = getAllResults;
const addQuestionToExam = async (req, res) => {
    try {
        const examId = req.params.examId;
        const { text, type, difficulty, marks, negativeMarks, options } = req.body;
        // First, find the current max order for this exam's questions
        const existingQuestions = await prisma_1.default.examQuestion.findMany({
            where: { examId },
            orderBy: { order: 'desc' },
            take: 1
        });
        const nextOrder = existingQuestions.length > 0 ? existingQuestions[0].order + 1 : 0;
        const question = await prisma_1.default.question.create({
            data: {
                text,
                type: type || 'MCQ',
                difficulty: difficulty || 'MEDIUM',
                marks: marks || 1,
                negativeMarks: negativeMarks || 0,
                options: {
                    create: options.map((opt) => ({
                        text: opt.text,
                        isCorrect: opt.isCorrect || false
                    }))
                },
                exams: {
                    create: {
                        examId,
                        order: nextOrder
                    }
                }
            },
            include: { options: true }
        });
        res.status(201).json(question);
    }
    catch (error) {
        console.error('Add question error:', error);
        res.status(500).json({ error: 'Failed to add question' });
    }
};
exports.addQuestionToExam = addQuestionToExam;
const deleteQuestion = async (req, res) => {
    try {
        const questionId = req.params.questionId;
        await prisma_1.default.question.delete({ where: { id: questionId } });
        res.json({ message: 'Question deleted' });
    }
    catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({ error: 'Failed to delete question' });
    }
};
exports.deleteQuestion = deleteQuestion;
//# sourceMappingURL=examController.js.map