"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bdappsController_1 = require("../controllers/bdappsController");
const router = (0, express_1.Router)();
// Endpoints mapping to BDApps API (Proxy via PHP Gateway)
router.post('/otp/send', bdappsController_1.bdappsController.sendOtp);
router.post('/otp/verify', bdappsController_1.bdappsController.verifyOtp);
router.post('/subscription/check', bdappsController_1.bdappsController.checkSubscription);
// Note: /notification and /callback routes have been REMOVED from Render.
// BDApps Production Webhooks must now be pointed to:
// https://bdappsdigitalapps.com/api/callback.php
exports.default = router;
