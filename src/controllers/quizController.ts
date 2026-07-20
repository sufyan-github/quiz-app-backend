import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { prisma } from '../prisma';

export const quizController = {
  
  /**
   * Fetch categories and topics for the dashboard
   */
  async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      const categories = await prisma.category.findMany({
        include: {
          subjects: {
            include: {
              topics: true
            }
          }
        }
      });
      res.json({ success: true, data: categories });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to fetch categories' });
    }
  },

  /**
   * Generate a quiz session of N questions for a specific topic
   */
  async generateQuiz(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { topicId, limit = 10 } = req.query;
      
      if (!topicId) {
        res.status(400).json({ success: false, message: 'topicId is required' });
        return;
      }

      // Fetch random questions for the topic
      // PostgreSQL random ordering: query all and shuffle in memory or raw query.
      // Since it's an MVP, we'll fetch all and shuffle.
      const allQuestions = await prisma.question.findMany({
        where: { topicId: String(topicId) },
        include: {
          options: {
            select: {
              id: true,
              text: true,
              // don't send isCorrect to the client!
            }
          }
        }
      });

      if (allQuestions.length === 0) {
        res.status(404).json({ success: false, message: 'No questions found for this topic' });
        return;
      }

      // Shuffle and pick limit
      const shuffled = allQuestions.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, Number(limit));

      res.json({
        success: true,
        data: selected
      });

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to generate quiz' });
    }
  },

  /**
   * Submit quiz answers, calculate score, XP, and coins
   */
  async submitQuiz(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { answers } = req.body; 
      // Expected format: { questionId: string, optionId: string }[]

      if (!Array.isArray(answers)) {
        res.status(400).json({ success: false, message: 'Invalid answers format' });
        return;
      }

      let correctCount = 0;
      let totalMarks = 0;

      // Evaluate answers
      for (const ans of answers) {
        const option = await prisma.option.findUnique({
          where: { id: ans.optionId },
          include: { question: true }
        });

        if (option && option.isCorrect && option.questionId === ans.questionId) {
          correctCount++;
          totalMarks += option.question.marks;
        }
      }

      // Calculate Gamification Rewards
      // E.g., 10 XP per correct answer, 5 coins per correct answer
      const xpEarned = correctCount * 10;
      const coinsEarned = correctCount * 5;

      // Update User Stats
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          xp: { increment: xpEarned },
          coins: { increment: coinsEarned }
        }
      });

      // Level up logic (every 100 XP = 1 level)
      const newLevel = Math.floor(user.xp / 100) + 1;
      if (newLevel > user.level) {
        await prisma.user.update({
          where: { id: userId },
          data: { level: newLevel }
        });
      }

      res.json({
        success: true,
        data: {
          score: totalMarks,
          correctAnswers: correctCount,
          totalQuestions: answers.length,
          xpEarned,
          coinsEarned,
          newLevel: newLevel > user.level ? newLevel : null
        }
      });

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to submit quiz' });
    }
  },

  /**
   * Get user dashboard stats
   */
  async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          mobile: true,
          xp: true,
          coins: true,
          level: true,
          streak: true,
          subscription_status: true
        }
      });

      res.json({ success: true, data: user });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to fetch dashboard' });
    }
  },

  /**
   * Get global leaderboard
   */
  async getLeaderboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const topUsers = await prisma.user.findMany({
        orderBy: { xp: 'desc' },
        take: 50,
        select: {
          id: true,
          mobile: true,
          xp: true,
          level: true
        }
      });

      // Mask mobile numbers for privacy
      const maskedUsers = topUsers.map(u => ({
        ...u,
        mobile: u.mobile ? u.mobile.substring(0, 5) + '***' + u.mobile.substring(u.mobile.length - 3) : 'Unknown'
      }));

      res.json({ success: true, data: maskedUsers });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
    }
  },

  /**
   * Seed the database with sample categories and questions
   */
  async seedData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const category = await prisma.category.create({
        data: { name: 'Programming', description: 'Test your coding skills' }
      });
      const subject = await prisma.subject.create({
        data: { name: 'Dart & Flutter', categoryId: category.id }
      });
      const topic = await prisma.topic.create({
        data: { name: 'Flutter Basics', subjectId: subject.id }
      });
      await prisma.question.create({
        data: {
          text: 'What language is Flutter written in?', type: 'MCQ', difficulty: 'EASY', marks: 10,
          topicId: topic.id, subjectId: subject.id,
          options: {
            create: [
              { text: 'Dart', isCorrect: true },
              { text: 'Java', isCorrect: false },
              { text: 'Swift', isCorrect: false },
            ]
          }
        }
      });
      await prisma.question.create({
        data: {
          text: 'Which widget is used for a scrollable list in Flutter?', type: 'MCQ', difficulty: 'MEDIUM', marks: 10,
          topicId: topic.id, subjectId: subject.id,
          options: {
            create: [
              { text: 'Column', isCorrect: false },
              { text: 'ListView', isCorrect: true },
              { text: 'Container', isCorrect: false },
            ]
          }
        }
      });
      res.json({ success: true, message: 'Database seeded successfully' });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to seed' });
    }
  }
};
