import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const getExams: (req: Request, res: Response) => Promise<void>;
export declare const createExam: (req: Request, res: Response) => Promise<void>;
export declare const updateExam: (req: Request, res: Response) => Promise<void>;
export declare const deleteExam: (req: Request, res: Response) => Promise<void>;
export declare const saveAnswer: (req: AuthRequest, res: Response) => Promise<void>;
export declare const submitExam: (req: AuthRequest, res: Response) => Promise<void>;
export declare const generateCertificate: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAllResults: (req: Request, res: Response) => Promise<void>;
export declare const addQuestionToExam: (req: Request, res: Response) => Promise<void>;
export declare const deleteQuestion: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=examController.d.ts.map