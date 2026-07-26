import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const getAdminUsers: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateUserRole: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createAdminUser: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminProfile: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateAdminProfile: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminDashboard: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminActivityLogs: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminRevenue: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminPlans: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createAdminPlan: (req: AuthRequest, res: Response) => Promise<void>;
export declare const deleteAdminPlan: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminCoupons: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createAdminCoupon: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminSmsConfig: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateAdminSmsConfig: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=adminController.d.ts.map