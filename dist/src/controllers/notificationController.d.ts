import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const sendNotification: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getNotifications: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMyNotifications: (req: AuthRequest, res: Response) => Promise<void>;
export declare const markMyNotificationRead: (req: AuthRequest, res: Response) => Promise<void>;
export declare const markAllMyNotificationsRead: (req: AuthRequest, res: Response) => Promise<void>;
export declare const deleteMyNotification: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=notificationController.d.ts.map