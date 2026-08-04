"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePromptTemplate = exports.getPromptTemplates = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const getPromptTemplates = async (req, res) => {
    try {
        const templates = await prisma_1.default.aiPromptTemplate.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(templates);
    }
    catch (error) {
        console.error('Get prompt templates error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPromptTemplates = getPromptTemplates;
const updatePromptTemplate = async (req, res) => {
    try {
        const id = req.params.id;
        const { systemPrompt, userPrompt, model, isActive } = req.body;
        const adminId = req.user?.userId;
        if (!adminId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const template = await prisma_1.default.aiPromptTemplate.update({
            where: { id },
            data: {
                systemPrompt,
                userPrompt,
                model,
                isActive
            }
        });
        // Log activity
        await prisma_1.default.activityLog.create({
            data: {
                userId: adminId,
                action: `Updated Prompt Template ${template.name}`,
                module: 'AI Config',
                ipAddress: req.ip
            }
        });
        res.json(template);
    }
    catch (error) {
        console.error('Update prompt template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updatePromptTemplate = updatePromptTemplate;
