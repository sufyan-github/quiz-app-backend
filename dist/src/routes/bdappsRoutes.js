"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bdappsController_1 = require("../controllers/bdappsController");
const router = (0, express_1.Router)();
// Endpoints mapping to BDApps API
router.post('/otp/send', bdappsController_1.bdappsController.sendOtp);
router.post('/otp/verify', bdappsController_1.bdappsController.verifyOtp);
router.post('/subscription/check', bdappsController_1.bdappsController.checkSubscription);
router.post('/notification', bdappsController_1.bdappsController.handleNotification);
router.post('/callback', bdappsController_1.bdappsController.handleNotification);
exports.default = router;
//# sourceMappingURL=bdappsRoutes.js.map