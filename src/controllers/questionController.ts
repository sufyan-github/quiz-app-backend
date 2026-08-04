import { Request, Response } from 'express';
import prisma from '../prisma';
import { realtimeService } from '../services/realtimeService';
import { AuthRequest } from '../middleware/authMiddleware';

const QUESTION_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'PRIVATE', 'ARCHIVED']);

export const getQuestions = async (req: Request, res: Response) => {
  try {
    const questions = await prisma.question.findMany({
      include: { options: true, subject: true, topic: true },
      orderBy: { text: 'asc' }
    });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
};

export const createQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const { text, type, difficulty, marks, negativeMarks, language, explanation, hint, subjectId, topicId, options } = req.body;
    const status = QUESTION_STATUSES.has(req.body.status) ? req.body.status : 'DRAFT';
    
    if (!text || !Array.isArray(options) || options.length < 2 || options.filter((option: any) => option?.isCorrect === true).length !== 1) {
      res.status(400).json({ error: 'A question needs text, at least two options, and exactly one correct option.' });
      return;
    }

    const question = await prisma.question.create({
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
        status,
        createdById: req.user?.userId,
        options: {
          create: options // expects an array of { text, isCorrect }
        }
      },
      include: { options: true }
    });

    realtimeService.emit('questions', 'question_created', { questionId: question.id });
    
    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create question' });
  }
};

export const deleteQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    
    const answerCount = await prisma.studentAnswer.count({ where: { questionId: id } });
    if (answerCount > 0) {
      res.status(409).json({ error: 'This question has attempt history and cannot be deleted. Archive support is required instead.' });
      return;
    }

    await prisma.$transaction([
      prisma.option.deleteMany({ where: { questionId: id } }),
      prisma.examQuestion.deleteMany({ where: { questionId: id } }),
      prisma.question.delete({ where: { id } }),
    ]);

    realtimeService.emit('questions', 'question_deleted', { id });
    
    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
};

export const updateQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { text, type, difficulty, marks, negativeMarks, language, explanation, hint, subjectId, topicId, options } = req.body;
    const status = req.body.status === undefined
      ? undefined
      : (QUESTION_STATUSES.has(req.body.status) ? req.body.status : null);
    if (status === null) {
      res.status(400).json({ error: 'Invalid question status' });
      return;
    }

    if (Array.isArray(options) && (options.length < 2 || options.filter((option: any) => option?.isCorrect === true).length !== 1)) {
      res.status(400).json({ error: 'A question needs at least two options and exactly one correct option.' });
      return;
    }

    if (Array.isArray(options)) {
      const answerCount = await prisma.studentAnswer.count({ where: { questionId: id } });
      if (answerCount > 0) {
        res.status(409).json({ error: 'Options cannot be replaced after students have answered this question.' });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: { text, type, difficulty, marks, negativeMarks, language: language || 'english', explanation, hint, subjectId, topicId, status },
      });

      if (Array.isArray(options)) {
        await tx.option.deleteMany({ where: { questionId: id } });
        await tx.option.createMany({
          data: options.map((opt: any) => ({ text: opt.text, isCorrect: !!opt.isCorrect, questionId: id })),
        });
      }
    });

    const updatedQuestion = await prisma.question.findUnique({
      where: { id },
      include: { options: true }
    });

    realtimeService.emit('questions', 'question_updated', { questionId: id });

    res.json(updatedQuestion);
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
};

export const archiveQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const question = await prisma.question.update({ where: { id }, data: { status: 'ARCHIVED' } });
    realtimeService.emit('questions', 'question_archived', { questionId: id });
    res.json({ success: true, data: { id: question.id, status: question.status } });
  } catch {
    res.status(404).json({ error: 'Question not found' });
  }
};

export const importQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { csvText } = req.body;
    if (!csvText) {
      res.status(400).json({ error: 'csvText is required' });
      return;
    }

    const lines = csvText.split('\n').filter((l: string) => l.trim().length > 0);
    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV file is empty or missing headers' });
      return;
    }

    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const headers = parseCSVLine(lines[0] || '').map((h) => h.toLowerCase());
    const importedQuestions = [];

    // Let's find first default subject/topic in database to fallback on
    const defaultTopic = await prisma.topic.findFirst();
    const defaultSubject = await prisma.subject.findFirst();

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i] || '');
      if (values.length < headers.length) continue;

      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header && values[index] !== undefined) {
          row[header] = values[index];
        }
      });

      const text = row['text'] || '';
      const difficulty = (row['difficulty'] || 'MEDIUM').toUpperCase() as any;
      const explanation = row['explanation'] || '';
      const topicName = row['topicname'] || '';
      const language = (row['language'] || 'english').toLowerCase();

      if (!text) continue;

      // Find or create topic if topicName is provided
      let topicId = defaultTopic?.id || null;
      let subjectId = defaultSubject?.id || null;

      if (topicName) {
        let topic = await prisma.topic.findFirst({
          where: { name: { equals: topicName, mode: 'insensitive' } }
        });

        if (!topic && defaultSubject) {
          topic = await prisma.topic.create({
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

      if (optionsData.length === 0) continue;

      const question = await prisma.question.create({
        data: {
          text,
          type: 'MCQ',
          difficulty,
          marks: 5,
          language: language,
          explanation,
          status: 'DRAFT',
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
  } catch (error) {
    console.error('Import questions error:', error);
    res.status(500).json({ error: 'Failed to import questions' });
  }
};
