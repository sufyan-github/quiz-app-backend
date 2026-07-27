import { Router } from 'express';
import { bdappsController } from '../controllers/bdappsController';

const router = Router();

// Endpoints mapping to BDApps API (Proxy via PHP Gateway)
router.post('/otp/send', bdappsController.sendOtp);
router.post('/otp/verify', bdappsController.verifyOtp);
router.post('/subscription/check', bdappsController.checkSubscription);

// Note: /notification and /callback routes have been REMOVED from Render.
// BDApps Production Webhooks must now be pointed to:
// https://bdappsdigitalapps.com/api/callback.php

export default router;
