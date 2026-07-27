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
     * Dev/test only: this endpoint has no auth and no payment-provider
     * signature verification, so it must never be reachable in production —
     * doing so lets any user self-approve a real subscription for free.
     * Replace with a real bKash/Nagad/Stripe webhook (verified signature)
     * before removing this guard.
     */
    simulateCallback(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Fetch invoice history.
     */
    getBillingHistory(req: AuthRequest, res: Response): Promise<void>;
};
//# sourceMappingURL=paymentController.d.ts.map