import { Router } from 'express';
import { getAdminProfile, updateAdminProfile, getAdminDashboard, getAdminActivityLogs } from '../controllers/adminController';
import { sendNotification, getNotifications } from '../controllers/notificationController';
import { getPromptTemplates, updatePromptTemplate } from '../controllers/promptController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/profile', getAdminProfile);
router.put('/profile', updateAdminProfile);
router.get('/dashboard', getAdminDashboard);
router.get('/activity', getAdminActivityLogs);

// Notifications & Prompts Management
router.post('/notifications', sendNotification);
router.get('/notifications', getNotifications);
router.get('/prompts', getPromptTemplates);
router.put('/prompts/:id', updatePromptTemplate);

export default router;
