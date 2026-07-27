export declare const aiService: {
    askTutor(prompt: string, userId: string, topicId?: string, lessonId?: string): Promise<string>;
    generateHint(questionId: string, userId: string): Promise<string>;
    generateQuiz(topicId: string, adminId: string, difficulty?: string, count?: number, adminPrompt?: string, language?: string): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        topicId: string;
        content: import("@prisma/client/runtime/client").JsonValue;
        generatedBy: string;
    }>;
};
//# sourceMappingURL=aiService.d.ts.map