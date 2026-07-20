import { Router } from 'express';
import { getQuestions, createQuestion, deleteQuestion, updateQuestion, importQuestions } from '../controllers/questionController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticate, getQuestions);
router.post('/', authenticate, requireAdmin, createQuestion);
router.put('/:id', authenticate, requireAdmin, updateQuestion);
router.post('/import', authenticate, requireAdmin, importQuestions);
router.delete('/:id', authenticate, requireAdmin, deleteQuestion);

export default router;
