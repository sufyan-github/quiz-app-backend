import { Router } from 'express';
import { bdappsController } from '../controllers/bdappsController';

const router = Router();

// Endpoints mapping to the original PHP scripts
router.post('/otp/send', bdappsController.sendOtp);
router.post('/otp/verify', bdappsController.verifyOtp);
router.post('/subscription/check', bdappsController.checkSubscription);
// More could be added here for USSD / SMS based on bdapps documentation

export default router;
