import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const getQuestions: (req: Request, res: Response) => Promise<void>;
export declare const createQuestion: (req: AuthRequest, res: Response) => Promise<void>;
export declare const deleteQuestion: (req: Request, res: Response) => Promise<void>;
export declare const updateQuestion: (req: Request, res: Response) => Promise<void>;
export declare const archiveQuestion: (req: Request, res: Response) => Promise<void>;
export declare const importQuestions: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=questionController.d.ts.map