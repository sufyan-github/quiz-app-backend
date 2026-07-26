import express from 'express';
import cors from 'cors';
import http from 'http';
import { prisma } from './prisma';
import { realtimeService } from './services/realtimeService';

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

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (err: any) {
    dbStatus = `error: ${err?.message || 'DB connection failed'}`;
  }

  res.json({
    success: true,
    database: dbStatus,
    server: "running"
  });
});

// 3. Registered API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/core', categoryRoutes);
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

const server = http.createServer(app);

// Initialize Socket.IO Realtime Service
realtimeService.init(server);

server.listen(port, () => {
  console.log(`[Server] Quiz AI Backend & Socket.IO running on port ${port}`);
});

export default app;
