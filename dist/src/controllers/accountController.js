"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMyAccount = exports.exportMyData = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../prisma");
const exportMyData = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
        return;
    }
    try {
        const user = await prisma_1.prisma.user.findUnique({
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
                subscriptions: true,
                userSubscriptions: { include: { plan: true } },
                transactions: true,
                examHistories: true,
                attempts: { include: { exam: { select: { id: true, title: true } }, result: true } },
                bookmarks: true,
                achievements: { include: { achievement: true } },
                notifications: true,
                aiConversations: true,
                aiFeedbacks: true,
            },
        });
        if (!user) {
            res.status(404).json({ success: false, error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' } });
            return;
        }
        res.setHeader('Content-Disposition', `attachment; filename="quiz-ai-export-${userId}.json"`);
        res.json({ exportedAt: new Date().toISOString(), product: 'Quiz AI', data: user });
    }
    catch (error) {
        console.error('[AccountExport] Failed', error);
        res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: 'Could not create the data export' } });
    }
};
exports.exportMyData = exportMyData;
const deleteMyAccount = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
        return;
    }
    if (req.body?.confirmation !== 'DELETE') {
        res.status(400).json({
            success: false,
            error: { code: 'CONFIRMATION_REQUIRED', message: 'Type DELETE to confirm permanent account deletion' },
        });
        return;
    }
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { password: true, mobile: true, deletedAt: true, subscription_status: true },
        });
        if (!user || user.deletedAt) {
            res.status(404).json({ success: false, error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' } });
            return;
        }
        // Never erase the only account-level route to cancellation while carrier
        // billing is active. The user must receive BDApps cancellation confirmation
        // first, otherwise deleting local data could leave recurring charges active.
        if (user.subscription_status === 'REGISTERED') {
            res.status(409).json({
                success: false,
                error: {
                    code: 'ACTIVE_SUBSCRIPTION',
                    message: 'Cancel the Robi/Airtel subscription and wait for confirmation before deleting the account.',
                },
            });
            return;
        }
        if (user.password) {
            const currentPassword = req.body?.currentPassword;
            if (typeof currentPassword !== 'string' || !(await bcrypt_1.default.compare(currentPassword, user.password))) {
                res.status(401).json({ success: false, error: { code: 'REAUTH_REQUIRED', message: 'Current password is required' } });
                return;
            }
        }
        const now = new Date();
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.profile.deleteMany({ where: { userId } });
            await tx.userSettings.deleteMany({ where: { userId } });
            await tx.activityLog.deleteMany({ where: { userId } });
            await tx.deviceSession.deleteMany({ where: { userId } });
            await tx.bookmark.deleteMany({ where: { userId } });
            await tx.userAchievement.deleteMany({ where: { userId } });
            await tx.notification.deleteMany({ where: { userId } });
            await tx.aiConversation.deleteMany({ where: { userId } });
            await tx.aiFeedback.deleteMany({ where: { userId } });
            await tx.studyPlanCache.deleteMany({ where: { userId } });
            await tx.guardianLink.deleteMany({ where: { userId } });
            await tx.subscription.updateMany({
                where: { subscriber_id: userId },
                data: { status: 'UNSUBSCRIBED', referenceNo: null, lastCheckedAt: now },
            });
            await tx.userSubscription.updateMany({ where: { userId }, data: { status: 'CANCELLED' } });
            await tx.webhookLog.updateMany({
                where: { subscriberId: userId },
                data: { mobile: null, rawPayload: {}, processingNote: 'Payload erased after account deletion' },
            });
            await tx.leaderboardSnapshot.updateMany({ where: { userId }, data: { mobile: 'deleted' } });
            if (user.mobile) {
                await tx.smsLog.updateMany({
                    where: { mobile: user.mobile },
                    data: { mobile: 'deleted', message: 'Erased after account deletion' },
                });
            }
            await tx.user.update({
                where: { id: userId },
                data: {
                    email: `deleted-${userId}@deleted.quizai.local`,
                    mobile: null,
                    password: null,
                    subscription_status: 'UNSUBSCRIBED',
                    role: 'STUDENT',
                    coins: 0,
                    xp: 0,
                    level: 1,
                    streak: 0,
                    deletedAt: now,
                },
            });
        }, { isolationLevel: 'Serializable' });
        res.json({
            success: true,
            message: 'Account data deleted. Financial and anti-fraud records are retained only where legally or operationally required.',
            deletedAt: now.toISOString(),
        });
    }
    catch (error) {
        console.error('[AccountDeletion] Failed', error);
        res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: 'Could not delete the account' } });
    }
};
exports.deleteMyAccount = deleteMyAccount;
