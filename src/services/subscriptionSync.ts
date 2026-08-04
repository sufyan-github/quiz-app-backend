import { prisma } from '../prisma';

// The Tk 2.78/day rate quoted on the landing page and in the BDApps
// registration form - the only real price this app charges today via
// telco direct-carrier-billing. Not user-editable; if BDApps ever returns
// a price in its responses, prefer that over this constant.
const BDAPPS_DAILY_RATE_BDT = 2.78;

export type SubscriptionSyncSource = 'OTP_VERIFY' | 'WEBHOOK' | 'MANUAL_CHECK';

interface SyncParams {
  userId: string;
  status: string; // REGISTERED | UNSUBSCRIBED (whatever BDApps returns, passed through as-is)
  referenceNo?: string | null;
  operator?: string | null; // BDApps does not return this today - left null until it does
  source: SubscriptionSyncSource;
}

// The single place that writes BDApps subscription state to the database.
// Called from bdappsController.verifyOtp (initial subscribe), the BDApps
// webhook handler (subscriptionController.handleWebhook), and the manual
// recheck endpoint (subscriptionController.verifyNow) - nowhere else
// should touch Subscription or User.subscription_status for BDApps state.
export async function syncBdappsSubscription({ userId, status, referenceNo, operator, source }: SyncParams): Promise<void> {
  const normalizedStatus = status === 'REGISTERED' ? 'REGISTERED' : 'UNSUBSCRIBED';

  await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { subscriber_id: userId } });
    const wasRegistered = existing?.status === 'REGISTERED';

    await tx.subscription.upsert({
      where: { subscriber_id: userId },
      update: {
        status: normalizedStatus,
        operator: operator ?? existing?.operator ?? null,
        referenceNo: referenceNo ?? existing?.referenceNo ?? null,
        lastCheckedAt: new Date(),
      },
      create: {
        subscriber_id: userId,
        status: normalizedStatus,
        operator: operator ?? null,
        referenceNo: referenceNo ?? null,
        lastCheckedAt: new Date(),
      },
    });

    await tx.user.update({ where: { id: userId }, data: { subscription_status: normalizedStatus } });

    if (normalizedStatus === 'REGISTERED' && !wasRegistered) {
      const transactionId = referenceNo || `bdapps_${source.toLowerCase()}_${userId}_${Date.now()}`;
      await tx.transaction.upsert({
        where: { transactionId },
        update: {},
        create: {
          userId,
          amount: BDAPPS_DAILY_RATE_BDT,
          currency: 'BDT',
          status: 'SUCCESS',
          provider: 'BDAPPS',
          transactionId,
          purpose: 'SUBSCRIPTION',
        },
      });
    }
  }, { isolationLevel: 'Serializable' });
}
