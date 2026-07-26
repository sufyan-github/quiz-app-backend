import { Router } from 'express';
import { aiController } from '../controllers/aiController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

// Tutor & Hints – premium check handled inside controller
router.post('/tutor', aiController.askAiTutor);
router.post('/hint', aiController.generateAiHint);

// Admin AI quiz generator
router.post('/generate-quiz', aiController.generateAiQuiz);

// Student AI quiz builder (with free-plan enforcement)
router.post('/student-generate', aiController.studentGenerateAiQuiz);

// Premium: Study Planner & Recommendations
router.get('/study-plan', aiController.getStudyPlan);
router.post('/generate-study-plan', aiController.generateCustomStudyPlan);
router.get('/recommendations', aiController.getRecommendations);

export default router;
