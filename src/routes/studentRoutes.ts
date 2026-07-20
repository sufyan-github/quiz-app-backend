import { Router } from 'express';
import { getStudentProfile, updateStudentProfile, getStudentDashboard } from '../controllers/studentController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/profile', getStudentProfile);
router.put('/profile', updateStudentProfile);
router.get('/dashboard', getStudentDashboard);

export default router;
