import { Router } from 'express';
import { getQuestions, createQuestion, deleteQuestion } from '../controllers/questionController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticate, getQuestions);
router.post('/', authenticate, requireAdmin, createQuestion);
router.delete('/:id', authenticate, requireAdmin, deleteQuestion);

export default router;
