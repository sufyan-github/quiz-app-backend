"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRateLimit = exports.authRateLimit = exports.globalRateLimit = void 0;
exports.createRateLimiter = createRateLimiter;
const buckets = new Map();
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now)
            buckets.delete(key);
    }
}, 60_000);
cleanupTimer.unref();
function createRateLimiter(options) {
    return (req, res, next) => {
        const identity = options.key?.(req) || req.ip || 'unknown';
        const bucketKey = `${options.scope}:${identity}`;
        const now = Date.now();
        const existing = buckets.get(bucketKey);
        const bucket = !existing || existing.resetAt <= now
            ? { count: 0, resetAt: now + options.windowMs }
            : existing;
        bucket.count += 1;
        buckets.set(bucketKey, bucket);
        const remaining = Math.max(0, options.max - bucket.count);
        res.setHeader('RateLimit-Limit', String(options.max));
        res.setHeader('RateLimit-Remaining', String(remaining));
        res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
        if (bucket.count > options.max) {
            const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfter));
            res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMITED',
                    message: 'Too many requests. Please try again later.',
                    retryAfterSec: retryAfter,
                },
            });
            return;
        }
        next();
    };
}
exports.globalRateLimit = createRateLimiter({ windowMs: 15 * 60_000, max: 300, scope: 'global' });
exports.authRateLimit = createRateLimiter({ windowMs: 15 * 60_000, max: 10, scope: 'auth' });
exports.aiRateLimit = createRateLimiter({
    windowMs: 10 * 60_000,
    max: 20,
    scope: 'ai',
    key: (req) => req.user?.userId || req.ip || 'unknown',
});
