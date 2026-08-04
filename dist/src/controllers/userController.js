"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserDetails = exports.getAllUsers = exports.getProfile = exports.updateProfile = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const profileInput_1 = require("../utils/profileInput");
const updateProfile = async (req, res) => {
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
        res.json(profile);
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateProfile = updateProfile;
const getProfile = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const user = await prisma_1.default.user.findUnique({
            where: { id: userId },
            select: { email: true, role: true, profile: true }
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            email: user.email,
            role: user.role,
            profile: user.profile
        });
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getProfile = getProfile;
const getAllUsers = async (req, res) => {
    try {
        const users = await prisma_1.default.user.findMany({
            where: { deletedAt: null },
            include: { profile: true },
            orderBy: { createdAt: 'desc' }
        });
        // Don't send passwords
        const sanitizedUsers = users.map(user => ({
            id: user.id,
            email: user.email,
            mobile: user.mobile,
            role: user.role,
            subscription_status: user.subscription_status,
            xp: user.xp,
            coins: user.coins,
            profile: user.profile,
            createdAt: user.createdAt
        }));
        res.json(sanitizedUsers);
    }
    catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAllUsers = getAllUsers;
const getUserDetails = async (req, res) => {
    try {
        const id = req.params.id;
        const user = await prisma_1.default.user.findUnique({
            where: { id },
            include: {
                profile: true,
                attempts: {
                    include: {
                        exam: true,
                        result: true
                    }
                }
            }
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            id: user.id,
            email: user.email,
            role: user.role,
            profile: user.profile,
            examAttempts: user.attempts,
            createdAt: user.createdAt
        });
    }
    catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getUserDetails = getUserDetails;
