"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncBdappsSubscription = syncBdappsSubscription;
const prisma_1 = require("../prisma");
// The Tk 2.78/day rate quoted on the landing page and in the BDApps
// registration form - the only real price this app charges today via
// telco direct-carrier-billing. Not user-editable; if BDApps ever returns
// a price in its responses, prefer that over this constant.
const BDAPPS_DAILY_RATE_BDT = 2.78;
// The single place that writes BDApps subscription state to the database.
// Called from bdappsController.verifyOtp (initial subscribe), the BDApps
// webhook handler (subscriptionController.handleWebhook), and the manual
// recheck endpoint (subscriptionController.verifyNow) - nowhere else
// should touch Subscription or User.subscription_status for BDApps state.
async function syncBdappsSubscription({ userId, status, referenceNo, operator, source }) {
    const existing = await prisma_1.prisma.subscription.findFirst({ where: { subscriber_id: userId } });
    const wasRegistered = existing?.status === 'REGISTERED';
    if (existing) {
        await prisma_1.prisma.subscription.update({
            where: { id: existing.id },
            data: {
                status,
                operator: operator ?? existing.operator,
                referenceNo: referenceNo ?? existing.referenceNo,
                lastCheckedAt: new Date(),
            },
        });
    }
    else {
        await prisma_1.prisma.subscription.create({
            data: { subscriber_id: userId, status, operator: operator ?? null, referenceNo: referenceNo ?? null, lastCheckedAt: new Date() },
        });
    }
    await prisma_1.prisma.user.update({ where: { id: userId }, data: { subscription_status: status } });
    // Only log a Transaction on a genuine new-activation transition - never
    // fabricate a "transaction" for an unsubscribe event or a no-op status
    // refresh where nothing actually changed hands.
    if (status === 'REGISTERED' && !wasRegistered) {
        const transactionId = referenceNo || `bdapps_${source.toLowerCase()}_${userId}_${Date.now()}`;
        const alreadyLogged = await prisma_1.prisma.transaction.findUnique({ where: { transactionId } });
        if (!alreadyLogged) {
            await prisma_1.prisma.transaction.create({
                data: {
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
    }
}
//# sourceMappingURL=subscriptionSync.js.map