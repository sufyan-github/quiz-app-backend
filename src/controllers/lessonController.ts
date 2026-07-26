import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { prisma } from '../prisma';

export const lessonController = {
  
  /**
   * Get all lessons for a specific topic
   */
  async getLessons(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { topicId } = req.query;

      if (!topicId || typeof topicId !== 'string') {
        res.status(400).json({ success: false, message: 'Topic ID is required' });
        return;
      }

      const lessons = await prisma.lesson.findMany({
        where: { topicId },
        orderBy: { order: 'asc' },
        include: { resources: true }
      });

      res.json({ success: true, data: lessons });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to fetch lessons' });
    }
  },

  /**
   * Get a specific lesson by ID
   */
  async getLesson(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const lesson = await prisma.lesson.findUnique({
        where: { id },
        include: { resources: true }
      });

      if (!lesson) {
        res.status(404).json({ success: false, message: 'Lesson not found' });
        return;
      }

      res.json({ success: true, data: lesson });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to fetch lesson' });
    }
  }
};
