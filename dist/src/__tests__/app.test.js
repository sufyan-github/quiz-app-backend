"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
jest.mock('../services/authService', () => ({
    resolveAuthToken: jest.fn().mockResolvedValue(null),
    issueAccessToken: jest.fn(),
}));
const app_1 = __importDefault(require("../app"));
describe('API shell', () => {
    it('provides a dependency-free liveness probe', async () => {
        const response = await (0, supertest_1.default)(app_1.default).get('/api/health/live');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, status: 'live' });
    });
    it('sets defensive headers and a request id', async () => {
        const response = await (0, supertest_1.default)(app_1.default).get('/api/health/live');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['x-request-id']).toBeTruthy();
    });
    it('does not expose protected account data anonymously', async () => {
        const response = await (0, supertest_1.default)(app_1.default).get('/api/users/account/export');
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });
    it('returns a structured response for missing routes', async () => {
        const response = await (0, supertest_1.default)(app_1.default).get('/api/does-not-exist');
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
    });
});
//# sourceMappingURL=app.test.js.map