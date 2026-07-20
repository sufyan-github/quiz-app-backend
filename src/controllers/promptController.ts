import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';

export const getPromptTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templates = await prisma.aiPromptTemplate.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(templates);
  } catch (error) {
    console.error('Get prompt templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePromptTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { systemPrompt, userPrompt, model, isActive } = req.body;
    const adminId = req.user?.userId;

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const template = await prisma.aiPromptTemplate.update({
      where: { id },
      data: {
        systemPrompt,
        userPrompt,
        model,
        isActive
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: adminId,
        action: `Updated Prompt Template ${template.name}`,
        module: 'AI Config',
        ipAddress: req.ip
      }
    });

    res.json(template);
  } catch (error) {
    console.error('Update prompt template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
