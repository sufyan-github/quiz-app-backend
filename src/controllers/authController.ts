import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, firstName, lastName, role } = req.body;
    
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const profileName = name || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown User';
    
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role || 'STUDENT',
        profile: {
          create: { name: profileName }
        }
      }
    });
    
    res.status(201).json({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    
    res.json({ token, role: user.role });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
