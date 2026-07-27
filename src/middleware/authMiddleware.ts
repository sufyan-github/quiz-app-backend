import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { JWT_SECRET } from '../config/jwt';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize firebase admin if not already initialized
if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(), // Assumes GOOGLE_APPLICATION_CREDENTIALS is set, or running on GCP
  });
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    // First, verify the Firebase ID token
    const decodedToken = await getAuth().verifyIdToken(token);
    
    // Now look up the user in our PostgreSQL database using Prisma
    const user = await prisma.user.findUnique({ where: { id: decodedToken.uid } });

    req.user = {
      userId: decodedToken.uid,
      email: decodedToken.email || '',
      role: user?.role || 'USER',
    };
    next();
  } catch (error) {
    // Fallback to JWT for legacy sessions or admin testing during migration
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (fallbackError) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
};

export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin access required' });
    return;
  }

  next();
};

export const requirePremium = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        userSubscriptions: {
          where: {
            status: 'ACTIVE',
            endDate: { gt: new Date() }
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isPremium = user.subscription_status === 'REGISTERED' || user.userSubscriptions.length > 0;

    if (!isPremium) {
      res.status(402).json({
        success: false,
        requirePaywall: true,
        message: 'Premium subscription required to access this feature.'
      });
      return;
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
