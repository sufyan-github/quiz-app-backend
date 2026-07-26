import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';
import bcrypt from 'bcrypt';
import { realtimeService } from '../services/realtimeService';

export const getAdminUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { profile: true }
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
    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      include: { profile: true }
    });
    
    await prisma.activityLog.create({
      data: {
        userId: req.user?.userId || '',
        action: `Updated User ${updated.email} Role to ${role}`,
        module: 'UserManagement',
        ipAddress: req.ip
      }
    });

    realtimeService.emit('profile', 'user_updated', { userId: id, role, updated }, id);

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createAdminUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Missing parameters' });
      return;
    }
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const targetRole = role || 'ADMIN';
    const user = await prisma.user.create({
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

    await prisma.activityLog.create({
      data: {
        userId: req.user?.userId || '',
        action: `Created Admin User ${email}`,
        module: 'UserManagement',
        ipAddress: req.ip
      }
    });

    realtimeService.emit('profile', 'user_created', { user });

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

export const getAdminRevenue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Total payments
    const successfulTxns = await prisma.transaction.findMany({
      where: { status: 'SUCCESS' }
    });
    const totalRevenue = successfulTxns.reduce((sum, t) => sum + t.amount, 0);

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
        smsCount,
        smsExpenditure,
        activePremiumCount,
        freeUsers: Math.max(0, totalStudents - activePremiumCount)
      },
      transactions: await prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { user: { include: { profile: true } } }
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
