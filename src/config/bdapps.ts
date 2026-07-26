export const bdappsConfig = {
  appId: process.env.BDAPPS_APP_ID || process.env.APP_ID || '',
  password: process.env.BDAPPS_PASSWORD || process.env.PASSWORD || '',
  appHash: process.env.BDAPPS_APP_HASH || process.env.APP_HASH || ''
};
