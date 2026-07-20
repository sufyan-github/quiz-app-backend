import { Router } from 'express';
import { getAdminProfile, updateAdminProfile, getAdminDashboard, getAdminActivityLogs } from '../controllers/adminController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/profile', getAdminProfile);
router.put('/profile', updateAdminProfile);
router.get('/dashboard', getAdminDashboard);
router.get('/activity', getAdminActivityLogs);

export default router;
