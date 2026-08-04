"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsService = void 0;
const prisma_1 = require("../prisma");
exports.smsService = {
    /**
     * Helper to fetch active SMS config or create default one.
     */
    async getConfig() {
        let config = await prisma_1.prisma.smsGatewayConfig.findFirst();
        if (!config) {
            config = await prisma_1.prisma.smsGatewayConfig.create({
                data: {
                    provider: 'DISABLED',
                    costPerSms: 0.30,
                    senderId: 'QUIZAPP'
                }
            });
        }
        return config;
    },
    /**
     * Send SMS to a specific mobile number (Student or Guardian)
     */
    async sendSms(mobile, message, userId) {
        try {
            const config = await this.getConfig();
            const cleanMobile = mobile.replace(/\D+/g, '');
            if (config.provider === 'MOCK' || config.provider === 'DISABLED') {
                return prisma_1.prisma.smsLog.create({
                    data: { mobile: cleanMobile, message, status: 'SKIPPED' },
                });
            }
            throw new Error(`Unsupported SMS provider: ${config.provider}`);
        }
        catch (err) {
            console.error('Failed to send SMS:', err.message);
            // Even if failed, log the attempt
            try {
                await prisma_1.prisma.smsLog.create({
                    data: {
                        mobile: mobile,
                        message: message,
                        status: 'FAILED',
                    }
                });
            }
            catch (logErr) { }
        }
    },
    /**
     * Send notification to user AND their linked guardian (if configured)
     */
    async notifyUserAndGuardian(userId, studentMsg, guardianMsg) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            include: { guardianLink: true }
        });
        if (!user)
            return;
        // Send to student
        if (user.mobile) {
            await this.sendSms(user.mobile, studentMsg, userId);
        }
        // Send to guardian if linked
        if (user.guardianLink && user.guardianLink.active && user.guardianLink.guardianMobile) {
            await this.sendSms(user.guardianLink.guardianMobile, guardianMsg, userId);
        }
    }
};
