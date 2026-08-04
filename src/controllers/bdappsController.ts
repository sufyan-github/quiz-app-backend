import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { bdappsService } from '../services/bdappsService';
import { syncBdappsSubscription } from '../services/subscriptionSync';
import { issueAccessToken } from '../services/authService';

export const bdappsController = {
  
  async sendOtp(req: Request, res: Response): Promise<void> {
    try {
      const rawMobile = req.body.user_mobile || req.body.phoneNumber || req.body.mobile || '';
      // 'register' is the default so existing callers that don't pass a mode
      // keep today's create-or-login-transparently behavior.
      const mode = req.body.mode === 'login' ? 'login' : 'register';
      let digits = rawMobile.replace(/\D+/g, '');

      if (digits.startsWith('880') && digits.length === 13) {
        digits = '0' + digits.substring(3);
      } else if (digits.startsWith('88') && digits.length === 12) {
        digits = '0' + digits.substring(2);
      }

      if (!/^01[3-9][0-9]{8}$/.test(digits)) {
        res.status(400).json({ success: false, message: 'Invalid mobile number format. Must be an 11-digit BD mobile number (e.g., 01896283924).' });
        return;
      }

      // Check existence before spending a real OTP send: a login attempt for
      // an unregistered number, or a register attempt for an already-registered
      // one, should fail fast without ever calling out to BDApps.
      const existingUser = await prisma.user.findUnique({ where: { mobile: digits } });
      if (mode === 'login' && !existingUser) {
        res.json({ success: false, statusCode: 'USER_NOT_FOUND', message: 'This mobile number is not registered. Please register first.' });
        return;
      }
      if (mode === 'register' && existingUser) {
        res.json({ success: false, statusCode: 'USER_ALREADY_EXISTS', message: 'This number is already registered. Please log in.' });
        return;
      }

      const subscriberId = `tel:88${digits}`;
      const data = await bdappsService.sendOtp(subscriberId, digits);

      if (data.referenceNo) {
        res.json({
          success: true,
          referenceNo: data.referenceNo,
          statusCode: data.statusCode,
          statusDetail: data.statusDetail
        });
      } else {
        res.json({
          success: false,
          message: data.statusDetail || 'OTP reference not returned',
          statusCode: data.statusCode,
          retryAfterSec: data.retryAfterSec
        });
      }

    } catch (error: any) {
      console.error('Send OTP Error:', error.message);
      res.status(500).json({ success: false, message: 'Server error during OTP request' });
    }
  },

  async verifyOtp(req: Request, res: Response): Promise<void> {
    try {
      const Otp = req.body.Otp || req.body.otp || req.body.code;
      const referenceNo = req.body.referenceNo || req.body.ref;
      const mode = req.body.mode === 'login' ? 'login' : 'register';

      if (!Otp || !referenceNo) {
        res.status(400).json({ statusCode: 'FAILED', message: 'Missing OTP code or referenceNo' });
        return;
      }

      const data = await bdappsService.verifyOtp(referenceNo, Otp);

      if (data.statusCode === 'S1000' && data.subscriberId) {
        // .replace('tel:88', '0') substitutes the prefix instead of removing
        // it, which corrupts the number with an extra leading zero (since
        // the digits after tel:88 already start with 0). Strip the prefix
        // entirely instead.
        const mobile = data.subscriberId.replace(/^tel:88/, '');

        let user = await prisma.user.findUnique({ where: { mobile } });
        if (mode === 'login' && !user) {
          // The send-otp existence check should have already caught this;
          // this is a safety net so a login attempt never silently creates
          // an account.
          res.json({ statusCode: 'USER_NOT_FOUND', message: 'This mobile number is not registered. Please register first.' });
          return;
        }

        const subscriptionStatus = data.subscriptionStatus || 'REGISTERED';

        if (!user) {
          user = await prisma.user.create({
            data: {
              mobile,
              email: `${mobile}@users.quizai.local`,
              subscription_status: subscriptionStatus,
              // authController.register (email/password signup) creates a
              // Profile too; BDApps-registered users were missing one.
              profile: {
                create: { name: `User ${mobile}` }
              }
            }
          });
        }

        // Single real write path for BDApps subscription state - also
        // upserts the Subscription row and logs a Transaction on a genuine
        // new activation, so this is no longer just a bare string flip on
        // User. See subscriptionSync.ts.
        await syncBdappsSubscription({
          userId: user.id,
          status: subscriptionStatus,
          referenceNo,
          source: 'OTP_VERIFY',
        });
        user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

        const token = issueAccessToken(user);

        res.json({
          statusCode: 'S1000',
          statusDetail: data.statusDetail || 'Success',
          subscriberId: data.subscriberId,
          subscriptionStatus,
          token: token,
          user: {
            id: user.id,
            mobile: user.mobile,
            xp: user.xp,
            coins: user.coins,
            level: user.level
          }
        });
        return;
      }

      res.json(data);

    } catch (error: any) {
      console.error('Verify OTP Error:', error.message);
      res.status(500).json({ statusCode: 'FAILED', message: 'Server error during verification' });
    }
  },

  async checkSubscription(req: Request, res: Response): Promise<void> {
    try {
      const subscriberId = (req.body.subscriberId || req.query.subscriberId) as string;
      
      if (!subscriberId) {
        res.status(400).json({ success: false, message: 'subscriberId required' });
        return;
      }

      const data = await bdappsService.checkSubscription(subscriberId);

      // The PHP gateway no longer writes subscription state directly to
      // the database (see status.php) - this is now the only write path
      // for a status check, same as syncBdappsSubscription's other two
      // callers (OTP verify, the webhook). Mirrors status.php's old
      // fallback: S1000 with no explicit subscriptionStatus means REGISTERED.
      if (data?.statusCode === 'S1000') {
        const status = data.subscriptionStatus || 'REGISTERED';
        const mobile = String(subscriberId).replace(/^tel:88/, '');
        const user = await prisma.user.findUnique({ where: { mobile } });
        if (user) {
          await syncBdappsSubscription({ userId: user.id, status, referenceNo: null, source: 'MANUAL_CHECK' });
        }
      }

      res.json(data);
    } catch (error: any) {
      console.error('Check Subscription Error:', error.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};
