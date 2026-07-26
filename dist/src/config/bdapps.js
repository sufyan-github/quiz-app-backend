"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bdappsConfig = void 0;
exports.bdappsConfig = {
    appId: process.env.BDAPPS_APP_ID || process.env.APP_ID || '',
    password: process.env.BDAPPS_PASSWORD || process.env.PASSWORD || '',
    appHash: process.env.BDAPPS_APP_HASH || process.env.APP_HASH || ''
};
//# sourceMappingURL=bdapps.js.map