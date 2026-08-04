import { Router } from 'express';
import { quizController } from '../controllers/quizController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Seed without auth (testing only)
router.get('/seed', quizController.seedData);

// Public
router.get('/quiz-config', quizController.getQuizConfig);

// Authenticated routes
router.use(authenticate);

router.get('/categories', quizController.getCategories);
router.get('/generate', quizController.generateQuiz);
router.post('/submit', quizController.submitQuizV2);
router.get('/dashboard', quizController.getDashboard);
router.get('/leaderboard', quizController.getLeaderboard);

// Exam History
router.get('/history', quizController.getExamHistory);
router.get('/history/:id', quizController.getExamHistoryDetail);
router.get('/history/:id/pdf', quizController.downloadPdfReport);

// Daily Reward
router.post('/daily-reward', quizController.claimDailyReward);

export default router;
