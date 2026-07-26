import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const aiController: {
    askAiTutor(req: AuthRequest, res: Response): Promise<void>;
    generateAiHint(req: AuthRequest, res: Response): Promise<void>;
    generateAiQuiz(req: AuthRequest, res: Response): Promise<void>;
    studentGenerateAiQuiz(req: AuthRequest, res: Response): Promise<void>;
    getStudyPlan(req: AuthRequest, res: Response): Promise<void>;
    getRecommendations(req: AuthRequest, res: Response): Promise<void>;
    generateCustomStudyPlan(req: AuthRequest, res: Response): Promise<void>;
};
//# sourceMappingURL=aiController.d.ts.map