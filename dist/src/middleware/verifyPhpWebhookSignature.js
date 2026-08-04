"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPhpWebhookSignature = verifyPhpWebhookSignature;
const crypto_1 = __importDefault(require("crypto"));
const recentlyUsedNonces = new Map();
// Verifies requests from php_bdapps_gateway/api/callback.php, using the
// exact same HMAC scheme phpGatewayClient.ts already uses for Node->PHP
// calls (see Security.php for the PHP-side twin of this check), just in
// the reverse direction: rawBody + timestamp + nonce, signed with the
// same shared INTERNAL_API_KEY already provisioned on both sides.
//
// This is a defensible interim measure, not full BDApps webhook signature
// verification - BDApps calls callback.php directly (an external URL this
// app doesn't control the registration of), and BDApps's own signing
// scheme for that call is not documented anywhere available to this
// project. What this DOES guarantee: only our own PHP gateway - which
// already authenticated the raw BDApps payload before forwarding it - can
// reach this endpoint, and a captured/replayed forward request expires
// after 5 minutes exactly like every other internal call in this system.
function verifyPhpWebhookSignature(req, res, next) {
    const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
    if (!INTERNAL_API_KEY) {
        res.status(500).json({ statusCode: 'FAILED', message: 'Server misconfigured: INTERNAL_API_KEY not set' });
        return;
    }
    const apiKey = req.header('x-api-key') || '';
    const timestamp = req.header('x-timestamp') || '';
    const nonce = req.header('x-nonce') || '';
    const signature = req.header('x-signature') || '';
    if (!apiKey || !timestamp || !nonce || !signature) {
        res.status(403).json({ statusCode: 'FAILED', message: 'Missing required security headers' });
        return;
    }
    if (!/^[a-f0-9]{32}$/i.test(nonce)) {
        res.status(403).json({ statusCode: 'FAILED', message: 'Invalid nonce' });
        return;
    }
    const nonceExpiry = recentlyUsedNonces.get(nonce);
    if (nonceExpiry && nonceExpiry > Date.now()) {
        res.status(409).json({ statusCode: 'FAILED', message: 'Request nonce already used' });
        return;
    }
    if (apiKey !== INTERNAL_API_KEY) {
        res.status(403).json({ statusCode: 'FAILED', message: 'Invalid API key' });
        return;
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
        res.status(403).json({ statusCode: 'FAILED', message: 'Request timestamp expired' });
        return;
    }
    const rawBody = req.rawBody instanceof Buffer ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
    const payloadToSign = rawBody + timestamp + nonce;
    const expectedSignature = crypto_1.default.createHmac('sha256', INTERNAL_API_KEY).update(payloadToSign).digest('hex');
    const providedBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    const validSignature = providedBuf.length === expectedBuf.length && crypto_1.default.timingSafeEqual(providedBuf, expectedBuf);
    if (!validSignature) {
        res.status(403).json({ statusCode: 'FAILED', message: 'Invalid signature' });
        return;
    }
    recentlyUsedNonces.set(nonce, Date.now() + 10 * 60_000);
    for (const [usedNonce, expiresAt] of recentlyUsedNonces.entries()) {
        if (expiresAt <= Date.now())
            recentlyUsedNonces.delete(usedNonce);
    }
    next();
}
