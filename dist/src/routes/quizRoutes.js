"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const quizController_1 = require("../controllers/quizController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Seed without auth (testing only)
router.get('/seed', quizController_1.quizController.seedData);
// Public
router.get('/quiz-config', quizController_1.quizController.getQuizConfig);
// Authenticated routes
router.use(authMiddleware_1.authenticate);
router.get('/categories', quizController_1.quizController.getCategories);
router.get('/generate', quizController_1.quizController.generateQuiz);
router.post('/submit', quizController_1.quizController.submitQuizV2);
router.get('/dashboard', quizController_1.quizController.getDashboard);
router.get('/leaderboard', quizController_1.quizController.getLeaderboard);
// Exam History
router.get('/history', quizController_1.quizController.getExamHistory);
router.get('/history/:id', quizController_1.quizController.getExamHistoryDetail);
router.get('/history/:id/pdf', quizController_1.quizController.downloadPdfReport);
// Daily Reward
router.post('/daily-reward', quizController_1.quizController.claimDailyReward);
exports.default = router;
