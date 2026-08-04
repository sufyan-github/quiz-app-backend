import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';
import { smsService } from '../services/smsService';

export const paymentController = {
  /**
   * Get active subscription plans for students
   */
  async getPlans(req: AuthRequest, res: Response): Promise<void> {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { active: true },
        orderBy: { price: 'asc' }
      });
      res.json(plans);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Initiate mock checkout session.
   */
  async initiateCheckout(req: AuthRequest, res: Response): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      res.status(501).json({
        success: false,
        error: { code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'Only verified Robi/Airtel carrier billing is available.' },
      });
      return;
    }
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { purpose, planId, examId, couponCode, provider } = req.body;

      if (!purpose || (purpose === 'SUBSCRIPTION' && !planId) || (purpose === 'PAY_PER_EXAM' && !examId)) {
        res.status(400).json({ error: 'Missing payment details' });
        return;
      }

      let amount = 2.0; // Default pay-per-exam price is ৳2

      // If it is a subscription, get the plan price
      if (purpose === 'SUBSCRIPTION') {
        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan) {
          res.status(404).json({ error: 'Subscription plan not found' });
          return;
        }
        amount = plan.price;
      }

      // Check for coupons
      if (couponCode) {
        const coupon = await prisma.coupon.findUnique({
          where: { code: couponCode, active: true }
        });

        if (coupon && coupon.expiryDate > new Date()) {
          if (coupon.discountType === 'PERCENTAGE') {
            amount = Math.max(0, amount - (amount * coupon.discountValue / 100));
          } else if (coupon.discountType === 'FIXED') {
            amount = Math.max(0, amount - coupon.discountValue);
          }
        }
      }

      const transactionId = `txn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Create transaction record
      const txn = await prisma.transaction.create({
        data: {
          userId,
          amount,
          provider: provider || 'BKASH',
          transactionId,
          purpose,
          planId: purpose === 'SUBSCRIPTION' ? planId : null,
          examId: purpose === 'PAY_PER_EXAM' ? examId : null,
          couponCode: couponCode || null,
          status: 'PENDING'
        }
      });

      res.json({
        success: true,
        transactionId,
        amount,
        checkoutUrl: `/api/payment/simulate-checkout?txnId=${transactionId}`
      });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Callback receiver for payment webhook simulation.
   * Dev/test only: this endpoint has no auth and no payment-provider
   * signature verification, so it must never be reachable in production —
   * doing so lets any user self-approve a real subscription for free.
   * Replace with a real bKash/Nagad/Stripe webhook (verified signature)
   * before removing this guard.
   */
  async simulateCallback(req: AuthRequest, res: Response): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const { transactionId, status } = req.body;

      if (!transactionId || !status) {
        res.status(400).json({ error: 'Missing parameters' });
        return;
      }

      const txn = await prisma.transaction.findUnique({ where: { transactionId } });
      if (!txn) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }

      if (txn.status !== 'PENDING') {
        res.status(400).json({ error: 'Transaction already processed' });
        return;
      }

      const updatedTxn = await prisma.transaction.update({
        where: { transactionId },
        data: { status }
      });

      if (status === 'SUCCESS') {
        const user = await prisma.user.findUnique({ where: { id: txn.userId } });

        if (txn.purpose === 'SUBSCRIPTION' && txn.planId) {
          const plan = await prisma.subscriptionPlan.findUnique({ where: { id: txn.planId } });
          if (plan) {
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + plan.durationMonths);

            // Save active user subscription
            await prisma.userSubscription.create({
              data: {
                userId: txn.userId,
                planId: txn.planId,
                startDate: new Date(),
                endDate,
                status: 'ACTIVE'
              }
            });

            // Update user status
            await prisma.user.update({
              where: { id: txn.userId },
              data: { subscription_status: 'REGISTERED' }
            });

            // Trigger SMS notifications
            const activeMsg = `Success! Your "${plan.name}" subscription has been activated until ${endDate.toLocaleDateString()}. Thank you for choosing us!`;
            const guardianMsg = `Alert: Your ward has subscribed to the "${plan.name}" premium academic quiz plan.`;
            await smsService.notifyUserAndGuardian(txn.userId, activeMsg, guardianMsg);
          }
        } else if (txn.purpose === 'PAY_PER_EXAM' && txn.examId) {
          await prisma.paidExamAccess.create({
            data: {
              userId: txn.userId,
              examId: txn.examId
            }
          });

          // SMS alerts
          const activeMsg = `Payment Successful! You unlocked exam reference ID: ${txn.examId.substring(0, 8)} successfully.`;
          const guardianMsg = `Alert: Your ward unlocked exam ID: ${txn.examId.substring(0, 8)} for ৳${txn.amount}.`;
          await smsService.notifyUserAndGuardian(txn.userId, activeMsg, guardianMsg);
        }
      }

      res.json({ success: true, transaction: updatedTxn });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Fetch invoice history.
   */
  async getBillingHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const txns = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      res.json(txns);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
