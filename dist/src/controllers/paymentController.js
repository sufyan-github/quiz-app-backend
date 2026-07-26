"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentController = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const smsService_1 = require("../services/smsService");
exports.paymentController = {
    /**
     * Get active subscription plans for students
     */
    async getPlans(req, res) {
        try {
            const plans = await prisma_1.default.subscriptionPlan.findMany({
                where: { active: true },
                orderBy: { price: 'asc' }
            });
            res.json(plans);
        }
        catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    /**
     * Initiate mock checkout session.
     */
    async initiateCheckout(req, res) {
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
                const plan = await prisma_1.default.subscriptionPlan.findUnique({ where: { id: planId } });
                if (!plan) {
                    res.status(404).json({ error: 'Subscription plan not found' });
                    return;
                }
                amount = plan.price;
            }
            // Check for coupons
            if (couponCode) {
                const coupon = await prisma_1.default.coupon.findUnique({
                    where: { code: couponCode, active: true }
                });
                if (coupon && coupon.expiryDate > new Date()) {
                    if (coupon.discountType === 'PERCENTAGE') {
                        amount = Math.max(0, amount - (amount * coupon.discountValue / 100));
                    }
                    else if (coupon.discountType === 'FIXED') {
                        amount = Math.max(0, amount - coupon.discountValue);
                    }
                }
            }
            const transactionId = `txn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            // Create transaction record
            const txn = await prisma_1.default.transaction.create({
                data: {
                    userId,
                    amount,
                    provider: provider || 'BKASH',
                    transactionId,
                    purpose,
                    planId: purpose === 'SUBSCRIPTION' ? planId : null,
                    examId: purpose === 'PAY_PER_EXAM' ? examId : null,
                    status: 'PENDING'
                }
            });
            res.json({
                success: true,
                transactionId,
                amount,
                checkoutUrl: `/api/payment/simulate-checkout?txnId=${transactionId}`
            });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    /**
     * Callback receiver for payment webhook simulation.
     */
    async simulateCallback(req, res) {
        try {
            const { transactionId, status } = req.body;
            if (!transactionId || !status) {
                res.status(400).json({ error: 'Missing parameters' });
                return;
            }
            const txn = await prisma_1.default.transaction.findUnique({ where: { transactionId } });
            if (!txn) {
                res.status(404).json({ error: 'Transaction not found' });
                return;
            }
            if (txn.status !== 'PENDING') {
                res.status(400).json({ error: 'Transaction already processed' });
                return;
            }
            const updatedTxn = await prisma_1.default.transaction.update({
                where: { transactionId },
                data: { status }
            });
            if (status === 'SUCCESS') {
                const user = await prisma_1.default.user.findUnique({ where: { id: txn.userId } });
                if (txn.purpose === 'SUBSCRIPTION' && txn.planId) {
                    const plan = await prisma_1.default.subscriptionPlan.findUnique({ where: { id: txn.planId } });
                    if (plan) {
                        const endDate = new Date();
                        endDate.setMonth(endDate.getMonth() + plan.durationMonths);
                        // Save active user subscription
                        await prisma_1.default.userSubscription.create({
                            data: {
                                userId: txn.userId,
                                planId: txn.planId,
                                startDate: new Date(),
                                endDate,
                                status: 'ACTIVE'
                            }
                        });
                        // Update user status
                        await prisma_1.default.user.update({
                            where: { id: txn.userId },
                            data: { subscription_status: 'REGISTERED' }
                        });
                        // Trigger SMS notifications
                        const activeMsg = `Success! Your "${plan.name}" subscription has been activated until ${endDate.toLocaleDateString()}. Thank you for choosing us!`;
                        const guardianMsg = `Alert: Your ward has subscribed to the "${plan.name}" premium academic quiz plan.`;
                        await smsService_1.smsService.notifyUserAndGuardian(txn.userId, activeMsg, guardianMsg);
                    }
                }
                else if (txn.purpose === 'PAY_PER_EXAM' && txn.examId) {
                    await prisma_1.default.paidExamAccess.create({
                        data: {
                            userId: txn.userId,
                            examId: txn.examId
                        }
                    });
                    // SMS alerts
                    const activeMsg = `Payment Successful! You unlocked exam reference ID: ${txn.examId.substring(0, 8)} successfully.`;
                    const guardianMsg = `Alert: Your ward unlocked exam ID: ${txn.examId.substring(0, 8)} for ৳${txn.amount}.`;
                    await smsService_1.smsService.notifyUserAndGuardian(txn.userId, activeMsg, guardianMsg);
                }
            }
            res.json({ success: true, transaction: updatedTxn });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    /**
     * Fetch invoice history.
     */
    async getBillingHistory(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            const txns = await prisma_1.default.transaction.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' }
            });
            res.json(txns);
        }
        catch (err) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};
//# sourceMappingURL=paymentController.js.map