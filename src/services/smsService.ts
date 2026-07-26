import { prisma } from '../prisma';

export const smsService = {
  /**
   * Helper to fetch active SMS config or create default one.
   */
  async getConfig() {
    let config = await prisma.smsGatewayConfig.findFirst();
    if (!config) {
      config = await prisma.smsGatewayConfig.create({
        data: {
          provider: 'MOCK',
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
  async sendSms(mobile: string, message: string, userId?: string) {
    try {
      const config = await this.getConfig();
      const cleanMobile = mobile.replace(/\D+/g, '');

      // Simulate sending via SMS gateway
      console.log(`[SMS OUTBOX] To: ${cleanMobile} | Msg: "${message}" | Cost: ৳${config.costPerSms}`);

      // Log the SMS transaction in database
      const log = await prisma.smsLog.create({
        data: {
          mobile: cleanMobile,
          message: message,
          status: 'DELIVERED', // Simulate success status
        }
      });

      return log;
    } catch (err: any) {
      console.error('Failed to send SMS:', err.message);
      // Even if failed, log the attempt
      try {
        await prisma.smsLog.create({
          data: {
            mobile: mobile,
            message: message,
            status: 'FAILED',
          }
        });
      } catch (logErr) {}
    }
  },

  /**
   * Send notification to user AND their linked guardian (if configured)
   */
  async notifyUserAndGuardian(userId: string, studentMsg: string, guardianMsg: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { guardianLink: true }
    });

    if (!user) return;

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
