import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const PHP_GATEWAY_URL = process.env.PHP_GATEWAY_URL || 'https://bdappsdigitalapps.com/api';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY environment variable is required to sign requests to the PHP gateway');
}

export const phpGatewayClient = {
  
  async post(endpoint: string, data: any) {
    const url = `${PHP_GATEWAY_URL}${endpoint}`;
    
    const payload = JSON.stringify(data);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    // Signature matches PHP logic: rawBody + timestamp + nonce
    const payloadToSign = payload + timestamp + nonce;
    const signature = crypto
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
      const response = await axios.post(url, payload, {
        headers,
        timeout: 15000
      });
      return response.data;
    } catch (error: any) {
      console.error(`[PHP Gateway Error] ${endpoint}:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'PHP Gateway request failed');
    }
  }
};
