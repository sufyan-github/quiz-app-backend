import axios from 'axios';
import { bdappsConfig } from '../config/bdapps';
import { prisma } from '../prisma';

export const bdappsService = {
  async sendOtp(subscriberId: string, digits: string) {
    if (!bdappsConfig.appId) {
      console.log(`[MOCK MODE] OTP requested for ${subscriberId}. Use any 4-6 digit code to verify.`);
      return {
        success: true,
        referenceNo: `mock_ref_${digits}`,
        statusCode: 'S1000',
        statusDetail: 'Success (Mock)'
      };
    }

    const requestData = {
      applicationId: bdappsConfig.appId,
      password: bdappsConfig.password,
      subscriberId: subscriberId,
      applicationHash: bdappsConfig.appHash,
      applicationMetaData: {
        client: 'MOBILEAPP',
        device: 'App',
        os: 'android',
        appCode: 'app_id'
      }
    };

    const response = await axios.post('https://developer.bdapps.com/subscription/otp/request', requestData, {
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data;
  },

  async verifyOtp(referenceNo: string, otp: string) {
    if (!bdappsConfig.appId) {
      console.log(`[MOCK MODE] OTP verified with code ${otp} for ref ${referenceNo}.`);
      const mockMobile = referenceNo.startsWith('mock_ref_') ? referenceNo.replace('mock_ref_', '') : '01812345678';
      return {
        statusCode: 'S1000',
        subscriberId: `tel:88${mockMobile}`,
        subscriptionStatus: 'REGISTERED'
      };
    }

    const requestData = {
      applicationId: bdappsConfig.appId,
      password: bdappsConfig.password,
      referenceNo: referenceNo,
      otp: otp
    };

    const response = await axios.post('https://developer.bdapps.com/subscription/otp/verify', requestData, {
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data;
  },

  async checkSubscription(subscriberId: string) {
    const requestData = {
      applicationId: bdappsConfig.appId,
      password: bdappsConfig.password,
      subscriberId: subscriberId
    };

    const response = await axios.post('https://developer.bdapps.com/subscription/status', requestData, {
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data;
    if (data.statusCode === 'S1000') {
      const mobile = String(subscriberId).replace('tel:88', '0');
      await prisma.user.updateMany({
        where: { mobile },
        data: { subscription_status: data.subscriptionStatus }
      });
    }

    return data;
  }
};
