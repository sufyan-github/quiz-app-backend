import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';
import { sanitizeProfileInput } from '../utils/profileInput';
import type { Prisma } from '@prisma/client';

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = sanitizeProfileInput(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No valid profile fields supplied' });
      return;
    }

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: data as Prisma.ProfileUncheckedUpdateInput,
      create: {
        userId,
        ...data,
      } as Prisma.ProfileUncheckedCreateInput,
    });

    res.json(profile);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true, profile: true }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      email: user.email,
      role: user.role,
      profile: user.profile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { profile: true },
      orderBy: { createdAt: 'desc' }
    });
    
    // Don't send passwords
    const sanitizedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      subscription_status: user.subscription_status,
      xp: user.xp,
      coins: user.coins,
      profile: user.profile,
      createdAt: user.createdAt
    }));
    
    res.json(sanitizedUsers);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({
      where: { id },
      include: { 
        profile: true,
        attempts: {
          include: {
            exam: true,
            result: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      profile: user.profile,
      examAttempts: user.attempts,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
