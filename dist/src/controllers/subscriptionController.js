"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionController = void 0;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../prisma");
const bdappsController_1 = require("./bdappsController");
const bdappsService_1 = require("../services/bdappsService");
const subscriptionSync_1 = require("../services/subscriptionSync");
const realtimeService_1 = require("../services/realtimeService");
// This is the ONLY subscription mechanism this app actually has: BDApps
// telco (Robi/Airtel) direct-carrier-billing, Tk 2.78/day. There is no
// separate "purchase"/"renewal" API to call - completing the real OTP
// flow IS the purchase, and the telco operator auto-renews daily on its
// own systems with no app-initiated call. Anything below that looks like
// a generic payment-gateway endpoint delegates to that real flow rather
// than reimplementing or simulating one.
async function isUserPremium(userId) {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        include: { userSubscriptions: { where: { status: 'ACTIVE', endDate: { gt: new Date() } } } },
    });
    if (!user)
        return false;
    return user.subscription_status === 'REGISTERED' || user.userSubscriptions.length > 0;
}
async function currentSubscriptionState(userId) {
    const [user, subscription] = await Promise.all([
        prisma_1.prisma.user.findUnique({ where: { id: userId } }),
        prisma_1.prisma.subscription.findFirst({ where: { subscriber_id: userId }, orderBy: { updated_at: 'desc' } }),
    ]);
    if (!user)
        return null;
    return {
        isPremium: await isUserPremium(userId),
        subscriptionStatus: user.subscription_status,
        mobile: user.mobile,
        bdapps: subscription
            ? {
                status: subscription.status,
                operator: subscription.operator,
                referenceNo: subscription.referenceNo,
                lastCheckedAt: subscription.lastCheckedAt,
                updatedAt: subscription.updated_at,
            }
            : null,
    };
}
exports.subscriptionController = {
    // Thin, honest alias: "starting a subscription" for this app IS sending
    // the real BDApps OTP (mode=register). No separate logic to duplicate.
    async start(req, res) {
        req.body.mode = 'register';
        await bdappsController_1.bdappsController.sendOtp(req, res);
    },
    async status(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const state = await currentSubscriptionState(userId);
            if (!state) {
                res.status(404).json({ success: false, message: 'User not found' });
                return;
            }
            res.json({ success: true, data: state });
        }
        catch (error) {
            console.error('Subscription Status Error:', error.message);
            res.status(500).json({ success: false, message: 'Server error fetching subscription status' });
        }
    },
    // Alias of status() - kept as a separate route only because it was
    // requested by name; same handler, not duplicated logic.
    async me(req, res) {
        await exports.subscriptionController.status(req, res);
    },
    async history(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const transactions = await prisma_1.prisma.transaction.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            });
            res.json({ success: true, data: transactions });
        }
        catch (error) {
            console.error('Subscription History Error:', error.message);
            res.status(500).json({ success: false, message: 'Server error fetching subscription history' });
        }
    },
    async plans(req, res) {
        try {
            // The generic plan system (card/wallet checkout) - separate from
            // BDApps flat-rate billing. Not the primary path today, but real
            // (paymentController.initiateCheckout writes real Transaction rows
            // against these plans); kept available for a future non-telco
            // checkout option rather than removed.
            const plans = await prisma_1.prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { price: 'asc' } });
            res.json({ success: true, data: plans });
        }
        catch (error) {
            console.error('Subscription Plans Error:', error.message);
            res.status(500).json({ success: false, message: 'Server error fetching plans' });
        }
    },
    // Forces a fresh check against the real BDApps getStatus API (via the
    // PHP gateway) rather than waiting for the next webhook delivery.
    async verifyNow(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user?.mobile) {
                res.status(400).json({ success: false, message: 'No mobile number on file for this account' });
                return;
            }
            const result = await bdappsService_1.bdappsService.checkSubscription(user.mobile);
            if (result.subscriptionStatus && result.subscriptionStatus !== 'UNKNOWN') {
                await (0, subscriptionSync_1.syncBdappsSubscription)({
                    userId,
                    status: result.subscriptionStatus,
                    referenceNo: null,
                    source: 'MANUAL_CHECK',
                });
            }
            const state = await currentSubscriptionState(userId);
            res.json({ success: true, data: state, gatewayResponse: result });
        }
        catch (error) {
            console.error('Subscription Verify Error:', error.message);
            res.status(500).json({ success: false, message: 'Server error verifying subscription' });
        }
    },
    // Does NOT call a BDApps "cancel" API - no such endpoint exists in this
    // integration (or, as far as could be confirmed, in BDApps's product at
    // all: telco DCB subscriptions are cancelled by the subscriber via SMS
    // to the operator, not by the app). Returns the real, already-published
    // unsubscribe instructions instead of faking a cancellation.
    async cancel(req, res) {
        res.json({
            success: false,
            requiresManualAction: true,
            message: 'Quiz AI cannot cancel a Robi/Airtel subscription on your behalf. To unsubscribe, send "STOP aiquizmaster" by SMS to 21213 from the subscribed number. The subscription will update automatically once the operator confirms.',
        });
    },
    // Internal endpoint - called only by the PHP gateway's callback.php,
    // HMAC-signed the same way Node signs its own calls to PHP (see
    // phpGatewayClient.ts / Security.php), verified in
    // middleware/verifyPhpWebhookSignature.ts. This replaces callback.php's
    // previous raw-SQL direct write, making this the one real place BDApps
    // webhook events reach the database.
    async handleWebhook(req, res) {
        const payload = req.body || {};
        const subscriberId = payload.subscriberId;
        const status = payload.status === 'REGISTERED' ? 'REGISTERED' : payload.status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : undefined;
        const mobile = subscriberId && /^tel:8801[3-9][0-9]{8}$/.test(subscriberId)
            ? subscriberId.replace(/^tel:88/, '')
            : undefined;
        if (!mobile || !status) {
            res.status(400).json({ statusCode: 'FAILED', statusDetail: 'Invalid verified webhook payload' });
            return;
        }
        // Use the provider event identifier when available. Otherwise hash the
        // verified payload; identical redeliveries remain idempotent forever.
        const idempotencyKey = crypto_1.default
            .createHash('sha256')
            .update(String(payload.providerEventId || JSON.stringify(payload)))
            .digest('hex');
        const alreadySeen = await prisma_1.prisma.webhookLog.findUnique({ where: { idempotencyKey } });
        if (alreadySeen) {
            res.json({ statusCode: 'S1000', statusDetail: 'Already processed (duplicate delivery)' });
            return;
        }
        try {
            const user = await prisma_1.prisma.user.findUnique({ where: { mobile } });
            if (!user) {
                await prisma_1.prisma.webhookLog.create({
                    data: {
                        source: 'BDAPPS', subscriberId, mobile, rawPayload: payload,
                        receivedStatus: status, signatureValid: true, processed: false,
                        processingNote: 'no matching user', idempotencyKey,
                    },
                });
                res.status(404).json({ statusCode: 'FAILED', statusDetail: 'Subscriber is not linked to an account' });
                return;
            }
            await (0, subscriptionSync_1.syncBdappsSubscription)({ userId: user.id, status, referenceNo: null, source: 'WEBHOOK' });
            const notification = await prisma_1.prisma.notification.create({
                data: {
                    userId: user.id,
                    title: status === 'REGISTERED' ? 'Subscription activated' : 'Subscription ended',
                    message: status === 'REGISTERED'
                        ? 'Your Quiz AI subscription is now active. All premium features are unlocked.'
                        : 'Your Quiz AI subscription has ended.',
                },
            });
            await prisma_1.prisma.webhookLog.create({
                data: {
                    source: 'BDAPPS', subscriberId, mobile, rawPayload: payload,
                    receivedStatus: status, signatureValid: true, processed: true,
                    processingNote: 'ok', idempotencyKey,
                },
            });
            realtimeService_1.realtimeService.emit('premium', 'premium_status_changed', { subscriptionStatus: status }, user.id);
            realtimeService_1.realtimeService.emit('notifications', 'notification_created', { notification }, user.id);
        }
        catch (error) {
            console.error('Subscription webhook processing failed:', error.message);
            res.status(500).json({ statusCode: 'RETRY', statusDetail: 'Webhook processing failed' });
            return;
        }
        res.json({ statusCode: 'S1000', statusDetail: 'Success' });
    },
};
