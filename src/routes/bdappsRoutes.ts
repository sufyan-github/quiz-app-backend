import { Router } from 'express';
import { bdappsController } from '../controllers/bdappsController';

const router = Router();

// Endpoints mapping to BDApps API
router.post('/otp/send', bdappsController.sendOtp);
router.post('/otp/verify', bdappsController.verifyOtp);
router.post('/subscription/check', bdappsController.checkSubscription);
router.post('/notification', bdappsController.handleNotification);
router.post('/callback', bdappsController.handleNotification);

export default router;
