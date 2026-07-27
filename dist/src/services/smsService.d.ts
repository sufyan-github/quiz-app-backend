export declare const smsService: {
    /**
     * Helper to fetch active SMS config or create default one.
     */
    getConfig(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        provider: string;
        costPerSms: number;
        senderId: string | null;
    }>;
    /**
     * Send SMS to a specific mobile number (Student or Guardian)
     */
    sendSms(mobile: string, message: string, userId?: string): Promise<{
        message: string;
        id: string;
        mobile: string;
        createdAt: Date;
        status: string;
    }>;
    /**
     * Send notification to user AND their linked guardian (if configured)
     */
    notifyUserAndGuardian(userId: string, studentMsg: string, guardianMsg: string): Promise<void>;
};
//# sourceMappingURL=smsService.d.ts.map