"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.phpGatewayClient = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const PHP_GATEWAY_URL = process.env.PHP_GATEWAY_URL || 'https://bdappsdigitalapps.com/api';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_API_KEY) {
    throw new Error('INTERNAL_API_KEY environment variable is required to sign requests to the PHP gateway');
}
exports.phpGatewayClient = {
    async post(endpoint, data) {
        const url = `${PHP_GATEWAY_URL}${endpoint}`;
        const payload = JSON.stringify(data);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto_1.default.randomBytes(16).toString('hex');
        // Signature matches PHP logic: rawBody + timestamp + nonce
        const payloadToSign = payload + timestamp + nonce;
        const signature = crypto_1.default
            .createHmac('sha256', INTERNAL_API_KEY)
            .update(payloadToSign)
            .digest('hex');
        const headers = {
            'Content-Type': 'application/json',
            'X-API-Key': INTERNAL_API_KEY,
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
            'X-Signature': signature
        };
        try {
            const response = await axios_1.default.post(url, payload, {
                headers,
                timeout: 15000
            });
            return response.data;
        }
        catch (error) {
            console.error(`[PHP Gateway Error] ${endpoint}:`, error.response?.data || error.message);
            throw new Error(error.response?.data?.error || 'PHP Gateway request failed');
        }
    }
};
//# sourceMappingURL=phpGatewayClient.js.map