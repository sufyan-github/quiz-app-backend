import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { aiService } from '../services/aiService';

export const aiController = {
  
  async askAiTutor(req: AuthRequest, res: Response): Promise<void> {
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

      const answer = await aiService.askTutor(prompt, userId, topicId, lessonId);
      res.json({ success: true, data: { answer } });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to generate AI response' });
    }
  },

  async generateAiHint(req: AuthRequest, res: Response): Promise<void> {
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

      const hint = await aiService.generateHint(questionId, userId);
      res.json({ success: true, data: { hint } });
    } catch (error: any) {
      console.error(error);
      if (error.message === 'Question not found') {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Failed to generate AI hint' });
    }
  },

  async generateAiQuiz(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { topicId, difficulty, count } = req.body;
      const adminId = req.user?.userId; 

      if (!adminId || !topicId) {
        res.status(400).json({ success: false, message: 'Missing parameters' });
        return;
      }

      const generated = await aiService.generateQuiz(topicId, adminId, difficulty, count);
      res.json({ success: true, data: generated });
    } catch (error: any) {
      console.error(error);
      if (error.message === 'Topic not found') {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Failed to generate quiz via AI' });
    }
  }
};
