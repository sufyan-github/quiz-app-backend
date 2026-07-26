"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentController_1 = require("../controllers/paymentController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Secure checkout routes
router.post('/checkout', authMiddleware_1.authenticate, paymentController_1.paymentController.initiateCheckout);
router.get('/history', authMiddleware_1.authenticate, paymentController_1.paymentController.getBillingHistory);
router.get('/plans', authMiddleware_1.authenticate, paymentController_1.paymentController.getPlans);
// Callback receiver (simulates third-party webhook trigger)
router.post('/simulate-callback', paymentController_1.paymentController.simulateCallback);
exports.default = router;
//# sourceMappingURL=paymentRoutes.js.map