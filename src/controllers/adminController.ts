import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';

export const getAdminProfile = async (req: AuthRequest, res: Response): Promise<void> => {
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
        settings: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAdminProfile = async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Log Activity
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
    console.error('Update admin profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Generate dashboard summary data
    const totalStudents = await prisma.user.count({ where: { role: 'STUDENT' } });
    const totalTeachers = await prisma.user.count({ where: { role: 'INSTRUCTOR' } });
    const totalExams = await prisma.exam.count();
    const totalQuestions = await prisma.question.count();
    
    // Recent activity
    const recentActivity = await prisma.activityLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: { include: { profile: true } } }
    });

    res.json({
      summary: {
        totalStudents,
        totalTeachers,
        totalExams,
        totalQuestions
      },
      recentActivity
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminActivityLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { include: { profile: true } } }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
