import { Request, RequestHandler } from 'express';
import { AuthRequest } from './authMiddleware';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  scope: string;
  key?: (req: Request) => string;
}

const buckets = new Map<string, Bucket>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
cleanupTimer.unref();

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
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

export const globalRateLimit = createRateLimiter({ windowMs: 15 * 60_000, max: 300, scope: 'global' });
export const authRateLimit = createRateLimiter({ windowMs: 15 * 60_000, max: 10, scope: 'auth' });
export const aiRateLimit = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 20,
  scope: 'ai',
  key: (req) => (req as AuthRequest).user?.userId || req.ip || 'unknown',
});

