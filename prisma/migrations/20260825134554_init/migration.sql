-- CreateTable
CREATE TABLE "analysis_targets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL DEFAULT 'BILIBILI',
    "platformUid" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "analysis_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "taskStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "pipelineStage" TEXT NOT NULL DEFAULT 'COLLECT',
    "outcome" TEXT NOT NULL DEFAULT 'NONE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStageMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "analysis_tasks_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "analysis_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "data_source_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
    "recordsCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "data_source_runs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_targets_platformUid_key" ON "analysis_targets"("platformUid");

-- CreateIndex
CREATE INDEX "analysis_tasks_targetId_idx" ON "analysis_tasks"("targetId");

-- CreateIndex
CREATE INDEX "analysis_tasks_taskStatus_idx" ON "analysis_tasks"("taskStatus");

-- CreateIndex
CREATE INDEX "data_source_runs_taskId_idx" ON "data_source_runs"("taskId");
