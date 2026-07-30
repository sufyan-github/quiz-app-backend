export type SubscriptionSyncSource = 'OTP_VERIFY' | 'WEBHOOK' | 'MANUAL_CHECK';
interface SyncParams {
    userId: string;
    status: string;
    referenceNo?: string | null;
    operator?: string | null;
    source: SubscriptionSyncSource;
}
export declare function syncBdappsSubscription({ userId, status, referenceNo, operator, source }: SyncParams): Promise<void>;
export {};
//# sourceMappingURL=subscriptionSync.d.ts.map