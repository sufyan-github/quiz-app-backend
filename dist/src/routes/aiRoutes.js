"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiController_1 = require("../controllers/aiController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const rateLimit_1 = require("../middleware/rateLimit");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.use(rateLimit_1.aiRateLimit);
// Tutor & Hints – premium check handled inside controller
router.post('/tutor', aiController_1.aiController.askAiTutor);
router.post('/hint', aiController_1.aiController.generateAiHint);
// Admin AI quiz generator
router.post('/generate-quiz', authMiddleware_1.requireAdmin, aiController_1.aiController.generateAiQuiz);
// Student AI quiz builder (with free-plan enforcement)
router.post('/student-generate', aiController_1.aiController.studentGenerateAiQuiz);
// Premium: Study Planner & Recommendations
router.get('/study-plan', aiController_1.aiController.getStudyPlan);
router.post('/generate-study-plan', authMiddleware_1.requirePremium, aiController_1.aiController.generateCustomStudyPlan);
router.get('/recommendations', aiController_1.aiController.getRecommendations);
exports.default = router;
