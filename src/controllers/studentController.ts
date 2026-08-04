import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';
import { sanitizeProfileInput } from '../utils/profileInput';
import type { Prisma } from '@prisma/client';

export const getStudentProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        mobile: true,
        role: true,
        subscription_status: true,
        coins: true,
        xp: true,
        level: true,
        streak: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
        settings: true,
        achievements: { include: { achievement: true } },
      },
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

    const data = sanitizeProfileInput(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No valid profile fields supplied' });
      return;
    }
    
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: data as Prisma.ProfileUncheckedUpdateInput,
      create: {
        userId,
        ...data,
      } as Prisma.ProfileUncheckedCreateInput,
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

    const user = userId ? await prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, coins: true, streak: true },
    }) : null;

    res.json({
      summary: {
        completedExams,
        pendingExams,
        averageScore: results.length > 0 ? (totalScore / results.length).toFixed(2) : 0,
        overallAccuracy: totalAccuracy.toFixed(2),
        xpPoints: user?.xp ?? 0,
        coins: user?.coins ?? 0,
        currentStreak: user?.streak ?? 0,
      }
    });
  } catch (error) {
    console.error('Get student dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
