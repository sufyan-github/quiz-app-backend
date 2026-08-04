"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const rateLimit_1 = require("../middleware/rateLimit");
const router = (0, express_1.Router)();
router.post('/register', rateLimit_1.authRateLimit, authController_1.register);
router.post('/login', rateLimit_1.authRateLimit, authController_1.login);
exports.default = router;
