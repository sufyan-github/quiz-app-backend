import { Request, RequestHandler } from 'express';
interface RateLimitOptions {
    windowMs: number;
    max: number;
    scope: string;
    key?: (req: Request) => string;
}
export declare function createRateLimiter(options: RateLimitOptions): RequestHandler;
export declare const globalRateLimit: RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare const authRateLimit: RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare const aiRateLimit: RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export {};
//# sourceMappingURL=rateLimit.d.ts.map