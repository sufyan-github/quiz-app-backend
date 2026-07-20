import { Router } from 'express';
import { lessonController } from '../controllers/lessonController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', lessonController.getLessons);
router.get('/:id', lessonController.getLesson);

export default router;
