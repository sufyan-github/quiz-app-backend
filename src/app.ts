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

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
