import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';

export const sendNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, message, target, userId } = req.body;
    const adminId = req.user?.userId;

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!title || !message) {
      res.status(400).json({ error: 'Title and message are required' });
      return;
    }

    if (target === 'all') {
      const students = await prisma.user.findMany({
        where: { role: 'STUDENT' }
      });

      await prisma.notification.createMany({
        data: students.map(s => ({
          userId: s.id,
          title,
          message
        }))
      });

      // Log activity
      await prisma.activityLog.create({
        data: {
          userId: adminId,
          action: 'Broadcasted Notification',
          module: 'Notification',
          ipAddress: req.ip
        }
      });

      res.status(201).json({ success: true, message: `Notification broadcasted to ${students.length} users.` });
      return;
    }

    if (!userId) {
      res.status(400).json({ error: 'User ID is required for targeted notification' });
      return;
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: adminId,
        action: `Sent Notification to User ${userId}`,
        module: 'Notification',
        ipAddress: req.ip
      }
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          include: { profile: true }
        }
      }
    });
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
