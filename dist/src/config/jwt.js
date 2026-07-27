"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
const secret = process.env.JWT_SECRET;
if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
}
exports.JWT_SECRET = secret;
//# sourceMappingURL=jwt.js.map