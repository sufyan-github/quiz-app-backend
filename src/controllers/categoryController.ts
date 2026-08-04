import { Request, Response } from 'express';
import prisma from '../prisma';
import { realtimeService } from '../services/realtimeService';

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: { 
        subjects: {
          include: {
            topics: true
          }
        }
      }
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
    if (name.length < 2 || name.length > 100) {
      res.status(400).json({ error: 'Category name must be 2-100 characters' });
      return;
    }
    const category = await prisma.category.create({
      data: { name, description }
    });
    realtimeService.emit('categories', 'category_created', { categoryId: category.id });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
};

export const getSubjects = async (req: Request, res: Response) => {
  try {
    const subjects = await prisma.subject.findMany({
      include: { topics: true, category: true }
    });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
};

export const createSubject = async (req: Request, res: Response) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const categoryId = req.body.categoryId;
    if (name.length < 2 || name.length > 100 || typeof categoryId !== 'string') {
      res.status(400).json({ error: 'Valid subject name and category are required' });
      return;
    }
    const subject = await prisma.subject.create({
      data: { name, categoryId }
    });
    realtimeService.emit('categories', 'category_updated', { subjectId: subject.id });
    res.status(201).json(subject);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create subject' });
  }
};

export const getTopics = async (req: Request, res: Response) => {
  try {
    const topics = await prisma.topic.findMany({
      include: { subject: true }
    });
    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
};

export const createTopic = async (req: Request, res: Response) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const subjectId = req.body.subjectId;
    if (name.length < 2 || name.length > 120 || typeof subjectId !== 'string') {
      res.status(400).json({ error: 'Valid topic name and subject are required' });
      return;
    }
    const topic = await prisma.topic.create({
      data: { name, subjectId }
    });
    realtimeService.emit('categories', 'category_updated', { topicId: topic.id });
    res.status(201).json(topic);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create topic' });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description } = req.body;
    const category = await prisma.category.update({
      where: { id },
      data: { name, description }
    });
    realtimeService.emit('categories', 'category_updated', { categoryId: category.id });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const childCount = await prisma.subject.count({ where: { categoryId: id } });
    if (childCount > 0) {
      res.status(409).json({ error: 'Move or remove child subjects before deleting this category' });
      return;
    }
    await prisma.category.delete({ where: { id } });
    realtimeService.emit('categories', 'category_deleted', { id });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
};

export const updateSubject = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, categoryId } = req.body;
    const subject = await prisma.subject.update({
      where: { id },
      data: { name, categoryId }
    });
    res.json(subject);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update subject' });
  }
};

export const deleteSubject = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [topicCount, questionCount, examCount] = await Promise.all([
      prisma.topic.count({ where: { subjectId: id } }),
      prisma.question.count({ where: { subjectId: id } }),
      prisma.exam.count({ where: { subjectId: id } }),
    ]);
    if (topicCount + questionCount + examCount > 0) {
      res.status(409).json({ error: 'Subject is in use and cannot be deleted' });
      return;
    }
    await prisma.subject.delete({ where: { id } });
    res.json({ message: 'Subject deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subject' });
  }
};

export const updateTopic = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, subjectId } = req.body;
    const topic = await prisma.topic.update({
      where: { id },
      data: { name, subjectId }
    });
    res.json(topic);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update topic' });
  }
};

export const deleteTopic = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [questionCount, lessonCount, examCount] = await Promise.all([
      prisma.question.count({ where: { topicId: id } }),
      prisma.lesson.count({ where: { topicId: id } }),
      prisma.exam.count({ where: { topicId: id } }),
    ]);
    if (questionCount + lessonCount + examCount > 0) {
      res.status(409).json({ error: 'Topic is in use and cannot be deleted' });
      return;
    }
    await prisma.topic.delete({ where: { id } });
    res.json({ message: 'Topic deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete topic' });
  }
};
