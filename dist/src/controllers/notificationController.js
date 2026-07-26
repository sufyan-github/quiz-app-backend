"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotifications = exports.sendNotification = void 0;
const prisma_1 = __importDefault(require("../prisma"));
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
                    include: { profile: true }
                }
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
//# sourceMappingURL=notificationController.js.map