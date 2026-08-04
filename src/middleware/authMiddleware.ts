import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { resolveAuthToken } from '../services/authService';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  try {
    const user = await resolveAuthToken(token);
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'AUTH_INVALID', message: 'Invalid or expired token' } });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'AUTH_INVALID', message: 'Invalid or expired token' } });
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
