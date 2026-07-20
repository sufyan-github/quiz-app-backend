import { Router } from 'express';
import { aiController } from '../controllers/aiController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.post('/tutor', aiController.askAiTutor);
router.post('/hint', aiController.generateAiHint);
router.post('/generate-quiz', aiController.generateAiQuiz);

export default router;
