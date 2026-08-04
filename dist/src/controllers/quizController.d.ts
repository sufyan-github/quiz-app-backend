import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
declare function submitIssuedQuiz(req: AuthRequest, res: Response): Promise<void>;
export declare const quizController: {
    getCategories(req: AuthRequest, res: Response): Promise<void>;
    generateQuiz(req: AuthRequest, res: Response): Promise<void>;
    submitQuizV2: typeof submitIssuedQuiz;
    submitQuiz(req: AuthRequest, res: Response): Promise<void>;
    getExamHistory(req: AuthRequest, res: Response): Promise<void>;
    getExamHistoryDetail(req: AuthRequest, res: Response): Promise<void>;
    downloadPdfReport(req: AuthRequest, res: Response): Promise<void>;
    getDashboard(req: AuthRequest, res: Response): Promise<void>;
    getLeaderboard(req: AuthRequest, res: Response): Promise<void>;
    claimDailyReward(req: AuthRequest, res: Response): Promise<void>;
    getQuizConfig(req: AuthRequest, res: Response): Promise<void>;
    seedData(req: AuthRequest, res: Response): Promise<void>;
};
export {};
//# sourceMappingURL=quizController.d.ts.map