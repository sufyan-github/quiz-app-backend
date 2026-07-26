"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTopic = exports.updateTopic = exports.deleteSubject = exports.updateSubject = exports.deleteCategory = exports.updateCategory = exports.createTopic = exports.getTopics = exports.createSubject = exports.getSubjects = exports.createCategory = exports.getCategories = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const realtimeService_1 = require("../services/realtimeService");
const getCategories = async (req, res) => {
    try {
        const categories = await prisma_1.default.category.findMany({
            include: {
                subjects: {
                    include: {
                        topics: true
                    }
                }
            }
        });
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
};
exports.getCategories = getCategories;
const createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        const category = await prisma_1.default.category.create({
            data: { name, description }
        });
        realtimeService_1.realtimeService.emit('categories', 'category_created', { category });
        res.status(201).json(category);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create category' });
    }
};
exports.createCategory = createCategory;
const getSubjects = async (req, res) => {
    try {
        const subjects = await prisma_1.default.subject.findMany({
            include: { topics: true, category: true }
        });
        res.json(subjects);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
};
exports.getSubjects = getSubjects;
const createSubject = async (req, res) => {
    try {
        const { name, categoryId } = req.body;
        const subject = await prisma_1.default.subject.create({
            data: { name, categoryId }
        });
        realtimeService_1.realtimeService.emit('categories', 'category_updated', { subject });
        res.status(201).json(subject);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create subject' });
    }
};
exports.createSubject = createSubject;
const getTopics = async (req, res) => {
    try {
        const topics = await prisma_1.default.topic.findMany({
            include: { subject: true }
        });
        res.json(topics);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch topics' });
    }
};
exports.getTopics = getTopics;
const createTopic = async (req, res) => {
    try {
        const { name, subjectId } = req.body;
        const topic = await prisma_1.default.topic.create({
            data: { name, subjectId }
        });
        realtimeService_1.realtimeService.emit('categories', 'category_updated', { topic });
        res.status(201).json(topic);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create topic' });
    }
};
exports.createTopic = createTopic;
const updateCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, description } = req.body;
        const category = await prisma_1.default.category.update({
            where: { id },
            data: { name, description }
        });
        realtimeService_1.realtimeService.emit('categories', 'category_updated', { category });
        res.json(category);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update category' });
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.category.delete({ where: { id } });
        realtimeService_1.realtimeService.emit('categories', 'category_deleted', { id });
        res.json({ message: 'Category deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
};
exports.deleteCategory = deleteCategory;
const updateSubject = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, categoryId } = req.body;
        const subject = await prisma_1.default.subject.update({
            where: { id },
            data: { name, categoryId }
        });
        res.json(subject);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update subject' });
    }
};
exports.updateSubject = updateSubject;
const deleteSubject = async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.subject.delete({ where: { id } });
        res.json({ message: 'Subject deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete subject' });
    }
};
exports.deleteSubject = deleteSubject;
const updateTopic = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, subjectId } = req.body;
        const topic = await prisma_1.default.topic.update({
            where: { id },
            data: { name, subjectId }
        });
        res.json(topic);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update topic' });
    }
};
exports.updateTopic = updateTopic;
const deleteTopic = async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.topic.delete({ where: { id } });
        res.json({ message: 'Topic deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete topic' });
    }
};
exports.deleteTopic = deleteTopic;
//# sourceMappingURL=categoryController.js.map