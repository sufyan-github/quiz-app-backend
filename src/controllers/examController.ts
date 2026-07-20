import { Request, Response } from 'express';
import prisma from '../prisma';

export const getExams = async (req: Request, res: Response) => {
  try {
    const exams = await prisma.exam.findMany({
      include: { subject: true, topic: true }
    });
    res.json(exams);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch exams' });
  }
};

export const createExam = async (req: Request, res: Response) => {
  try {
    const { 
      title, description, instructions, subjectId, topicId, 
      creatorId, startDate, endDate, durationMins, passingMarks, 
      maxAttempts, questionIds 
    } = req.body;
    
    const exam = await prisma.exam.create({
      data: {
        title, description, instructions, subjectId, topicId,
        creatorId, startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        durationMins, passingMarks, maxAttempts,
        questions: {
          create: questionIds.map((qId: string, index: number) => ({
            questionId: qId,
            order: index
          }))
        }
      },
      include: { questions: true }
    });
    
    res.status(201).json(exam);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create exam' });
  }
};

export const updateExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      title, description, instructions, subjectId, topicId, 
      startDate, endDate, durationMins, passingMarks, maxAttempts 
    } = req.body;
    
    const exam = await prisma.exam.update({
      where: { id },
      data: {
        title, description, instructions, subjectId, topicId,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        durationMins, passingMarks, maxAttempts
      }
    });
    
    res.json(exam);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update exam' });
  }
};

export const deleteExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.exam.delete({ where: { id } });
    res.json({ message: 'Exam deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete exam' });
  }
};

export const saveAnswer = async (req: Request, res: Response) => {
  try {
    const { attemptId, questionId, selectedOptionId, textAnswer } = req.body;
    
    // Upsert the answer (if already answered, update it)
    const existing = await prisma.studentAnswer.findFirst({
      where: { attemptId, questionId }
    });
    
    let answer;
    if (existing) {
      answer = await prisma.studentAnswer.update({
        where: { id: existing.id },
        data: { selectedOptionId, textAnswer }
      });
    } else {
      answer = await prisma.studentAnswer.create({
        data: { attemptId, questionId, selectedOptionId, textAnswer }
      });
    }
    
    res.json(answer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save answer' });
  }
};

export const submitExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.body;
    
    // Fetch attempt with answers and the actual exam questions/options
    const attempt = await prisma.examAttempt.findUnique({
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
      if (!question) continue;
      
      if (!answer.selectedOptionId && !answer.textAnswer) {
        skippedCount++;
        continue;
      }
      
      // Auto evaluate MCQ
      if (question.type === 'MCQ') {
        const correctOption = question.options.find((o: any) => o.isCorrect);
        if (correctOption && answer.selectedOptionId === correctOption.id) {
          correctCount++;
          totalScore += question.marks;
        } else {
          wrongCount++;
          negativeMarks += question.negativeMarks;
          totalScore -= question.negativeMarks;
        }
      } else {
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
    
    const result = await prisma.result.create({
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
    
    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: { status: 'COMPLETED', endTime: new Date(), score: totalScore, isPassed }
    });
    
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit exam' });
  }
};

export const generateCertificate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { attemptId } = req.params;
    
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        user: true,
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
    
    doc.font('Helvetica-Bold').fontSize(30).text(`${attempt.user.firstName} ${attempt.user.lastName}`, { align: 'center' });
    doc.moveDown();
    
    doc.font('Helvetica').fontSize(20).text(`has successfully completed the exam`, { align: 'center' });
    doc.moveDown();
    
    doc.font('Helvetica-Bold').fontSize(25).text(`${attempt.exam.title}`, { align: 'center' });
    doc.moveDown();
    
    doc.font('Helvetica').fontSize(16).text(`Score: ${attempt.result.totalScore} | Accuracy: ${attempt.result.accuracy.toFixed(2)}%`, { align: 'center' });
    
    const dateStr = attempt.result.createdAt.toLocaleDateString();
    doc.font('Helvetica').fontSize(16).text(`Date: ${dateStr}`, 50, 450);
    doc.font('Helvetica').fontSize(16).text(`QuizMaster Pro`, doc.page.width - 200, 450);
    
    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
};

export const getAllResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const results = await prisma.result.findMany({
      include: {
        attempt: {
          include: {
            user: true,
            exam: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(results);
  } catch (error) {
    console.error('Get all results error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addQuestionToExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const { text, type, difficulty, marks, negativeMarks, options } = req.body;
    
    // First, find the current max order for this exam's questions
    const existingQuestions = await prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { order: 'desc' },
      take: 1
    });
    
    const nextOrder = existingQuestions.length > 0 ? existingQuestions[0].order + 1 : 0;
    
    const question = await prisma.question.create({
      data: {
        text,
        type: type || 'MCQ',
        difficulty: difficulty || 'MEDIUM',
        marks: marks || 1,
        negativeMarks: negativeMarks || 0,
        options: {
          create: options.map((opt: any) => ({
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
  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({ error: 'Failed to add question' });
  }
};

export const deleteQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { questionId } = req.params;
    await prisma.question.delete({ where: { id: questionId } });
    res.json({ message: 'Question deleted' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
};
