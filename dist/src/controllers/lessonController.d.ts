import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const lessonController: {
    /**
     * Get all lessons for a specific topic
     */
    getLessons(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get a specific lesson by ID
     */
    getLesson(req: AuthRequest, res: Response): Promise<void>;
};
//# sourceMappingURL=lessonController.d.ts.map