import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
export declare const paymentController: {
    /**
     * Get active subscription plans for students
     */
    getPlans(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Initiate mock checkout session.
     */
    initiateCheckout(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Callback receiver for payment webhook simulation.
     */
    simulateCallback(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Fetch invoice history.
     */
    getBillingHistory(req: AuthRequest, res: Response): Promise<void>;
};
//# sourceMappingURL=paymentController.d.ts.map