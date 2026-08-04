import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma';
import { issueAccessToken } from '../services/authService';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(password: unknown): password is string {
  return typeof password === 'string'
    && password.length >= 12
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password, name, firstName, lastName } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!EMAIL_PATTERN.test(email) || !validatePassword(password)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REGISTRATION',
          message: 'Use a valid email and a 12-128 character password containing upper-case, lower-case, and numeric characters.',
        },
      });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ success: false, error: { code: 'ACCOUNT_EXISTS', message: 'An account already exists for this email.' } });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const profileName = name || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown User';

    // Role is never taken from client input — self-registration is always a
    // STUDENT. Admin accounts can only be created via the requireSuperAdmin
    // gated POST /api/admin/users/admin route.
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'STUDENT',
        profile: {
          create: { name: profileName }
        }
      }
    });
    
    res.status(201).json({ success: true, data: { userId: user.id }, message: 'User registered successfully' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;

    if (!EMAIL_PATTERN.test(email) || typeof password !== 'string') {
      res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
      return;
    }
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || !user.password) {
      res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
      return;
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
      return;
    }
    
    const token = issueAccessToken(user);
    
    res.json({ token, role: user.role });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
