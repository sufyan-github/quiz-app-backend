import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const subscriptionController: {
    start(req: Request, res: Response): Promise<void>;
    status(req: AuthRequest, res: Response): Promise<void>;
    me(req: AuthRequest, res: Response): Promise<void>;
    history(req: AuthRequest, res: Response): Promise<void>;
    plans(req: Request, res: Response): Promise<void>;
    verifyNow(req: AuthRequest, res: Response): Promise<void>;
    cancel(req: AuthRequest, res: Response): Promise<void>;
    handleWebhook(req: Request, res: Response): Promise<void>;
};
//# sourceMappingURL=subscriptionController.d.ts.map