import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const sendNotification: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getNotifications: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=notificationController.d.ts.map