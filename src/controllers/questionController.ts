import { Request, Response } from 'express';
import prisma from '../prisma';

export const getQuestions = async (req: Request, res: Response) => {
  try {
    const questions = await prisma.question.findMany({
      include: { options: true, subject: true, topic: true }
    });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
};

export const createQuestion = async (req: Request, res: Response) => {
  try {
    const { text, type, difficulty, marks, negativeMarks, explanation, hint, subjectId, topicId, options } = req.body;
    
    const question = await prisma.question.create({
      data: {
        text,
        type,
        difficulty,
        marks,
        negativeMarks,
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
    
    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create question' });
  }
};

export const deleteQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Delete related options first
    await prisma.option.deleteMany({
      where: { questionId: id }
    });
    
    // Then delete question
    await prisma.question.delete({
      where: { id }
    });
    
    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
};
