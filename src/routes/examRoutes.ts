import { Router } from 'express';
import { getExams, createExam, saveAnswer, submitExam, generateCertificate, updateExam, deleteExam, getAllResults, addQuestionToExam, deleteQuestion } from '../controllers/examController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Admin routes
router.get('/results/all', authenticate, requireAdmin, getAllResults);
router.post('/:examId/questions', authenticate, requireAdmin, addQuestionToExam);
router.delete('/questions/:questionId', authenticate, requireAdmin, deleteQuestion);

router.get('/', getExams);
router.post('/', authenticate, requireAdmin, createExam);
router.put('/:id', authenticate, requireAdmin, updateExam);
router.delete('/:id', authenticate, requireAdmin, deleteExam);

router.post('/answer', authenticate, saveAnswer);
router.post('/submit', authenticate, submitExam);
router.get('/certificate/:attemptId', authenticate, generateCertificate);

export default router;
