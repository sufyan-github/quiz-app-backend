interface CreateQuizSessionInput {
    userId: string;
    topicId: string;
    questionIds: string[];
    durationSecs: number;
    negativeMarking: boolean;
    negativeValue: number;
    language: string;
    premiumAtStart: boolean;
}
export declare function createQuizSession(input: CreateQuizSessionInput): Promise<{
    userId: string;
    id: string;
    language: string;
    topicId: string;
    questionIds: string[];
    negativeMarking: boolean;
    negativeValue: number;
    premiumAtStart: boolean;
    durationSecs: number;
    startedAt: Date;
    expiresAt: Date;
    submittedAt: Date | null;
}>;
export {};
//# sourceMappingURL=quizSessionService.d.ts.map