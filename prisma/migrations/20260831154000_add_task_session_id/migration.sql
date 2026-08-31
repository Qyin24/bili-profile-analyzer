-- AlterTable
ALTER TABLE "analysis_tasks" ADD COLUMN "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "analysis_tasks_sessionId_idx" ON "analysis_tasks"("sessionId");
