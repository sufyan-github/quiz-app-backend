import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../prisma';
import { AuthRequest } from '../middleware/authMiddleware';

const EXAM_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export const getExams = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const exams = await prisma.exam.findMany({
      where: isAdmin ? undefined : { status: 'PUBLISHED' },
      include: { subject: true, topic: true, _count: { select: { questions: true, attempts: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(exams);
  } catch {
    res.status(500).json({ error: 'Failed to fetch exams' });
  }
};

export const createExam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const questionIds: string[] = Array.isArray(req.body.questionIds)
      ? req.body.questionIds.filter((id: unknown) => typeof id === 'string') as string[]
      : [];
    const uniqueQuestionIds: string[] = [...new Set<string>(questionIds)];
    if (!userId || title.length < 3 || uniqueQuestionIds.length === 0 || uniqueQuestionIds.length !== questionIds.length) {
      res.status(400).json({ error: 'A title and unique question IDs are required' });
      return;
    }

    const validQuestionCount = await prisma.question.count({
      where: { id: { in: uniqueQuestionIds }, status: { not: 'ARCHIVED' } },
    });
    if (validQuestionCount !== uniqueQuestionIds.length) {
      res.status(400).json({ error: 'One or more questions are missing or archived' });
      return;
    }

    const status = EXAM_STATUSES.has(req.body.status) ? req.body.status : 'DRAFT';
    const exam = await prisma.exam.create({
      data: {
        title,
        description: req.body.description,
        instructions: req.body.instructions,
        subjectId: req.body.subjectId || null,
        topicId: req.body.topicId || null,
        creatorId: userId,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        durationMins: boundedNumber(req.body.durationMins, 30, 1, 480),
        passingMarks: boundedNumber(req.body.passingMarks, 40, 0, 100),
        maxAttempts: req.body.maxAttempts == null ? null : boundedNumber(req.body.maxAttempts, 1, 1, 100),
        status,
        questions: {
          create: uniqueQuestionIds.map((questionId, order) => ({ questionId, order })),
        },
      },
      include: { questions: true },
    });
    res.status(201).json(exam);
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({ error: 'Failed to create exam' });
  }
};

export const updateExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const status = req.body.status === undefined
      ? undefined
      : (EXAM_STATUSES.has(req.body.status) ? req.body.status : null);
    if (status === null) {
      res.status(400).json({ error: 'Invalid exam status' });
      return;
    }

    const exam = await prisma.exam.update({
      where: { id },
      data: {
        title: req.body.title,
        description: req.body.description,
        instructions: req.body.instructions,
        subjectId: req.body.subjectId,
        topicId: req.body.topicId,
        startDate: req.body.startDate === undefined ? undefined : (req.body.startDate ? new Date(req.body.startDate) : null),
        endDate: req.body.endDate === undefined ? undefined : (req.body.endDate ? new Date(req.body.endDate) : null),
        durationMins: req.body.durationMins === undefined ? undefined : boundedNumber(req.body.durationMins, 30, 1, 480),
        passingMarks: req.body.passingMarks === undefined ? undefined : boundedNumber(req.body.passingMarks, 40, 0, 100),
        maxAttempts: req.body.maxAttempts === undefined ? undefined : (req.body.maxAttempts == null ? null : boundedNumber(req.body.maxAttempts, 1, 1, 100)),
        status: status ?? undefined,
      },
    });
    res.json(exam);
  } catch {
    res.status(404).json({ error: 'Exam not found or could not be updated' });
  }
};

export const deleteExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const exam = await prisma.exam.update({ where: { id }, data: { status: 'ARCHIVED' } });
    res.json({ message: 'Exam archived', data: { id: exam.id, status: exam.status } });
  } catch {
    res.status(404).json({ error: 'Exam not found' });
  }
};

export const startExam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const examId = req.params.id as string;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: {
            question: {
              select: {
                id: true, text: true, type: true, difficulty: true, marks: true, language: true,
                options: { select: { id: true, text: true } },
              },
            },
          },
        },
      },
    });
    const now = new Date();
    if (!exam || exam.status !== 'PUBLISHED') {
      res.status(404).json({ error: 'Exam not available' });
      return;
    }
    if ((exam.startDate && exam.startDate > now) || (exam.endDate && exam.endDate <= now)) {
      res.status(409).json({ error: 'Exam is outside its availability window' });
      return;
    }
    if (exam.questions.length === 0) {
      res.status(409).json({ error: 'Exam has no questions' });
      return;
    }

    const attemptCutoff = new Date(Date.now() - (exam.durationMins ?? 30) * 60_000 - 30_000);
    const attemptResult = await prisma.$transaction(async (tx) => {
      await tx.examAttempt.updateMany({
        where: { examId, studentId: userId, status: 'IN_PROGRESS', startTime: { lt: attemptCutoff } },
        data: { status: 'ABANDONED', endTime: now },
      });
      const completedAttempts = await tx.examAttempt.count({ where: { examId, studentId: userId, status: 'COMPLETED' } });
      if (exam.maxAttempts != null && completedAttempts >= exam.maxAttempts) throw new Error('MAX_ATTEMPTS');
      const existing = await tx.examAttempt.findFirst({
        where: { examId, studentId: userId, status: 'IN_PROGRESS', startTime: { gte: attemptCutoff } },
        orderBy: { startTime: 'desc' },
      });
      return existing
        ? { attempt: existing, existing: true }
        : { attempt: await tx.examAttempt.create({ data: { examId, studentId: userId } }), existing: false };
    }, { isolationLevel: 'Serializable' });
    res.status(attemptResult.existing ? 200 : 201).json({
      attemptId: attemptResult.attempt.id,
      startedAt: attemptResult.attempt.startTime,
      durationMins: exam.durationMins,
      questions: exam.questions.map((item) => item.question),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'MAX_ATTEMPTS') {
      res.status(409).json({ error: 'Maximum attempts reached' });
      return;
    }
    console.error('Start exam error:', error);
    res.status(500).json({ error: 'Failed to start exam' });
  }
};

export const saveAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { attemptId, questionId, selectedOptionId, textAnswer } = req.body;
    if (typeof attemptId !== 'string' || typeof questionId !== 'string') {
      res.status(400).json({ error: 'Attempt and question are required' });
      return;
    }

    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: { include: { questions: { select: { questionId: true } } } } },
    });
    if (!attempt || attempt.studentId !== req.user?.userId) {
      res.status(403).json({ error: 'Not your exam attempt' });
      return;
    }
    if (attempt.status !== 'IN_PROGRESS') {
      res.status(409).json({ error: 'Attempt is already finalized' });
      return;
    }
    const durationSecs = (attempt.exam.durationMins ?? 30) * 60;
    if (Date.now() > attempt.startTime.getTime() + durationSecs * 1000 + 30_000) {
      res.status(409).json({ error: 'Attempt time has expired' });
      return;
    }
    if (!attempt.exam.questions.some((item) => item.questionId === questionId)) {
      res.status(400).json({ error: 'Question is not part of this exam' });
      return;
    }
    if (selectedOptionId) {
      const option = await prisma.option.findFirst({ where: { id: selectedOptionId, questionId } });
      if (!option) {
        res.status(400).json({ error: 'Option does not belong to this question' });
        return;
      }
    }

    const answer = await prisma.studentAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { selectedOptionId: selectedOptionId || null, textAnswer: textAnswer || null },
      create: { attemptId, questionId, selectedOptionId: selectedOptionId || null, textAnswer: textAnswer || null },
    });
    res.json(answer);
  } catch (error) {
    console.error('Save answer error:', error);
    res.status(500).json({ error: 'Failed to save answer' });
  }
};

export const submitExam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attemptId = req.body.attemptId;
    if (typeof attemptId !== 'string') {
      res.status(400).json({ error: 'Attempt is required' });
      return;
    }
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: true,
        exam: { include: { questions: { include: { question: { include: { options: true } } } } } },
      },
    });
    if (!attempt || attempt.studentId !== req.user?.userId) {
      res.status(403).json({ error: 'Not your exam attempt' });
      return;
    }
    if (attempt.status !== 'IN_PROGRESS') {
      res.status(409).json({ error: 'Attempt is already finalized' });
      return;
    }

    const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let negativeMarks = 0;
    const answerScores: Array<{ id: string; isCorrect: boolean | null; marksAwarded: number }> = [];

    for (const item of attempt.exam.questions) {
      const question = item.question;
      const answer = answerByQuestion.get(question.id);
      if (!answer?.selectedOptionId && !answer?.textAnswer) {
        skippedCount += 1;
        continue;
      }
      if (question.type !== 'MCQ' && question.type !== 'TRUE_FALSE') {
        skippedCount += 1;
        continue;
      }
      const correctOption = question.options.find((option) => option.isCorrect);
      const isCorrect = !!correctOption && answer?.selectedOptionId === correctOption.id;
      if (isCorrect) {
        correctCount += 1;
        score += question.marks;
        if (answer) answerScores.push({ id: answer.id, isCorrect: true, marksAwarded: question.marks });
      } else {
        wrongCount += 1;
        negativeMarks += question.negativeMarks;
        score -= question.negativeMarks;
        if (answer) answerScores.push({ id: answer.id, isCorrect: false, marksAwarded: -question.negativeMarks });
      }
    }

    const maxScore = attempt.exam.questions.reduce((sum, item) => sum + item.question.marks, 0);
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const accuracy = correctCount + wrongCount > 0 ? (correctCount / (correctCount + wrongCount)) * 100 : 0;
    const isPassed = percentage >= attempt.exam.passingMarks;
    const endTime = new Date();
    const timeTakenSecs = Math.max(0, Math.floor((endTime.getTime() - attempt.startTime.getTime()) / 1000));

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.examAttempt.updateMany({
        where: { id: attemptId, studentId: req.user!.userId, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', endTime, score, isPassed },
      });
      if (claimed.count !== 1) throw new Error('ATTEMPT_ALREADY_FINALIZED');
      for (const answerScore of answerScores) {
        await tx.studentAnswer.update({
          where: { id: answerScore.id },
          data: { isCorrect: answerScore.isCorrect, marksAwarded: answerScore.marksAwarded },
        });
      }
      return tx.result.create({
        data: {
          attemptId, totalScore: score, correctCount, wrongCount, skippedCount,
          negativeMarks, timeTakenSecs, accuracy, grade: isPassed ? 'PASS' : 'FAIL',
        },
      });
    }, { isolationLevel: 'Serializable' });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'ATTEMPT_ALREADY_FINALIZED') {
      res.status(409).json({ error: 'Attempt is already finalized' });
      return;
    }
    console.error('Submit exam error:', error);
    res.status(500).json({ error: 'Failed to submit exam' });
  }
};

export const generateCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attemptId = req.params.attemptId as string;
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { student: { include: { profile: true } }, exam: true, result: true },
    });
    if (!attempt || attempt.studentId !== req.user?.userId || !attempt.result || attempt.result.grade === 'FAIL') {
      res.status(404).json({ error: 'Certificate not available' });
      return;
    }

    const doc = new PDFDocument({ layout: 'landscape', size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${attemptId}.pdf"`);
    doc.pipe(res);
    doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();
    doc.font('Helvetica-Bold').fontSize(40).text('CERTIFICATE OF COMPLETION', 0, 150, { align: 'center' });
    doc.moveDown().font('Helvetica').fontSize(20).text('This is to certify that', { align: 'center' });
    doc.moveDown().font('Helvetica-Bold').fontSize(30).text(attempt.student.profile?.name || 'Quiz AI Student', { align: 'center' });
    doc.moveDown().font('Helvetica').fontSize(20).text('has successfully completed', { align: 'center' });
    doc.moveDown().font('Helvetica-Bold').fontSize(25).text(attempt.exam.title, { align: 'center' });
    doc.moveDown().font('Helvetica').fontSize(16).text(`Score: ${attempt.result.totalScore} | Accuracy: ${attempt.result.accuracy.toFixed(2)}%`, { align: 'center' });
    doc.fontSize(16).text(`Date: ${(attempt.endTime || attempt.startTime).toLocaleDateString()}`, 50, 450);
    doc.text('Quiz AI', doc.page.width - 200, 450);
    doc.end();
  } catch (error) {
    console.error('Certificate error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate certificate' });
  }
};

export const getAllResults = async (_req: Request, res: Response): Promise<void> => {
  try {
    const results = await prisma.result.findMany({
      include: {
        attempt: {
          include: {
            student: { select: { id: true, email: true, mobile: true, profile: true } },
            exam: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });
    res.json(results);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addQuestionToExam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const examId = req.params.examId as string;
    const options = Array.isArray(req.body.options) ? req.body.options : [];
    if (typeof req.body.text !== 'string' || options.length < 2 || options.filter((option: any) => option?.isCorrect === true).length !== 1) {
      res.status(400).json({ error: 'Text, two options, and exactly one correct option are required' });
      return;
    }
    const last = await prisma.examQuestion.findFirst({ where: { examId }, orderBy: { order: 'desc' } });
    const question = await prisma.question.create({
      data: {
        text: req.body.text,
        type: req.body.type || 'MCQ',
        difficulty: req.body.difficulty || 'MEDIUM',
        marks: boundedNumber(req.body.marks, 1, 0.1, 100),
        negativeMarks: boundedNumber(req.body.negativeMarks, 0, 0, 100),
        status: 'DRAFT',
        createdById: req.user?.userId,
        options: { create: options.map((option: any) => ({ text: String(option.text || ''), isCorrect: option.isCorrect === true })) },
        examQuestions: { create: { examId, order: (last?.order ?? -1) + 1 } },
      },
      include: { options: true },
    });
    res.status(201).json(question);
  } catch (error) {
    console.error('Add exam question error:', error);
    res.status(500).json({ error: 'Failed to add question' });
  }
};

export const deleteQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const questionId = req.params.questionId as string;
    const question = await prisma.question.update({ where: { id: questionId }, data: { status: 'ARCHIVED' } });
    res.json({ message: 'Question archived', data: { id: question.id, status: question.status } });
  } catch {
    res.status(404).json({ error: 'Question not found' });
  }
};
