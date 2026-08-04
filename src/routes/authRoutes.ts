import { Router } from 'express';
import { register, login } from '../controllers/authController';
import { authRateLimit } from '../middleware/rateLimit';

const router = Router();

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);

export default router;
