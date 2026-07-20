import { Router } from 'express';
import { getProfile, updateProfile, getAllUsers, getUserDetails } from '../controllers/userController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// Admin routes
router.get('/all', requireAdmin, getAllUsers);
router.get('/:id', requireAdmin, getUserDetails);

export default router;
