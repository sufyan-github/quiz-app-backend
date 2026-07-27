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
        success: boolean;
        referenceNo: any;
        statusCode: any;
        statusDetail: any;
        retryAfterSec?: undefined;
    } | {
        success: boolean;
        statusCode: any;
        statusDetail: any;
        retryAfterSec?: undefined;
        referenceNo?: undefined;
    }>;
    verifyOtp(referenceNo: string, otp: string): Promise<{
        statusCode: string;
        statusDetail: any;
        subscriberId: any;
        subscriptionStatus: any;
    } | {
        statusCode: any;
        statusDetail: any;
        subscriberId?: undefined;
        subscriptionStatus?: undefined;
    }>;
    checkSubscription(subscriberId: string): Promise<any>;
};
//# sourceMappingURL=bdappsService.d.ts.map