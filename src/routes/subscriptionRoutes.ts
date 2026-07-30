import { Router } from 'express';
import { subscriptionController } from '../controllers/subscriptionController';
import { authenticate } from '../middleware/authMiddleware';
import { verifyPhpWebhookSignature } from '../middleware/verifyPhpWebhookSignature';

const router = Router();

// Public: same pre-login action as /api/bdapps/otp/send, just named to
// match the requested subscription API surface.
router.post('/start', subscriptionController.start);

// Internal only: called by php_bdapps_gateway/api/callback.php, never by
// the Flutter app or a browser. HMAC-verified instead of JWT-authenticated
// since there is no logged-in user making this request.
router.post('/webhook', verifyPhpWebhookSignature, subscriptionController.handleWebhook);

router.use(authenticate);
router.get('/status', subscriptionController.status);
router.get('/me', subscriptionController.me);
router.get('/history', subscriptionController.history);
router.get('/plans', subscriptionController.plans);
router.post('/verify', subscriptionController.verifyNow);
router.post('/cancel', subscriptionController.cancel);

export default router;
