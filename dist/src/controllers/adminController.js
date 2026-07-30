"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminSubscriptionAnalytics = exports.getAdminPaymentLogs = exports.getAdminSubscriptions = exports.updateAdminSmsConfig = exports.getAdminSmsConfig = exports.createAdminCoupon = exports.getAdminCoupons = exports.deleteAdminPlan = exports.createAdminPlan = exports.getAdminPlans = exports.getAdminRevenue = exports.getAdminActivityLogs = exports.getAdminDashboard = exports.updateAdminProfile = exports.getAdminProfile = exports.createAdminUser = exports.updateUserRole = exports.getAdminUsers = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const realtimeService_1 = require("../services/realtimeService");
const getAdminUsers = async (req, res) => {
    try {
        const users = await prisma_1.default.user.findMany({
            orderBy: { createdAt: 'desc' },
            include: { profile: true }
        });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAdminUsers = getAdminUsers;
const updateUserRole = async (req, res) => {
    try {
        const id = req.params.id;
        const { role } = req.body;
        if (!['SUPER_ADMIN', 'ADMIN', 'INSTRUCTOR', 'STUDENT'].includes(role)) {
            res.status(400).json({ error: 'Invalid role' });
            return;
        }
        const updated = await prisma_1.default.user.update({
            where: { id },
            data: { role },
            include: { profile: true }
        });
        await prisma_1.default.activityLog.create({
            data: {
                userId: req.user?.userId || '',
                action: `Updated User ${updated.email} Role to ${role}`,
                module: 'UserManagement',
                ipAddress: req.ip
            }
        });
        realtimeService_1.realtimeService.emit('profile', 'user_updated', { userId: id, role, updated }, id);
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateUserRole = updateUserRole;
const createAdminUser = async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Missing parameters' });
            return;
        }
        const existingUser = await prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ error: 'User already exists' });
            return;
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const targetRole = role || 'ADMIN';
        const user = await prisma_1.default.user.create({
            data: {
                email,
                password: hashedPassword,
                role: targetRole,
                profile: {
                    create: { name: name || 'Admin User' }
                }
            },
            include: { profile: true }
        });
        await prisma_1.default.activityLog.create({
            data: {
                userId: req.user?.userId || '',
                action: `Created Admin User ${email}`,
                module: 'UserManagement',
                ipAddress: req.ip
            }
        });
        realtimeService_1.realtimeService.emit('profile', 'user_created', { user });
        res.status(201).json(user);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createAdminUser = createAdminUser;
const getAdminProfile = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const user = await prisma_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Get admin profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAdminProfile = getAdminProfile;
const updateAdminProfile = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = req.body;
        const profile = await prisma_1.default.profile.upsert({
            where: { userId },
            update: data,
            create: {
                userId,
                ...data,
            }
        });
        // Log Activity
        await prisma_1.default.activityLog.create({
            data: {
                userId,
                action: 'Updated Profile',
                module: 'Profile',
                ipAddress: req.ip
            }
        });
        realtimeService_1.realtimeService.emit('profile', 'user_updated', { userId, profile }, userId);
        res.json(profile);
    }
    catch (error) {
        console.error('Update admin profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateAdminProfile = updateAdminProfile;
const getAdminDashboard = async (req, res) => {
    try {
        // Generate dashboard summary data
        const totalStudents = await prisma_1.default.user.count({ where: { role: 'STUDENT' } });
        const totalTeachers = await prisma_1.default.user.count({ where: { role: 'INSTRUCTOR' } });
        const totalExams = await prisma_1.default.exam.count();
        const totalQuestions = await prisma_1.default.question.count();
        // Recent activity
        const recentActivity = await prisma_1.default.activityLog.findMany({
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
    }
    catch (error) {
        console.error('Get admin dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAdminDashboard = getAdminDashboard;
const getAdminActivityLogs = async (req, res) => {
    try {
        const logs = await prisma_1.default.activityLog.findMany({
            orderBy: { createdAt: 'desc' },
            include: { user: { include: { profile: true } } }
        });
        res.json(logs);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAdminActivityLogs = getAdminActivityLogs;
const getAdminRevenue = async (req, res) => {
    try {
        // Total payments
        const successfulTxns = await prisma_1.default.transaction.findMany({
            where: { status: 'SUCCESS' }
        });
        const totalRevenue = successfulTxns.reduce((sum, t) => sum + t.amount, 0);
        // SMS log counting & Cost calculations
        const smsCount = await prisma_1.default.smsLog.count();
        let smsConfig = await prisma_1.default.smsGatewayConfig.findFirst();
        if (!smsConfig) {
            smsConfig = await prisma_1.default.smsGatewayConfig.create({
                data: { provider: 'MOCK', costPerSms: 0.3 }
            });
        }
        const smsExpenditure = smsCount * smsConfig.costPerSms;
        // User breakdown
        const totalStudents = await prisma_1.default.user.count({ where: { role: 'STUDENT' } });
        const premiumCardUsers = await prisma_1.default.userSubscription.count({ where: { status: 'ACTIVE' } });
        const premiumBdaUsers = await prisma_1.default.user.count({ where: { role: 'STUDENT', subscription_status: 'REGISTERED' } });
        const activePremiumCount = premiumCardUsers + premiumBdaUsers;
        // Revenue history by months (last 6 months)
        const monthlyData = [];
        for (let i = 5; i >= 0; i--) {
            const start = new Date();
            start.setMonth(start.getMonth() - i);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            const txns = await prisma_1.default.transaction.findMany({
                where: {
                    status: 'SUCCESS',
                    createdAt: { gte: start, lt: end }
                }
            });
            const rev = txns.reduce((sum, t) => sum + t.amount, 0);
            monthlyData.push({
                month: start.toLocaleString('default', { month: 'short' }),
                revenue: rev
            });
        }
        res.json({
            summary: {
                totalRevenue,
                smsCount,
                smsExpenditure,
                activePremiumCount,
                freeUsers: Math.max(0, totalStudents - activePremiumCount)
            },
            transactions: await prisma_1.default.transaction.findMany({
                orderBy: { createdAt: 'desc' },
                take: 30,
                include: { user: { include: { profile: true } } }
            }),
            monthlyData
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAdminRevenue = getAdminRevenue;
const getAdminPlans = async (req, res) => {
    try {
        const plans = await prisma_1.default.subscriptionPlan.findMany({
            orderBy: { price: 'asc' }
        });
        res.json(plans);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAdminPlans = getAdminPlans;
const createAdminPlan = async (req, res) => {
    try {
        const { name, price, durationMonths, features } = req.body;
        const plan = await prisma_1.default.subscriptionPlan.create({
            data: {
                name,
                price: parseFloat(price),
                durationMonths: parseInt(durationMonths),
                features: Array.isArray(features) ? features : []
            }
        });
        realtimeService_1.realtimeService.emit('subscription_plans', 'plan_updated', { plan });
        res.status(201).json(plan);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createAdminPlan = createAdminPlan;
const deleteAdminPlan = async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.subscriptionPlan.delete({ where: { id } });
        realtimeService_1.realtimeService.emit('subscription_plans', 'plan_updated', { id, deleted: true });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.deleteAdminPlan = deleteAdminPlan;
const getAdminCoupons = async (req, res) => {
    try {
        const coupons = await prisma_1.default.coupon.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(coupons);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAdminCoupons = getAdminCoupons;
const createAdminCoupon = async (req, res) => {
    try {
        const { code, discountType, discountValue, expiryDate } = req.body;
        const coupon = await prisma_1.default.coupon.create({
            data: {
                code: String(code).toUpperCase(),
                discountType,
                discountValue: parseFloat(discountValue),
                expiryDate: new Date(expiryDate)
            }
        });
        realtimeService_1.realtimeService.emit('coupons', 'coupon_created', { coupon });
        res.status(201).json(coupon);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createAdminCoupon = createAdminCoupon;
const getAdminSmsConfig = async (req, res) => {
    try {
        let config = await prisma_1.default.smsGatewayConfig.findFirst();
        if (!config) {
            config = await prisma_1.default.smsGatewayConfig.create({
                data: { provider: 'MOCK', costPerSms: 0.3 }
            });
        }
        res.json(config);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAdminSmsConfig = getAdminSmsConfig;
const updateAdminSmsConfig = async (req, res) => {
    try {
        const { provider, costPerSms, senderId } = req.body;
        const config = await prisma_1.default.smsGatewayConfig.findFirst();
        let updated;
        if (config) {
            updated = await prisma_1.default.smsGatewayConfig.update({
                where: { id: config.id },
                data: {
                    provider,
                    costPerSms: parseFloat(costPerSms),
                    senderId
                }
            });
        }
        else {
            updated = await prisma_1.default.smsGatewayConfig.create({
                data: {
                    provider,
                    costPerSms: parseFloat(costPerSms),
                    senderId
                }
            });
        }
        realtimeService_1.realtimeService.emit('app_config', 'config_updated', { config: updated });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateAdminSmsConfig = updateAdminSmsConfig;
// ==========================================
// SUBSCRIPTION MANAGEMENT (BDApps + generic plans)
// ==========================================
const getAdminSubscriptions = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
        const search = String(req.query.search || '').trim();
        const statusFilter = String(req.query.status || '').trim();
        const where = {};
        if (search) {
            where.OR = [
                { mobile: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (statusFilter) {
            where.subscription_status = statusFilter;
        }
        const [total, users] = await Promise.all([
            prisma_1.default.user.count({ where }),
            prisma_1.default.user.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    mobile: true,
                    email: true,
                    subscription_status: true,
                    updatedAt: true,
                    profile: { select: { name: true } },
                    subscriptions: { orderBy: { updated_at: 'desc' }, take: 1 },
                    userSubscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
                },
            }),
        ]);
        res.json({
            success: true,
            data: users,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
exports.getAdminSubscriptions = getAdminSubscriptions;
const getAdminPaymentLogs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '30'), 10)));
        const [total, transactions, webhookLogs] = await Promise.all([
            prisma_1.default.transaction.count(),
            prisma_1.default.transaction.findMany({
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: { user: { include: { profile: true } } },
            }),
            prisma_1.default.webhookLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
        ]);
        res.json({
            success: true,
            data: { transactions, webhookLogs },
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
exports.getAdminPaymentLogs = getAdminPaymentLogs;
const getAdminSubscriptionAnalytics = async (req, res) => {
    try {
        const [registeredCount, unsubscribedCount, activePlanCount, expiredPlanCount, cancelledPlanCount] = await Promise.all([
            prisma_1.default.user.count({ where: { subscription_status: 'REGISTERED' } }),
            prisma_1.default.user.count({ where: { subscription_status: 'UNSUBSCRIBED' } }),
            prisma_1.default.userSubscription.count({ where: { status: 'ACTIVE' } }),
            prisma_1.default.userSubscription.count({ where: { status: 'EXPIRED' } }),
            prisma_1.default.userSubscription.count({ where: { status: 'CANCELLED' } }),
        ]);
        // "Renewal rate" doesn't map onto continuous telco direct-carrier
        // billing - there's no discrete renewal event to count, Robi/Airtel
        // just keeps billing daily until the subscriber unsubscribes. Report a
        // 7-day retention proxy instead: of subscriptions that started 7+ days
        // ago, what fraction are still REGISTERED today.
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [cohort, stillActive] = await Promise.all([
            prisma_1.default.subscription.count({ where: { created_at: { lte: sevenDaysAgo } } }),
            prisma_1.default.subscription.count({ where: { created_at: { lte: sevenDaysAgo }, status: 'REGISTERED' } }),
        ]);
        const sevenDayRetentionPct = cohort > 0 ? Math.round((stillActive / cohort) * 1000) / 10 : null;
        const operatorBreakdown = await prisma_1.default.subscription.groupBy({
            by: ['operator'],
            _count: { _all: true },
        });
        res.json({
            success: true,
            data: {
                bdapps: { registered: registeredCount, unsubscribed: unsubscribedCount },
                genericPlans: { active: activePlanCount, expired: expiredPlanCount, cancelled: cancelledPlanCount },
                sevenDayRetentionPct,
                operatorBreakdown,
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
exports.getAdminSubscriptionAnalytics = getAdminSubscriptionAnalytics;
//# sourceMappingURL=adminController.js.map