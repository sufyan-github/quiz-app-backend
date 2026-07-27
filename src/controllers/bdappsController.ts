import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { bdappsService } from '../services/bdappsService';
import { JWT_SECRET } from '../config/jwt';

export const bdappsController = {
  
  async sendOtp(req: Request, res: Response): Promise<void> {
    try {
      const rawMobile = req.body.user_mobile || req.body.phoneNumber || req.body.mobile || '';
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

      if (!Otp || !referenceNo) {
        res.status(400).json({ statusCode: 'FAILED', message: 'Missing OTP code or referenceNo' });
        return;
      }

      const data = await bdappsService.verifyOtp(referenceNo, Otp);
      
      if (data.statusCode === 'S1000' && data.subscriberId) {
        const mobile = data.subscriberId.replace('tel:88', '0');
        
        let user = await prisma.user.findUnique({ where: { mobile } });
        
        if (!user) {
          user = await prisma.user.create({
            data: {
              mobile,
              email: `${mobile}@example.com`,
              subscription_status: data.subscriptionStatus || 'REGISTERED'
            }
          });
        } else {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { subscription_status: data.subscriptionStatus || 'REGISTERED' }
          });
        }
        
        const token = jwt.sign(
          { userId: user.id, mobile: user.mobile, role: user.role },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        res.json({
          statusCode: 'S1000',
          statusDetail: data.statusDetail || 'Success',
          subscriberId: data.subscriberId,
          subscriptionStatus: data.subscriptionStatus || 'REGISTERED',
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
      const subscriberId = req.body.subscriberId || req.query.subscriberId as string;
      
      if (!subscriberId) {
        res.status(400).json({ success: false, message: 'subscriberId required' });
        return;
      }

      const data = await bdappsService.checkSubscription(subscriberId);
      res.json(data);
    } catch (error: any) {
      console.error('Check Subscription Error:', error.message);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};
