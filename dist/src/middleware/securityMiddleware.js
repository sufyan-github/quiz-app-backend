"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = exports.securityHeaders = void 0;
exports.allowedCorsOrigins = allowedCorsOrigins;
const crypto_1 = __importDefault(require("crypto"));
function allowedCorsOrigins() {
    const configured = (process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (configured.length > 0)
        return configured;
    return process.env.NODE_ENV === 'production'
        ? []
        : ['http://localhost:3000', 'http://localhost:4000'];
}
const securityHeaders = (req, res, next) => {
    const requestId = req.header('x-request-id')?.slice(0, 100) || crypto_1.default.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
};
exports.securityHeaders = securityHeaders;
const requestLogger = (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        console.log(JSON.stringify({
            type: 'http_request',
            requestId: res.locals.requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - startedAt,
        }));
    });
    next();
};
exports.requestLogger = requestLogger;
