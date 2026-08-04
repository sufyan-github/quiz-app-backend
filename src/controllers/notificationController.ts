import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';
import { realtimeService } from '../services/realtimeService';

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

      realtimeService.emit('notifications', 'notification_created', { target: 'all' });

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
    realtimeService.emit('notifications', 'notification_created', { notification }, userId);

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
          select: { id: true, email: true, mobile: true, role: true, profile: true }
        },
      }
    });
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMyNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: notifications });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

export const markMyNotificationRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const id = req.params.id as string;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const result = await prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
  if (result.count === 0) { res.status(404).json({ success: false, message: 'Notification not found' }); return; }
  realtimeService.emit('notifications', 'notification_updated', { notificationId: id, isRead: true }, userId);
  res.json({ success: true });
};

export const markAllMyNotificationsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const result = await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  realtimeService.emit('notifications', 'notifications_read', { count: result.count }, userId);
  res.json({ success: true, data: { updated: result.count } });
};

export const deleteMyNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const id = req.params.id as string;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const result = await prisma.notification.deleteMany({ where: { id, userId } });
  if (result.count === 0) { res.status(404).json({ success: false, message: 'Notification not found' }); return; }
  realtimeService.emit('notifications', 'notification_deleted', { notificationId: id }, userId);
  res.json({ success: true });
};
