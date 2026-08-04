"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminController_1 = require("../controllers/adminController");
const notificationController_1 = require("../controllers/notificationController");
const promptController_1 = require("../controllers/promptController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.use(authMiddleware_1.requireAdmin);
router.get('/profile', adminController_1.getAdminProfile);
router.put('/profile', adminController_1.updateAdminProfile);
router.get('/dashboard', adminController_1.getAdminDashboard);
router.get('/activity', adminController_1.getAdminActivityLogs);
// Monetization & Configs
router.get('/revenue', adminController_1.getAdminRevenue);
router.get('/plans', adminController_1.getAdminPlans);
router.post('/plans', adminController_1.createAdminPlan);
router.delete('/plans/:id', adminController_1.deleteAdminPlan);
router.get('/coupons', adminController_1.getAdminCoupons);
router.post('/coupons', adminController_1.createAdminCoupon);
router.get('/sms-config', adminController_1.getAdminSmsConfig);
router.put('/sms-config', adminController_1.updateAdminSmsConfig);
router.get('/sms-logs', adminController_1.getAdminSmsLogs);
router.get('/subscriptions', adminController_1.getAdminSubscriptions);
router.get('/payment-logs', adminController_1.getAdminPaymentLogs);
router.get('/subscription-analytics', adminController_1.getAdminSubscriptionAnalytics);
router.get('/quiz-config', adminController_1.getAdminQuizConfigs);
router.post('/quiz-config', adminController_1.upsertAdminQuizConfig);
// User & Role Management
router.get('/users', adminController_1.getAdminUsers);
router.put('/users/:id/role', authMiddleware_1.requireSuperAdmin, adminController_1.updateUserRole);
router.post('/users/admin', authMiddleware_1.requireSuperAdmin, adminController_1.createAdminUser);
// Notifications & Prompts Management
router.post('/notifications', notificationController_1.sendNotification);
router.get('/notifications', notificationController_1.getNotifications);
router.get('/prompts', promptController_1.getPromptTemplates);
router.put('/prompts/:id', promptController_1.updatePromptTemplate);
exports.default = router;
