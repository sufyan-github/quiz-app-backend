"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const lessonController_1 = require("../controllers/lessonController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.get('/', lessonController_1.lessonController.getLessons);
router.get('/:id', lessonController_1.lessonController.getLesson);
exports.default = router;
//# sourceMappingURL=lessonRoutes.js.map