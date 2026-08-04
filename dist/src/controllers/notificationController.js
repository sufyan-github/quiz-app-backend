"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMyNotification = exports.markAllMyNotificationsRead = exports.markMyNotificationRead = exports.getMyNotifications = exports.getNotifications = exports.sendNotification = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const realtimeService_1 = require("../services/realtimeService");
const sendNotification = async (req, res) => {
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
            const students = await prisma_1.default.user.findMany({
                where: { role: 'STUDENT' }
            });
            await prisma_1.default.notification.createMany({
                data: students.map(s => ({
                    userId: s.id,
                    title,
                    message
                }))
            });
            realtimeService_1.realtimeService.emit('notifications', 'notification_created', { target: 'all' });
            // Log activity
            await prisma_1.default.activityLog.create({
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
        const notification = await prisma_1.default.notification.create({
            data: {
                userId,
                title,
                message
            }
        });
        realtimeService_1.realtimeService.emit('notifications', 'notification_created', { notification }, userId);
        // Log activity
        await prisma_1.default.activityLog.create({
            data: {
                userId: adminId,
                action: `Sent Notification to User ${userId}`,
                module: 'Notification',
                ipAddress: req.ip
            }
        });
        res.status(201).json(notification);
    }
    catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.sendNotification = sendNotification;
const getNotifications = async (req, res) => {
    try {
        const notifications = await prisma_1.default.notification.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { id: true, email: true, mobile: true, role: true, profile: true }
                },
            }
        });
        res.json(notifications);
    }
    catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getNotifications = getNotifications;
const getMyNotifications = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }
    try {
        const notifications = await prisma_1.default.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json({ success: true, data: notifications });
    }
    catch {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
};
exports.getMyNotifications = getMyNotifications;
const markMyNotificationRead = async (req, res) => {
    const userId = req.user?.userId;
    const id = req.params.id;
    if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }
    const result = await prisma_1.default.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    if (result.count === 0) {
        res.status(404).json({ success: false, message: 'Notification not found' });
        return;
    }
    realtimeService_1.realtimeService.emit('notifications', 'notification_updated', { notificationId: id, isRead: true }, userId);
    res.json({ success: true });
};
exports.markMyNotificationRead = markMyNotificationRead;
const markAllMyNotificationsRead = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }
    const result = await prisma_1.default.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    realtimeService_1.realtimeService.emit('notifications', 'notifications_read', { count: result.count }, userId);
    res.json({ success: true, data: { updated: result.count } });
};
exports.markAllMyNotificationsRead = markAllMyNotificationsRead;
const deleteMyNotification = async (req, res) => {
    const userId = req.user?.userId;
    const id = req.params.id;
    if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }
    const result = await prisma_1.default.notification.deleteMany({ where: { id, userId } });
    if (result.count === 0) {
        res.status(404).json({ success: false, message: 'Notification not found' });
        return;
    }
    realtimeService_1.realtimeService.emit('notifications', 'notification_deleted', { notificationId: id }, userId);
    res.json({ success: true });
};
exports.deleteMyNotification = deleteMyNotification;
