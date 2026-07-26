"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const questionController_1 = require("../controllers/questionController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.get('/', authMiddleware_1.authenticate, questionController_1.getQuestions);
router.post('/', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, questionController_1.createQuestion);
router.put('/:id', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, questionController_1.updateQuestion);
router.post('/import', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, questionController_1.importQuestions);
router.delete('/:id', authMiddleware_1.authenticate, authMiddleware_1.requireAdmin, questionController_1.deleteQuestion);
exports.default = router;
//# sourceMappingURL=questionRoutes.js.map