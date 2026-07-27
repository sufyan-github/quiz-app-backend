import { phpGatewayClient } from './phpGatewayClient';

// In-memory rate limiting map for OTP requests: mobile -> timestamp[]
const otpRateLimitMap = new Map<string, number[]>();

export function extractMobileDigits(raw: string): string {
  let digits = raw.replace(/\D+/g, '');
  if (digits.startsWith('880') && digits.length === 13) {
    return '0' + digits.substring(3);
  } else if (digits.startsWith('88') && digits.length === 12) {
    return '0' + digits.substring(2);
  }
  return digits;
}

export function formatSubscriberId(raw: string): string {
  const digits = extractMobileDigits(raw);
  return `tel:88${digits}`;
}

export const bdappsService = {
  
  checkRateLimit(mobileDigits: string): { allowed: boolean; retryAfterSec?: number } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const maxRequests = 3;

    const timestamps = (otpRateLimitMap.get(mobileDigits) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0];
      const waitSec = Math.ceil((windowMs - (now - oldest)) / 1000);
      return { allowed: false, retryAfterSec: waitSec };
    }
    timestamps.push(now);
    otpRateLimitMap.set(mobileDigits, timestamps);
    return { allowed: true };
  },

  async sendOtp(subscriberId: string, digits: string) {
    const cleanDigits = extractMobileDigits(digits || subscriberId);
    const formattedSubId = formatSubscriberId(subscriberId);

    // 1. Check Rate Limiting
    const rateCheck = this.checkRateLimit(cleanDigits);
    if (!rateCheck.allowed) {
      console.warn(`[BDApps RateLimit] Too many OTP requests for ${cleanDigits}. Wait ${rateCheck.retryAfterSec}s.`);
      return {
        success: false,
        statusCode: 'E1329',
        statusDetail: `Rate limit exceeded. Please wait ${rateCheck.retryAfterSec} seconds before requesting another OTP.`,
        retryAfterSec: rateCheck.retryAfterSec
      };
    }

    try {
      console.log(`[Proxy] Forwarding OTP Request for ${formattedSubId} to PHP Gateway`);
      const response = await phpGatewayClient.post('/otp_request.php', {
        subscriberId: formattedSubId
      });

      if (response?.statusCode === 'S1000' && response?.referenceNo) {
        return {
          success: true,
          referenceNo: response.referenceNo,
          statusCode: response.statusCode,
          statusDetail: response.statusDetail || 'Success'
        };
      }

      return {
        success: false,
        statusCode: response?.statusCode || 'E1000',
        statusDetail: response?.statusDetail || 'Failed to request OTP via Gateway'
      };

    } catch (err: any) {
      console.error(`[Proxy Error] OTP Request Failed:`, err.message);
      
      // Development Fallback Support
      if (process.env.NODE_ENV === 'development') {
        return {
          success: true,
          referenceNo: `mock_ref_${cleanDigits}`,
          statusCode: 'S1000',
          statusDetail: 'Success (Dev Fallback - Gateway Error)'
        };
      }

      return {
        success: false,
        statusCode: 'E1601',
        statusDetail: `Gateway communication failure: ${err.message}`
      };
    }
  },

  async verifyOtp(referenceNo: string, otp: string) {
    if (referenceNo.startsWith('mock_ref_')) {
      const cleanDigits = referenceNo.replace('mock_ref_', '') || '01896283924';
      if (process.env.NODE_ENV === 'development') {
        if (otp === '123456') {
          return {
            statusCode: 'S1000',
            statusDetail: 'Success (Dev Verified)',
            subscriberId: `tel:88${cleanDigits}`,
            subscriptionStatus: 'REGISTERED'
          };
        } else {
          return {
            statusCode: 'E1357',
            statusDetail: 'Invalid or wrong OTP code entered.'
          };
        }
      }
    }

    try {
      console.log(`[Proxy] Forwarding OTP Verify for Ref ${referenceNo} to PHP Gateway`);
      const response = await phpGatewayClient.post('/otp_verify.php', {
        referenceNo,
        otp
      });

      if (response?.statusCode === 'S1000') {
        return {
          statusCode: 'S1000',
          statusDetail: response.statusDetail || 'Success',
          subscriberId: response.subscriberId || `tel:8801896283924`,
          subscriptionStatus: response.subscriptionStatus || 'REGISTERED'
        };
      }

      if (response?.statusCode === 'E1357') {
        return {
          statusCode: 'E1357',
          statusDetail: 'Invalid or expired OTP code entered.'
        };
      }

      return {
        statusCode: response?.statusCode || 'FAILED',
        statusDetail: response?.statusDetail || 'OTP verification failed via Gateway'
      };

    } catch (err: any) {
      console.error(`[Proxy Error] Verify Exception:`, err.message);
      return {
        statusCode: 'E1601',
        statusDetail: `Network error during Gateway OTP verification: ${err.message}`
      };
    }
  },

  async checkSubscription(subscriberId: string) {
    const formattedSubId = formatSubscriberId(subscriberId);

    try {
      console.log(`[Proxy] Forwarding Subscription Check for ${formattedSubId} to PHP Gateway`);
      const response = await phpGatewayClient.post('/status.php', {
        subscriberId: formattedSubId
      });

      // The PHP gateway automatically updates the DB during a status check,
      // but if Render needs to double check, we could do it here too.
      // We rely on PHP gateway updating the DB.

      if (response?.statusCode) {
        return response;
      }
      return { statusCode: 'E1000', statusDetail: 'Gateway returned an unrecognized response' };
    } catch (err: any) {
      console.error(`[Proxy Error] Check Subscription Exception:`, err.message);
      // Do NOT default to REGISTERED here: this must not silently grant
      // premium access when the gateway is unreachable. Real access control
      // reads `user.subscription_status` from the DB (authMiddleware.requirePremium),
      // which this failure does not touch, so the caller must treat this as
      // "status unknown" rather than "user is subscribed".
      return {
        statusCode: 'E1601',
        statusDetail: `Gateway communication failure: ${err.message}`,
        subscriptionStatus: 'UNKNOWN'
      };
    }
  }
};
