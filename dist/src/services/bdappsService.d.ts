export declare const WHITELISTED_NUMBERS: string[];
export declare function extractMobileDigits(raw: string): string;
export declare function formatSubscriberId(raw: string): string;
export declare const bdappsService: {
    checkRateLimit(mobileDigits: string): {
        allowed: boolean;
        retryAfterSec?: number;
    };
    sendOtp(subscriberId: string, digits: string): Promise<{
        success: boolean;
        statusCode: string;
        statusDetail: string;
        retryAfterSec: any;
        referenceNo?: undefined;
    } | {
        retryAfterSec?: undefined;
        success: boolean;
        referenceNo: any;
        statusCode: any;
        statusDetail: any;
    } | {
        retryAfterSec?: undefined;
        referenceNo?: undefined;
        success: boolean;
        statusCode: any;
        statusDetail: any;
    }>;
    verifyOtp(referenceNo: string, otp: string): Promise<{
        statusCode: string;
        statusDetail: any;
        subscriberId: any;
        subscriptionStatus: any;
    } | {
        subscriberId?: undefined;
        subscriptionStatus?: undefined;
        statusCode: any;
        statusDetail: any;
    }>;
    checkSubscription(subscriberId: string): Promise<any>;
};
//# sourceMappingURL=bdappsService.d.ts.map