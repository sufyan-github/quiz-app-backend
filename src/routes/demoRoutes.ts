import { Router } from 'express';
import { demoController } from '../controllers/demoController';

const router = Router();

// Public, unauthenticated demo endpoints for the landing page. See
// demoController.ts for the rate-limit/cache/validation safeguards that
// make an open, cost-bearing endpoint like this safe to expose.
router.post('/generate-quiz', demoController.generateDemoQuiz);
router.post('/trial-session', demoController.startTrialSession);

export default router;
