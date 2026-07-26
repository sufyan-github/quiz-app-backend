import { Router } from 'express';
import { getAdminProfile, updateAdminProfile, getAdminDashboard, getAdminActivityLogs, getAdminUsers, updateUserRole, createAdminUser, getAdminRevenue, getAdminPlans, createAdminPlan, deleteAdminPlan, getAdminCoupons, createAdminCoupon, getAdminSmsConfig, updateAdminSmsConfig } from '../controllers/adminController';
import { sendNotification, getNotifications } from '../controllers/notificationController';
import { getPromptTemplates, updatePromptTemplate } from '../controllers/promptController';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/profile', getAdminProfile);
router.put('/profile', updateAdminProfile);
router.get('/dashboard', getAdminDashboard);
router.get('/activity', getAdminActivityLogs);

// Monetization & Configs
router.get('/revenue', getAdminRevenue);
router.get('/plans', getAdminPlans);
router.post('/plans', createAdminPlan);
router.delete('/plans/:id', deleteAdminPlan);
router.get('/coupons', getAdminCoupons);
router.post('/coupons', createAdminCoupon);
router.get('/sms-config', getAdminSmsConfig);
router.put('/sms-config', updateAdminSmsConfig);

// User & Role Management
router.get('/users', getAdminUsers);
router.put('/users/:id/role', requireSuperAdmin, updateUserRole);
router.post('/users/admin', requireSuperAdmin, createAdminUser);

// Notifications & Prompts Management
router.post('/notifications', sendNotification);
router.get('/notifications', getNotifications);
router.get('/prompts', getPromptTemplates);
router.put('/prompts/:id', updatePromptTemplate);

export default router;
