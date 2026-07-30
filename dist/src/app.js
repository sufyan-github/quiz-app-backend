"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const prisma_1 = require("./prisma");
const realtimeService_1 = require("./services/realtimeService");
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
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
// Render sits behind a reverse proxy; without this, req.ip resolves to the
// proxy's address for every request, which would make demoController's
// per-IP rate limiting a no-op.
app.set('trust proxy', 1);
app.use((0, cors_1.default)());
// Captures the exact raw bytes alongside Express's normal parsed body.
// verifyPhpWebhookSignature.ts needs the untouched bytes (not a
// re-serialized JSON.stringify(req.body), which can silently differ from
// what the sender actually signed - different key order, number
// formatting, etc.) to check an HMAC signature correctly. This doesn't
// change parsing behavior for any existing route.
app.use(express_1.default.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
// 1. Root Endpoint (GET /)
app.get('/', (req, res) => {
    res.json({
        status: "OK",
        message: "Quiz AI Backend Running"
    });
});
// 2. Health Check Endpoint (GET /api/health)
app.get('/api/health', async (req, res) => {
    let dbStatus = 'disconnected';
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        dbStatus = 'connected';
    }
    catch (err) {
        dbStatus = `error: ${err?.message || 'DB connection failed'}`;
    }
    res.json({
        success: true,
        database: dbStatus,
        server: "running"
    });
});
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
const server = http_1.default.createServer(app);
// Initialize Socket.IO Realtime Service
realtimeService_1.realtimeService.init(server);
server.listen(port, () => {
    console.log(`[Server] Quiz AI Backend & Socket.IO running on port ${port}`);
});
exports.default = app;
//# sourceMappingURL=app.js.map