"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const prisma_1 = require("./prisma");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const categoryRoutes_1 = __importDefault(require("./routes/categoryRoutes"));
const questionRoutes_1 = __importDefault(require("./routes/questionRoutes"));
const examRoutes_1 = __importDefault(require("./routes/examRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const studentRoutes_1 = __importDefault(require("./routes/studentRoutes"));
const bdappsRoutes_1 = __importDefault(require("./routes/bdappsRoutes"));
const quizRoutes_1 = __importDefault(require("./routes/quizRoutes"));
const aiRoutes_1 = __importDefault(require("./routes/aiRoutes"));
const lessonRoutes_1 = __importDefault(require("./routes/lessonRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const syncRoutes_1 = __importDefault(require("./routes/syncRoutes"));
const demoRoutes_1 = __importDefault(require("./routes/demoRoutes"));
const subscriptionRoutes_1 = __importDefault(require("./routes/subscriptionRoutes"));
const securityMiddleware_1 = require("./middleware/securityMiddleware");
const rateLimit_1 = require("./middleware/rateLimit");
const app = (0, express_1.default)();
// Render sits behind a reverse proxy; without this, req.ip resolves to the
// proxy's address for every request, which would make demoController's
// per-IP rate limiting a no-op.
app.set('trust proxy', 1);
app.disable('x-powered-by');
const corsOrigins = (0, securityMiddleware_1.allowedCorsOrigins)();
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin))
            callback(null, true);
        else
            callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    maxAge: 86400,
}));
app.use(securityMiddleware_1.securityHeaders);
app.use(securityMiddleware_1.requestLogger);
app.use(rateLimit_1.globalRateLimit);
// Captures the exact raw bytes alongside Express's normal parsed body.
// verifyPhpWebhookSignature.ts needs the untouched bytes (not a
// re-serialized JSON.stringify(req.body), which can silently differ from
// what the sender actually signed - different key order, number
// formatting, etc.) to check an HMAC signature correctly. This doesn't
// change parsing behavior for any existing route.
app.use(express_1.default.json({ limit: '256kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
// 1. Root Endpoint (GET /)
app.get('/', (req, res) => {
    res.json({
        status: "OK",
        message: "Quiz AI Backend Running"
    });
});
// 2. Health Check Endpoint (GET /api/health)
app.get(['/api/health', '/api/health/ready'], async (_req, res) => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        res.json({ success: true, status: 'ready' });
    }
    catch {
        res.status(503).json({ success: false, status: 'not_ready' });
    }
});
app.get('/api/health/live', (_req, res) => res.json({ success: true, status: 'live' }));
// 3. Registered API Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api', categoryRoutes_1.default); // Mounts /api/categories, /api/subjects, /api/topics
app.use('/api/questions', questionRoutes_1.default);
app.use('/api/exams', examRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
app.use('/api/student', studentRoutes_1.default);
app.use('/api/bdapps', bdappsRoutes_1.default);
app.use('/api/app', quizRoutes_1.default);
app.use('/api/ai', aiRoutes_1.default);
app.use('/api/lessons', lessonRoutes_1.default);
app.use('/api/payment', paymentRoutes_1.default);
app.use('/api/sync', syncRoutes_1.default);
app.use('/api/demo', demoRoutes_1.default);
app.use('/api/subscription', subscriptionRoutes_1.default);
app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});
app.use((error, _req, res, _next) => {
    console.error(`[UnhandledError] requestId=${res.locals.requestId || 'unknown'}`, error);
    if (error?.type === 'entity.too.large') {
        res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large' } });
        return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
        res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } });
        return;
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});
exports.default = app;
