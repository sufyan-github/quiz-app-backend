import { Router } from 'express';
import { getCategories, createCategory, getSubjects, createSubject, getTopics, createTopic, updateCategory, deleteCategory, updateSubject, deleteSubject, updateTopic, deleteTopic } from '../controllers/categoryController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.get('/categories', getCategories);
router.post('/categories', authenticate, requireAdmin, createCategory);
router.put('/categories/:id', authenticate, requireAdmin, updateCategory);
router.delete('/categories/:id', authenticate, requireAdmin, deleteCategory);

router.get('/subjects', getSubjects);
router.post('/subjects', authenticate, requireAdmin, createSubject);
router.put('/subjects/:id', authenticate, requireAdmin, updateSubject);
router.delete('/subjects/:id', authenticate, requireAdmin, deleteSubject);

router.get('/topics', getTopics);
router.post('/topics', authenticate, requireAdmin, createTopic);
router.put('/topics/:id', authenticate, requireAdmin, updateTopic);
router.delete('/topics/:id', authenticate, requireAdmin, deleteTopic);

export default router;
