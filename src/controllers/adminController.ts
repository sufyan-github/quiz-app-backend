import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';
import bcrypt from 'bcrypt';
import { realtimeService } from '../services/realtimeService';
import { sanitizeProfileInput } from '../utils/profileInput';
import type { Prisma } from '@prisma/client';

const safeUserSelect = {
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
} as const;

export const getAdminUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: safeUserSelect,
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUserRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { role } = req.body;
    if (!['SUPER_ADMIN', 'ADMIN', 'INSTRUCTOR', 'STUDENT'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, deletedAt: true } });
    if (!target || target.deletedAt) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (id === req.user?.userId && role !== 'SUPER_ADMIN') {
      res.status(409).json({ error: 'You cannot remove your own super-admin access' });
      return;
    }
    if (target.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
      const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN', deletedAt: null } });
      if (superAdminCount <= 1) {
        res.status(409).json({ error: 'At least one super admin must remain' });
        return;
      }
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: safeUserSelect,
    });
    
    await prisma.activityLog.create({
      data: {
        userId: req.user?.userId || '',
        action: `Updated user ${updated.id} role to ${role}`,
        module: 'UserManagement',
        ipAddress: req.ip
      }
    });

    realtimeService.emit('profile', 'user_updated', { userId: id, role }, id);

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createAdminUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const targetRole = req.body.role === 'INSTRUCTOR' ? 'INSTRUCTOR' : 'ADMIN';
    const validPassword = typeof password === 'string'
      && password.length >= 12
      && password.length <= 128
      && /[a-z]/.test(password)
      && /[A-Z]/.test(password)
      && /\d/.test(password);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPassword) {
      res.status(400).json({ error: 'Use a valid email and a strong 12-128 character password' });
      return;
    }
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: targetRole,
        profile: {
          create: { name: name || 'Admin User' }
        }
      },
      select: safeUserSelect,
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user?.userId || '',
        action: `Created ${targetRole.toLowerCase()} user ${user.id}`,
        module: 'UserManagement',
        ipAddress: req.ip
      }
    });

    realtimeService.emit('profile', 'user_created', { userId: user.id, role: user.role });

    res.status(201).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ...safeUserSelect, settings: true },
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

    // Log Activity
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'Updated Profile',
        module: 'Profile',
        ipAddress: req.ip
      }
    });

    realtimeService.emit('profile', 'user_updated', { userId, profile }, userId);

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
      include: { user: { select: safeUserSelect } },
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
      include: { user: { select: safeUserSelect } },
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminRevenue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Total payments
    const successfulTxns = await prisma.transaction.findMany({
      where: { status: 'SUCCESS' }
    });
    const totalRevenue = successfulTxns.reduce((sum, t) => sum + t.amount, 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRevenue = successfulTxns
      .filter(t => t.createdAt >= todayStart)
      .reduce((sum, t) => sum + t.amount, 0);

    // SMS log counting & Cost calculations
    const smsCount = await prisma.smsLog.count();
    let smsConfig = await prisma.smsGatewayConfig.findFirst();
    if (!smsConfig) {
      smsConfig = await prisma.smsGatewayConfig.create({
        data: { provider: 'MOCK', costPerSms: 0.3 }
      });
    }
    const smsExpenditure = smsCount * smsConfig.costPerSms;

    // User breakdown
    const totalStudents = await prisma.user.count({ where: { role: 'STUDENT' } });
    const premiumCardUsers = await prisma.userSubscription.count({ where: { status: 'ACTIVE' } });
    const premiumBdaUsers = await prisma.user.count({ where: { role: 'STUDENT', subscription_status: 'REGISTERED' } });
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

      const txns = await prisma.transaction.findMany({
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
        todayRevenue,
        smsCount,
        smsExpenditure,
        activePremiumCount,
        freeUsers: Math.max(0, totalStudents - activePremiumCount)
      },
      transactions: await prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { user: { select: safeUserSelect } },
      }),
      monthlyData
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminPlans = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' }
    });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createAdminPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, price, durationMonths, features } = req.body;
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        price: parseFloat(price),
        durationMonths: parseInt(durationMonths),
        features: Array.isArray(features) ? features : []
      }
    });

    realtimeService.emit('subscription_plans', 'plan_updated', { plan });

    res.status(201).json(plan);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteAdminPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await prisma.subscriptionPlan.delete({ where: { id } });

    realtimeService.emit('subscription_plans', 'plan_updated', { id, deleted: true });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminCoupons = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(coupons);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createAdminCoupon = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, discountType, discountValue, expiryDate } = req.body;
    const coupon = await prisma.coupon.create({
      data: {
        code: String(code).toUpperCase(),
        discountType,
        discountValue: parseFloat(discountValue),
        expiryDate: new Date(expiryDate)
      }
    });

    realtimeService.emit('coupons', 'coupon_created', { coupon });

    res.status(201).json(coupon);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminSmsConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let config = await prisma.smsGatewayConfig.findFirst();
    if (!config) {
      config = await prisma.smsGatewayConfig.create({
        data: { provider: 'MOCK', costPerSms: 0.3 }
      });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAdminSmsConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { provider, costPerSms, senderId } = req.body;
    const config = await prisma.smsGatewayConfig.findFirst();

    let updated;
    if (config) {
      updated = await prisma.smsGatewayConfig.update({
        where: { id: config.id },
        data: {
          provider,
          costPerSms: parseFloat(costPerSms),
          senderId
        }
      });
    } else {
      updated = await prisma.smsGatewayConfig.create({
        data: {
          provider,
          costPerSms: parseFloat(costPerSms),
          senderId
        }
      });
    }

    realtimeService.emit('app_config', 'config_updated', { config: updated });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminSmsLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10));
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10)));
  const [total, logs] = await Promise.all([
    prisma.smsLog.count(),
    prisma.smsLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
  ]);
  res.json({ success: true, data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
};

// ==========================================
// SUBSCRIPTION MANAGEMENT (BDApps + generic plans)
// ==========================================

export const getAdminSubscriptions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const search = String(req.query.search || '').trim();
    const statusFilter = String(req.query.status || '').trim();

    const where: any = {};
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
      prisma.user.count({ where }),
      prisma.user.findMany({
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
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAdminPaymentLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '30'), 10)));

    const [total, transactions, webhookLogs] = await Promise.all([
      prisma.transaction.count(),
      prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: safeUserSelect } },
      }),
      prisma.webhookLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);

    res.json({
      success: true,
      data: { transactions, webhookLogs },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAdminSubscriptionAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [registeredCount, unsubscribedCount, activePlanCount, expiredPlanCount, cancelledPlanCount] = await Promise.all([
      prisma.user.count({ where: { subscription_status: 'REGISTERED' } }),
      prisma.user.count({ where: { subscription_status: 'UNSUBSCRIBED' } }),
      prisma.userSubscription.count({ where: { status: 'ACTIVE' } }),
      prisma.userSubscription.count({ where: { status: 'EXPIRED' } }),
      prisma.userSubscription.count({ where: { status: 'CANCELLED' } }),
    ]);

    // "Renewal rate" doesn't map onto continuous telco direct-carrier
    // billing - there's no discrete renewal event to count, Robi/Airtel
    // just keeps billing daily until the subscriber unsubscribes. Report a
    // 7-day retention proxy instead: of subscriptions that started 7+ days
    // ago, what fraction are still REGISTERED today.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [cohort, stillActive] = await Promise.all([
      prisma.subscription.count({ where: { created_at: { lte: sevenDaysAgo } } }),
      prisma.subscription.count({ where: { created_at: { lte: sevenDaysAgo }, status: 'REGISTERED' } }),
    ]);
    const sevenDayRetentionPct = cohort > 0 ? Math.round((stillActive / cohort) * 1000) / 10 : null;

    const operatorBreakdown = await prisma.subscription.groupBy({
      by: ['operator'],
      _count: { _all: true },
    });

    const couponUsageRaw = await prisma.transaction.groupBy({
      by: ['couponCode'],
      where: { couponCode: { not: null } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const couponUsage = couponUsageRaw.map(c => ({
      code: c.couponCode,
      uses: c._count._all,
      totalAmount: c._sum.amount ?? 0,
    }));

    res.json({
      success: true,
      data: {
        bdapps: { registered: registeredCount, unsubscribed: unsubscribedCount },
        genericPlans: { active: activePlanCount, expired: expiredPlanCount, cancelled: cancelledPlanCount },
        sevenDayRetentionPct,
        operatorBreakdown,
        couponUsage,
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAdminQuizConfigs = async (_req: AuthRequest, res: Response): Promise<void> => {
  const configs = await prisma.subjectQuizConfig.findMany({ orderBy: { subjectName: 'asc' } });
  res.json({ success: true, data: configs });
};

export const upsertAdminQuizConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  const subjectName = String(req.body.subjectName || '').trim();
  const defaultQuestions = Math.floor(Number(req.body.defaultQuestions));
  const defaultTimeMins = Math.floor(Number(req.body.defaultTimeMins));
  const defaultPassingPct = Number(req.body.defaultPassingPct);
  const marksPerQuestion = Number(req.body.marksPerQuestion);
  const negativeMarksDefault = Number(req.body.negativeMarksDefault);

  if (!subjectName || subjectName.length > 100
    || !Number.isInteger(defaultQuestions) || defaultQuestions < 1 || defaultQuestions > 200
    || !Number.isInteger(defaultTimeMins) || defaultTimeMins < 1 || defaultTimeMins > 300
    || !Number.isFinite(defaultPassingPct) || defaultPassingPct < 0 || defaultPassingPct > 100
    || !Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0 || marksPerQuestion > 100
    || !Number.isFinite(negativeMarksDefault) || negativeMarksDefault < 0 || negativeMarksDefault > marksPerQuestion) {
    res.status(400).json({ success: false, message: 'Invalid quiz configuration' });
    return;
  }

  const config = await prisma.subjectQuizConfig.upsert({
    where: { subjectName: subjectName.toLowerCase() },
    update: { defaultQuestions, defaultTimeMins, defaultPassingPct, marksPerQuestion, negativeMarksDefault },
    create: {
      subjectName: subjectName.toLowerCase(), defaultQuestions, defaultTimeMins,
      defaultPassingPct, marksPerQuestion, negativeMarksDefault,
    },
  });
  realtimeService.emit('app_config', 'quiz_config_updated', { subjectName: config.subjectName });
  res.json({ success: true, data: config });
};
