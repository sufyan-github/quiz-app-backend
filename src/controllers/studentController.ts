import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';

export const getStudentProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        profile: true,
        settings: true,
        achievements: { include: { achievement: true } }
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Get student profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateStudentProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = req.body;
    
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      }
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'Updated Profile',
        module: 'Profile',
        ipAddress: req.ip
      }
    });

    res.json(profile);
  } catch (error) {
    console.error('Update student profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getStudentDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    
    const completedExams = await prisma.examAttempt.count({
      where: { studentId: userId, status: 'COMPLETED' }
    });
    
    const pendingExams = await prisma.examAttempt.count({
      where: { studentId: userId, status: 'IN_PROGRESS' }
    });
    
    const results = await prisma.result.findMany({
      where: { attempt: { studentId: userId } }
    });
    
    let totalScore = 0;
    let totalAccuracy = 0;
    if (results.length > 0) {
      totalScore = results.reduce((acc, r) => acc + r.totalScore, 0);
      totalAccuracy = results.reduce((acc, r) => acc + r.accuracy, 0) / results.length;
    }

    // Dummy values for XP, Coins, Streak for now (would be calculated or stored in DB in real app)
    const xpPoints = completedExams * 50;
    const coins = completedExams * 10;
    const currentStreak = 3;

    res.json({
      summary: {
        completedExams,
        pendingExams,
        averageScore: results.length > 0 ? (totalScore / results.length).toFixed(2) : 0,
        overallAccuracy: totalAccuracy.toFixed(2),
        xpPoints,
        coins,
        currentStreak
      }
    });
  } catch (error) {
    console.error('Get student dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
