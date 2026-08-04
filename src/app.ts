import express from 'express';
import cors from 'cors';
import { prisma } from './prisma';

import authRoutes from './routes/authRoutes';
import categoryRoutes from './routes/categoryRoutes';
import questionRoutes from './routes/questionRoutes';
import examRoutes from './routes/examRoutes';
import userRoutes from './routes/userRoutes';
import adminRoutes from './routes/adminRoutes';
import studentRoutes from './routes/studentRoutes';
import bdappsRoutes from './routes/bdappsRoutes';
import quizRoutes from './routes/quizRoutes';
import aiRoutes from './routes/aiRoutes';
import lessonRoutes from './routes/lessonRoutes';
import paymentRoutes from './routes/paymentRoutes';
import syncRoutes from './routes/syncRoutes';
import demoRoutes from './routes/demoRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import { allowedCorsOrigins, requestLogger, securityHeaders } from './middleware/securityMiddleware';
import { globalRateLimit } from './middleware/rateLimit';

const app = express();

// Render sits behind a reverse proxy; without this, req.ip resolves to the
// proxy's address for every request, which would make demoController's
// per-IP rate limiting a no-op.
app.set('trust proxy', 1);
app.disable('x-powered-by');

const corsOrigins = allowedCorsOrigins();
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  maxAge: 86400,
}));
app.use(securityHeaders);
app.use(requestLogger);
app.use(globalRateLimit);
// Captures the exact raw bytes alongside Express's normal parsed body.
// verifyPhpWebhookSignature.ts needs the untouched bytes (not a
// re-serialized JSON.stringify(req.body), which can silently differ from
// what the sender actually signed - different key order, number
// formatting, etc.) to check an HMAC signature correctly. This doesn't
// change parsing behavior for any existing route.
app.use(express.json({ limit: '256kb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

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
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, status: 'ready' });
  } catch {
    res.status(503).json({ success: false, status: 'not_ready' });
  }
});
app.get('/api/health/live', (_req, res) => res.json({ success: true, status: 'live' }));

// 3. Registered API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', categoryRoutes); // Mounts /api/categories, /api/subjects, /api/topics
app.use('/api/questions', questionRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/bdapps', bdappsRoutes);
app.use('/api/app', quizRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/subscription', subscriptionRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

export default app;
