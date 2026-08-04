"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentDashboard = exports.updateStudentProfile = exports.getStudentProfile = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const profileInput_1 = require("../utils/profileInput");
const getStudentProfile = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const user = await prisma_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Get student profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getStudentProfile = getStudentProfile;
const updateStudentProfile = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = (0, profileInput_1.sanitizeProfileInput)(req.body);
        if (Object.keys(data).length === 0) {
            res.status(400).json({ error: 'No valid profile fields supplied' });
            return;
        }
        const profile = await prisma_1.default.profile.upsert({
            where: { userId },
            update: data,
            create: {
                userId,
                ...data,
            },
        });
        await prisma_1.default.activityLog.create({
            data: {
                userId,
                action: 'Updated Profile',
                module: 'Profile',
                ipAddress: req.ip
            }
        });
        res.json(profile);
    }
    catch (error) {
        console.error('Update student profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateStudentProfile = updateStudentProfile;
const getStudentDashboard = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const completedExams = await prisma_1.default.examAttempt.count({
            where: { studentId: userId, status: 'COMPLETED' }
        });
        const pendingExams = await prisma_1.default.examAttempt.count({
            where: { studentId: userId, status: 'IN_PROGRESS' }
        });
        const results = await prisma_1.default.result.findMany({
            where: { attempt: { studentId: userId } }
        });
        let totalScore = 0;
        let totalAccuracy = 0;
        if (results.length > 0) {
            totalScore = results.reduce((acc, r) => acc + r.totalScore, 0);
            totalAccuracy = results.reduce((acc, r) => acc + r.accuracy, 0) / results.length;
        }
        const user = userId ? await prisma_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Get student dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getStudentDashboard = getStudentDashboard;
