import { Router } from 'express';
import { paymentController } from '../controllers/paymentController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Secure checkout routes
router.post('/checkout', authenticate, paymentController.initiateCheckout);
router.get('/history', authenticate, paymentController.getBillingHistory);
router.get('/plans', authenticate, paymentController.getPlans);

// Callback receiver (simulates third-party webhook trigger)
router.post('/simulate-callback', paymentController.simulateCallback);

export default router;
