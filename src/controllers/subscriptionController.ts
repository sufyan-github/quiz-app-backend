import { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/authMiddleware';
import { prisma } from '../prisma';
import { bdappsController } from './bdappsController';
import { bdappsService } from '../services/bdappsService';
import { syncBdappsSubscription } from '../services/subscriptionSync';
import { realtimeService } from '../services/realtimeService';

// This is the ONLY subscription mechanism this app actually has: BDApps
// telco (Robi/Airtel) direct-carrier-billing, Tk 2.78/day. There is no
// separate "purchase"/"renewal" API to call - completing the real OTP
// flow IS the purchase, and the telco operator auto-renews daily on its
// own systems with no app-initiated call. Anything below that looks like
// a generic payment-gateway endpoint delegates to that real flow rather
// than reimplementing or simulating one.

async function isUserPremium(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userSubscriptions: { where: { status: 'ACTIVE', endDate: { gt: new Date() } } } },
  });
  if (!user) return false;
  return user.subscription_status === 'REGISTERED' || user.userSubscriptions.length > 0;
}

async function currentSubscriptionState(userId: string) {
  const [user, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.subscription.findFirst({ where: { subscriber_id: userId }, orderBy: { updated_at: 'desc' } }),
  ]);
  if (!user) return null;

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

export const subscriptionController = {
  // Thin, honest alias: "starting a subscription" for this app IS sending
  // the real BDApps OTP (mode=register). No separate logic to duplicate.
  async start(req: Request, res: Response): Promise<void> {
    req.body.mode = 'register';
    await bdappsController.sendOtp(req, res);
  },

  async status(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

      const state = await currentSubscriptionState(userId);
      if (!state) { res.status(404).json({ success: false, message: 'User not found' }); return; }

      res.json({ success: true, data: state });
    } catch (error: any) {
      console.error('Subscription Status Error:', error.message);
      res.status(500).json({ success: false, message: 'Server error fetching subscription status' });
    }
  },

  // Alias of status() - kept as a separate route only because it was
  // requested by name; same handler, not duplicated logic.
  async me(req: AuthRequest, res: Response): Promise<void> {
    await subscriptionController.status(req, res);
  },

  async history(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

      const transactions = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: transactions });
    } catch (error: any) {
      console.error('Subscription History Error:', error.message);
      res.status(500).json({ success: false, message: 'Server error fetching subscription history' });
    }
  },

  async plans(req: Request, res: Response): Promise<void> {
    try {
      // The generic plan system (card/wallet checkout) - separate from
      // BDApps flat-rate billing. Not the primary path today, but real
      // (paymentController.initiateCheckout writes real Transaction rows
      // against these plans); kept available for a future non-telco
      // checkout option rather than removed.
      const plans = await prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { price: 'asc' } });
      res.json({ success: true, data: plans });
    } catch (error: any) {
      console.error('Subscription Plans Error:', error.message);
      res.status(500).json({ success: false, message: 'Server error fetching plans' });
    }
  },

  // Forces a fresh check against the real BDApps getStatus API (via the
  // PHP gateway) rather than waiting for the next webhook delivery.
  async verifyNow(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.mobile) {
        res.status(400).json({ success: false, message: 'No mobile number on file for this account' });
        return;
      }

      const result = await bdappsService.checkSubscription(user.mobile);
      if (result.subscriptionStatus && result.subscriptionStatus !== 'UNKNOWN') {
        await syncBdappsSubscription({
          userId,
          status: result.subscriptionStatus,
          referenceNo: null,
          source: 'MANUAL_CHECK',
        });
      }

      const state = await currentSubscriptionState(userId);
      res.json({ success: true, data: state, gatewayResponse: result });
    } catch (error: any) {
      console.error('Subscription Verify Error:', error.message);
      res.status(500).json({ success: false, message: 'Server error verifying subscription' });
    }
  },

  // Does NOT call a BDApps "cancel" API - no such endpoint exists in this
  // integration (or, as far as could be confirmed, in BDApps's product at
  // all: telco DCB subscriptions are cancelled by the subscriber via SMS
  // to the operator, not by the app). Returns the real, already-published
  // unsubscribe instructions instead of faking a cancellation.
  async cancel(req: AuthRequest, res: Response): Promise<void> {
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
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const payload = req.body || {};
    const subscriberId: string | undefined = payload.subscriberId;
    const status: string | undefined = payload.status;
    const mobile = subscriberId ? subscriberId.replace(/^tel:88/, '') : undefined;

    // Idempotency: BDApps (or any webhook sender) may redeliver the same
    // event. Hash the payload + a coarse time bucket so an identical
    // redelivery within the same minute is a no-op, not a double-write.
    const timeBucket = Math.floor(Date.now() / 60000);
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${subscriberId ?? ''}:${status ?? ''}:${timeBucket}`)
      .digest('hex');

    const alreadySeen = await prisma.webhookLog.findUnique({ where: { idempotencyKey } });
    if (alreadySeen) {
      res.json({ statusCode: 'S1000', statusDetail: 'Already processed (duplicate delivery)' });
      return;
    }

    let processingNote = 'ok';
    let processed = false;

    try {
      if (mobile && status) {
        const user = await prisma.user.findUnique({ where: { mobile } });
        if (user) {
          await syncBdappsSubscription({ userId: user.id, status, referenceNo: null, source: 'WEBHOOK' });
          realtimeService.emit('subscription', 'premium_status_changed', { subscriptionStatus: status }, user.id);
          await prisma.notification.create({
            data: {
              userId: user.id,
              title: status === 'REGISTERED' ? 'Subscription activated' : 'Subscription ended',
              message: status === 'REGISTERED'
                ? 'Your Quiz AI subscription is now active. All premium features are unlocked.'
                : 'Your Quiz AI subscription has ended.',
            },
          });
          processed = true;
        } else {
          processingNote = `no user found for mobile ${mobile}`;
        }
      } else {
        processingNote = 'missing subscriberId or status in payload';
      }
    } catch (error: any) {
      processingNote = `error: ${error.message}`;
    }

    await prisma.webhookLog.create({
      data: {
        source: 'BDAPPS',
        subscriberId: subscriberId ?? null,
        mobile: mobile ?? null,
        rawPayload: payload,
        receivedStatus: status ?? null,
        signatureValid: true, // this handler only runs after signature middleware passes
        processed,
        processingNote,
        idempotencyKey,
      },
    });

    res.json({ statusCode: 'S1000', statusDetail: 'Success' });
  },
};
