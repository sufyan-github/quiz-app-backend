"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const examController_1 = require("../controllers/examController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Admin routes
router.get('/results/all', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, examController_1.getAllResults);
router.post('/:examId/questions', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, examController_1.addQuestionToExam);
router.delete('/questions/:questionId', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, examController_1.deleteQuestion);
router.get('/', examController_1.getExams);
router.post('/', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, examController_1.createExam);
router.put('/:id', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, examController_1.updateExam);
router.delete('/:id', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, examController_1.deleteExam);
router.post('/answer', authMiddleware_1.authenticate, examController_1.saveAnswer);
router.post('/submit', authMiddleware_1.authenticate, examController_1.submitExam);
router.get('/certificate/:attemptId', authMiddleware_1.authenticate, examController_1.generateCertificate);
exports.default = router;
//# sourceMappingURL=examRoutes.js.map