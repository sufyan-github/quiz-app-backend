-- Incremental migration for the database already represented by schema.prisma.
-- Take a verified backup before applying in production.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firebaseUid" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_firebaseUid_key" ON "User"("firebaseUid");
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");

-- Keep the newest subscription row per user before enforcing one source-of-truth row.
DELETE FROM "Subscription" older
USING "Subscription" newer
WHERE older."subscriber_id" = newer."subscriber_id"
  AND (
    older."updated_at" < newer."updated_at"
    OR (older."updated_at" = newer."updated_at" AND older."id" < newer."id")
  );

DROP INDEX IF EXISTS "Subscription_subscriber_id_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_subscriber_id_key" ON "Subscription"("subscriber_id");

ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "isAiGenerated" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Question_topicId_language_status_idx" ON "Question"("topicId", "language", "status");
CREATE INDEX IF NOT EXISTS "Question_createdById_status_idx" ON "Question"("createdById", "status");

ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
CREATE INDEX IF NOT EXISTS "Exam_status_startDate_endDate_idx" ON "Exam"("status", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "ExamAttempt_studentId_status_idx" ON "ExamAttempt"("studentId", "status");
CREATE INDEX IF NOT EXISTS "ExamAttempt_examId_studentId_idx" ON "ExamAttempt"("examId", "studentId");

DELETE FROM "StudentAnswer" older
USING "StudentAnswer" newer
WHERE older."attemptId" = newer."attemptId"
  AND older."questionId" = newer."questionId"
  AND older."id" < newer."id";
CREATE UNIQUE INDEX IF NOT EXISTS "StudentAnswer_attemptId_questionId_key" ON "StudentAnswer"("attemptId", "questionId");

CREATE TABLE IF NOT EXISTS "StudyPlanCache" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyPlanCache_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudyPlanCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudyPlanCache_userId_key" ON "StudyPlanCache"("userId");
CREATE INDEX IF NOT EXISTS "StudyPlanCache_expiresAt_idx" ON "StudyPlanCache"("expiresAt");

CREATE TABLE IF NOT EXISTS "QuizSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "questionIds" TEXT[] NOT NULL,
  "negativeMarking" BOOLEAN NOT NULL DEFAULT false,
  "negativeValue" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "language" TEXT NOT NULL DEFAULT 'english',
  "premiumAtStart" BOOLEAN NOT NULL DEFAULT false,
  "durationSecs" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuizSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "QuizSession_userId_startedAt_idx" ON "QuizSession"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "QuizSession_expiresAt_idx" ON "QuizSession"("expiresAt");

ALTER TABLE "ExamHistory" ADD COLUMN IF NOT EXISTS "quizSessionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ExamHistory_quizSessionId_key" ON "ExamHistory"("quizSessionId");
CREATE INDEX IF NOT EXISTS "ExamHistory_userId_createdAt_idx" ON "ExamHistory"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamHistory_quizSessionId_fkey') THEN
    ALTER TABLE "ExamHistory"
      ADD CONSTRAINT "ExamHistory_quizSessionId_fkey"
      FOREIGN KEY ("quizSessionId") REFERENCES "QuizSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

ALTER TABLE "DailyLoginReward" ADD COLUMN IF NOT EXISTS "rewardDate" DATE;
UPDATE "DailyLoginReward" SET "rewardDate" = "createdAt"::date WHERE "rewardDate" IS NULL;

DELETE FROM "DailyLoginReward" older
USING "DailyLoginReward" newer
WHERE older."userId" = newer."userId"
  AND older."rewardDate" = newer."rewardDate"
  AND (
    older."createdAt" > newer."createdAt"
    OR (older."createdAt" = newer."createdAt" AND older."id" > newer."id")
  );

ALTER TABLE "DailyLoginReward" ALTER COLUMN "rewardDate" SET NOT NULL;
DROP INDEX IF EXISTS "DailyLoginReward_userId_createdAt_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DailyLoginReward_userId_rewardDate_key" ON "DailyLoginReward"("userId", "rewardDate");
