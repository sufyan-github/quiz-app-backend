"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const demoController_1 = require("../controllers/demoController");
const router = (0, express_1.Router)();
// Public, unauthenticated demo endpoints for the landing page. See
// demoController.ts for the rate-limit/cache/validation safeguards that
// make an open, cost-bearing endpoint like this safe to expose.
router.post('/generate-quiz', demoController_1.demoController.generateDemoQuiz);
router.post('/trial-session', demoController_1.demoController.startTrialSession);
exports.default = router;
//# sourceMappingURL=demoRoutes.js.map