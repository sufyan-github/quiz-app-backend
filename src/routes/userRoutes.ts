import { Router } from 'express';
import { getProfile, updateProfile, getAllUsers, getUserDetails } from '../controllers/userController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';
import { deleteMyNotification, getMyNotifications, markAllMyNotificationsRead, markMyNotificationRead } from '../controllers/notificationController';
import { deleteMyAccount, exportMyData } from '../controllers/accountController';

const router = Router();

router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/notifications', getMyNotifications);
router.patch('/notifications/read-all', markAllMyNotificationsRead);
router.patch('/notifications/:id/read', markMyNotificationRead);
router.delete('/notifications/:id', deleteMyNotification);
router.get('/account/export', exportMyData);
router.post('/account/delete', deleteMyAccount);

// Admin routes
router.get('/all', requireAdmin, getAllUsers);
router.get('/:id', requireAdmin, getUserDetails);

export default router;
