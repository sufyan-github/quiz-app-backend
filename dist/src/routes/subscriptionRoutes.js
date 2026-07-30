"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subscriptionController_1 = require("../controllers/subscriptionController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const verifyPhpWebhookSignature_1 = require("../middleware/verifyPhpWebhookSignature");
const router = (0, express_1.Router)();
// Public: same pre-login action as /api/bdapps/otp/send, just named to
// match the requested subscription API surface.
router.post('/start', subscriptionController_1.subscriptionController.start);
// Internal only: called by php_bdapps_gateway/api/callback.php, never by
// the Flutter app or a browser. HMAC-verified instead of JWT-authenticated
// since there is no logged-in user making this request.
router.post('/webhook', verifyPhpWebhookSignature_1.verifyPhpWebhookSignature, subscriptionController_1.subscriptionController.handleWebhook);
router.use(authMiddleware_1.authenticate);
router.get('/status', subscriptionController_1.subscriptionController.status);
router.get('/me', subscriptionController_1.subscriptionController.me);
router.get('/history', subscriptionController_1.subscriptionController.history);
router.get('/plans', subscriptionController_1.subscriptionController.plans);
router.post('/verify', subscriptionController_1.subscriptionController.verifyNow);
router.post('/cancel', subscriptionController_1.subscriptionController.cancel);
exports.default = router;
//# sourceMappingURL=subscriptionRoutes.js.map