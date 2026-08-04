"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonController = void 0;
const prisma_1 = require("../prisma");
exports.lessonController = {
    /**
     * Get all lessons for a specific topic
     */
    async getLessons(req, res) {
        try {
            const { topicId } = req.query;
            if (!topicId || typeof topicId !== 'string') {
                res.status(400).json({ success: false, message: 'Topic ID is required' });
                return;
            }
            const lessons = await prisma_1.prisma.lesson.findMany({
                where: { topicId },
                orderBy: { order: 'asc' },
                include: { resources: true }
            });
            res.json({ success: true, data: lessons });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to fetch lessons' });
        }
    },
    /**
     * Get a specific lesson by ID
     */
    async getLesson(req, res) {
        try {
            const id = req.params.id;
            const lesson = await prisma_1.prisma.lesson.findUnique({
                where: { id },
                include: { resources: true }
            });
            if (!lesson) {
                res.status(404).json({ success: false, message: 'Lesson not found' });
                return;
            }
            res.json({ success: true, data: lesson });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to fetch lesson' });
        }
    }
};
