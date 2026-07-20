import { Router } from 'express';
import { quizController } from '../controllers/quizController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Allow seeding without auth for testing
router.get('/seed', quizController.seedData);

// Require authentication for all quiz routes
router.use(authenticate);

router.get('/categories', quizController.getCategories);
router.get('/generate', quizController.generateQuiz);
router.post('/submit', quizController.submitQuiz);
router.get('/dashboard', quizController.getDashboard);
router.get('/leaderboard', quizController.getLeaderboard);

export default router;
