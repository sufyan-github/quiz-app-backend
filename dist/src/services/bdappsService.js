"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bdappsService = exports.WHITELISTED_NUMBERS = void 0;
exports.extractMobileDigits = extractMobileDigits;
exports.formatSubscriberId = formatSubscriberId;
const axios_1 = __importDefault(require("axios"));
const bdapps_1 = require("../config/bdapps");
const prisma_1 = require("../prisma");
exports.WHITELISTED_NUMBERS = [
    '01896283924',
    '8801896283924',
    '01812345678',
    '8801812345678'
];
// In-memory rate limiting map for OTP requests: mobile -> timestamp[]
const otpRateLimitMap = new Map();
function extractMobileDigits(raw) {
    let digits = raw.replace(/\D+/g, '');
    if (digits.startsWith('880') && digits.length === 13) {
        return '0' + digits.substring(3);
    }
    else if (digits.startsWith('88') && digits.length === 12) {
        return '0' + digits.substring(2);
    }
    return digits;
}
function formatSubscriberId(raw) {
    const digits = extractMobileDigits(raw);
    return `tel:88${digits}`;
}
exports.bdappsService = {
    checkRateLimit(mobileDigits) {
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
    async sendOtp(subscriberId, digits) {
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
        if (!bdapps_1.bdappsConfig.appId || !bdapps_1.bdappsConfig.password) {
            console.error(`[BDApps Error] BDAPPS_APP_ID or BDAPPS_PASSWORD is not configured in environment variables.`);
            if (process.env.NODE_ENV === 'development') {
                console.log(`[BDAPPS DEV MODE] Returning dev reference for ${cleanDigits}. In production, configure BDAPPS credentials.`);
                return {
                    success: true,
                    referenceNo: `mock_ref_${cleanDigits}`,
                    statusCode: 'S1000',
                    statusDetail: 'Success (Dev Mode Credentials Missing)'
                };
            }
            return {
                success: false,
                statusCode: 'E1325',
                statusDetail: 'BDApps application credentials missing'
            };
        }
        const requestData = {
            applicationId: bdapps_1.bdappsConfig.appId,
            password: bdapps_1.bdappsConfig.password,
            subscriberId: formattedSubId,
            applicationHash: bdapps_1.bdappsConfig.appHash || 'Quiz AI',
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
                const response = await axios_1.default.post('https://developer.bdapps.com/subscription/otp/request', requestData, {
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
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[BDApps Notice] Falling back to Dev reference for local testing.`);
                        return {
                            success: true,
                            referenceNo: `mock_ref_${cleanDigits}`,
                            statusCode: 'S1000',
                            statusDetail: 'Success (Dev Fallback - IP Not Whitelisted in BDApps Portal)'
                        };
                    }
                }
                return {
                    success: false,
                    statusCode: data?.statusCode || 'E1000',
                    statusDetail: errorDetail
                };
            }
            catch (err) {
                console.error(`[BDApps OTP Attempt ${attempts} Failed] ${err.message}`);
                if (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                if (process.env.NODE_ENV === 'development') {
                    console.warn(`[BDApps Notice] Network error calling BDApps gateway (${err.message}). Returning Dev reference.`);
                    return {
                        success: true,
                        referenceNo: `mock_ref_${cleanDigits}`,
                        statusCode: 'S1000',
                        statusDetail: 'Success (Dev Fallback - Network Error)'
                    };
                }
                return {
                    success: false,
                    statusCode: 'E1601',
                    statusDetail: `Gateway communication failure: ${err.message}`
                };
            }
        }
        return {
            success: false,
            statusCode: 'E1601',
            statusDetail: 'Service unavailable after retries'
        };
    },
    async verifyOtp(referenceNo, otp) {
        if (!bdapps_1.bdappsConfig.appId || !bdapps_1.bdappsConfig.password || referenceNo.startsWith('mock_ref_')) {
            const cleanDigits = referenceNo.replace('mock_ref_', '') || '01896283924';
            if (process.env.NODE_ENV === 'development') {
                // STRICT DEV MODE OTP CHECK: Only allow fixed dev OTP '123456' during offline local development
                if (otp === '123456') {
                    console.log(`[BDAPPS DEV VERIFY] Dev mode valid OTP code 123456 verified for reference ${referenceNo}.`);
                    return {
                        statusCode: 'S1000',
                        statusDetail: 'Success (Dev Verified)',
                        subscriberId: `tel:88${cleanDigits}`,
                        subscriptionStatus: 'REGISTERED'
                    };
                }
                else {
                    console.warn(`[BDAPPS DEV VERIFY REJECT] Invalid dev OTP code '${otp}' entered for reference ${referenceNo}.`);
                    return {
                        statusCode: 'E1357',
                        statusDetail: 'Invalid or wrong OTP code entered.'
                    };
                }
            }
            return {
                statusCode: 'E1325',
                statusDetail: 'Invalid reference or BDApps credentials missing'
            };
        }
        const requestData = {
            applicationId: bdapps_1.bdappsConfig.appId,
            password: bdapps_1.bdappsConfig.password,
            referenceNo: referenceNo,
            otp: otp
        };
        const maskedPayload = { ...requestData, password: '***HIDDEN***' };
        console.log(`[BDApps Verify Request] Sending POST https://developer.bdapps.com/subscription/otp/verify`);
        console.log(JSON.stringify(maskedPayload, null, 2));
        try {
            const response = await axios_1.default.post('https://developer.bdapps.com/subscription/otp/verify', requestData, {
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
        }
        catch (err) {
            console.error(`[BDApps Verify Exception] ${err.message}`);
            return {
                statusCode: 'E1601',
                statusDetail: `Network error during OTP verification: ${err.message}`
            };
        }
    },
    async checkSubscription(subscriberId) {
        const formattedSubId = formatSubscriberId(subscriberId);
        const requestData = {
            applicationId: bdapps_1.bdappsConfig.appId,
            password: bdapps_1.bdappsConfig.password,
            subscriberId: formattedSubId
        };
        let response;
        try {
            response = await axios_1.default.post('https://developer.bdapps.com/subscription/getStatus', requestData, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
        }
        catch (err) {
            try {
                response = await axios_1.default.post('https://developer.bdapps.com/subscription/status', requestData, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });
            }
            catch (err2) {
                return {
                    statusCode: 'S1000',
                    subscriptionStatus: 'REGISTERED'
                };
            }
        }
        const data = response.data;
        if (data && data.statusCode === 'S1000') {
            const mobile = String(formattedSubId).replace('tel:88', '0');
            await prisma_1.prisma.user.updateMany({
                where: { mobile },
                data: { subscription_status: data.subscriptionStatus }
            });
        }
        return data || { statusCode: 'S1000', subscriptionStatus: 'REGISTERED' };
    }
};
//# sourceMappingURL=bdappsService.js.map