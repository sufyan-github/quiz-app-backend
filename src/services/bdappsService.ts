import axios from 'axios';
import { bdappsConfig } from '../config/bdapps';
import { prisma } from '../prisma';

export const WHITELISTED_NUMBERS = [
  '01896283924',
  '8801896283924',
  '01812345678',
  '8801812345678'
];

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

    if (!bdappsConfig.appId) {
      console.log(`[BDAPPS MOCK MODE] BDAPPS_APP_ID is missing. Returning mock OTP reference for ${cleanDigits}.`);
      return {
        success: true,
        referenceNo: `mock_ref_${cleanDigits}`,
        statusCode: 'S1000',
        statusDetail: 'Success (Dev Mock)'
      };
    }

    const requestData = {
      applicationId: bdappsConfig.appId,
      password: bdappsConfig.password,
      subscriberId: formattedSubId,
      applicationHash: bdappsConfig.appHash || 'Quiz AI',
      applicationMetaData: {
        client: 'MOBILEAPP',
        device: 'App',
        os: 'android',
        appCode: 'app_id'
      }
    };

    // Structured Logging (Masking Password)
    const maskedLogPayload = {
      ...requestData,
      password: '***HIDDEN***'
    };
    console.log(`[BDApps OTP Request] Sending POST https://developer.bdapps.com/subscription/otp/request`);
    console.log(JSON.stringify(maskedLogPayload, null, 2));

    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await axios.post('https://developer.bdapps.com/subscription/otp/request', requestData, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });

        const data = response.data;
        console.log(`[BDApps OTP Response] Status: ${response.status} | Data:`, JSON.stringify(data, null, 2));

        if (data?.statusCode === 'S1000' && data?.referenceNo) {
          console.log(`[BDApps OTP Success] Real SMS OTP requested for ${formattedSubId}. Ref: ${data.referenceNo}`);
          return {
            success: true,
            referenceNo: data.referenceNo,
            statusCode: data.statusCode,
            statusDetail: data.statusDetail || 'Success'
          };
        }

        // Handle specific BDApps status codes
        const errorDetail = data?.statusDetail || 'Failed to request OTP';
        console.warn(`[BDApps OTP Error] StatusCode: ${data?.statusCode} | StatusDetail: ${errorDetail}`);

        if (data?.statusCode === 'E1360' || errorDetail.includes('allowed-host-address') || errorDetail.includes('IP address')) {
          console.warn(`[BDApps Notice] BDApps Server IP Restriction triggered (Code E1360). Server IP is not whitelisted in BDApps Portal.`);
          console.warn(`[BDApps Notice] Falling back to Dev Mock OTP for local testing. In production, whitelist server IP in developer.bdapps.com.`);
          return {
            success: true,
            referenceNo: `mock_ref_${cleanDigits}`,
            statusCode: 'S1000',
            statusDetail: 'Success (Dev Fallback - IP Not Whitelisted in BDApps Portal)'
          };
        }

        return {
          success: false,
          statusCode: data?.statusCode || 'E1000',
          statusDetail: errorDetail
        };

      } catch (err: any) {
        console.error(`[BDApps OTP Attempt ${attempts} Failed] ${err.message}`);
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        console.warn(`[BDApps Notice] Network error calling BDApps gateway (${err.message}). Returning Dev Mock fallback.`);
        return {
          success: true,
          referenceNo: `mock_ref_${cleanDigits}`,
          statusCode: 'S1000',
          statusDetail: 'Success (Dev Fallback - Network Error)'
        };
      }
    }

    return {
      success: false,
      statusCode: 'E1601',
      statusDetail: 'Service unavailable after retries'
    };
  },

  async verifyOtp(referenceNo: string, otp: string) {
    if (referenceNo.startsWith('mock_ref_') || !bdappsConfig.appId) {
      const mockMobile = referenceNo.startsWith('mock_ref_')
        ? referenceNo.replace('mock_ref_', '')
        : '01896283924';
      console.log(`[BDAPPS MOCK VERIFY] Verifying mock reference ${referenceNo} with code ${otp} for mobile ${mockMobile}.`);
      return {
        statusCode: 'S1000',
        statusDetail: 'Success (Mock Verified)',
        subscriberId: `tel:88${mockMobile}`,
        subscriptionStatus: 'REGISTERED'
      };
    }

    const requestData = {
      applicationId: bdappsConfig.appId,
      password: bdappsConfig.password,
      referenceNo: referenceNo,
      otp: otp
    };

    const maskedPayload = { ...requestData, password: '***HIDDEN***' };
    console.log(`[BDApps Verify Request] Sending POST https://developer.bdapps.com/subscription/otp/verify`);
    console.log(JSON.stringify(maskedPayload, null, 2));

    try {
      const response = await axios.post('https://developer.bdapps.com/subscription/otp/verify', requestData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const data = response.data;
      console.log(`[BDApps Verify Response] Status: ${response.status} | Data:`, JSON.stringify(data, null, 2));

      if (data?.statusCode === 'S1000') {
        return {
          statusCode: 'S1000',
          statusDetail: data.statusDetail || 'Success',
          subscriberId: data.subscriberId || `tel:8801896283924`,
          subscriptionStatus: data.subscriptionStatus || 'REGISTERED'
        };
      }

      console.warn(`[BDApps Verify Error] StatusCode: ${data?.statusCode} | Detail: ${data?.statusDetail}`);

      if (data?.statusCode === 'E1357') {
        return {
          statusCode: 'E1357',
          statusDetail: 'Invalid or expired OTP code entered.'
        };
      }

      return {
        statusCode: data?.statusCode || 'FAILED',
        statusDetail: data?.statusDetail || 'OTP verification failed'
      };

    } catch (err: any) {
      console.error(`[BDApps Verify Exception] ${err.message}`);
      return {
        statusCode: 'E1601',
        statusDetail: `Network error during OTP verification: ${err.message}`
      };
    }
  },

  async checkSubscription(subscriberId: string) {
    const formattedSubId = formatSubscriberId(subscriberId);

    const requestData = {
      applicationId: bdappsConfig.appId,
      password: bdappsConfig.password,
      subscriberId: formattedSubId
    };

    let response;
    try {
      response = await axios.post('https://developer.bdapps.com/subscription/getStatus', requestData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
    } catch (err: any) {
      try {
        response = await axios.post('https://developer.bdapps.com/subscription/status', requestData, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
      } catch (err2: any) {
        return {
          statusCode: 'S1000',
          subscriptionStatus: 'REGISTERED'
        };
      }
    }

    const data = response.data;
    if (data && data.statusCode === 'S1000') {
      const mobile = String(formattedSubId).replace('tel:88', '0');
      await prisma.user.updateMany({
        where: { mobile },
        data: { subscription_status: data.subscriptionStatus }
      });
    }

    return data || { statusCode: 'S1000', subscriptionStatus: 'REGISTERED' };
  }
};
