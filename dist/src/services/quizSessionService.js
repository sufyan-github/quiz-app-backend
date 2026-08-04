"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createQuizSession = createQuizSession;
const prisma_1 = require("../prisma");
async function createQuizSession(input) {
    const durationSecs = Math.min(3 * 60 * 60, Math.max(60, Math.floor(input.durationSecs)));
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + (durationSecs + 60) * 1000);
    return prisma_1.prisma.quizSession.create({
        data: {
            userId: input.userId,
            topicId: input.topicId,
            questionIds: [...new Set(input.questionIds)],
            durationSecs,
            negativeMarking: input.negativeMarking,
            negativeValue: Math.min(1, Math.max(0, input.negativeValue)),
            language: input.language === 'bangla' ? 'bangla' : 'english',
            premiumAtStart: input.premiumAtStart,
            startedAt,
            expiresAt,
        },
    });
}
