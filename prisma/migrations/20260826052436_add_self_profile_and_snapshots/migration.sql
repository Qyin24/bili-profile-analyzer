-- CreateTable
CREATE TABLE "self_provided_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "self_provided_fields" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "allowedForAnalysis" BOOLEAN NOT NULL DEFAULT true,
    "consentScope" TEXT NOT NULL DEFAULT 'PERSISTENT_ACROSS_TASKS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "self_provided_fields_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "self_provided_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "self_provided_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "self_provided_snapshots_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "snapshot_fields" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "sourceFieldId" TEXT,
    "fieldName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "consentScope" TEXT NOT NULL DEFAULT 'PERSISTENT_ACROSS_TASKS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "snapshot_fields_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "self_provided_snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "snapshot_fields_sourceFieldId_fkey" FOREIGN KEY ("sourceFieldId") REFERENCES "self_provided_fields" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_analysis_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "taskStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "pipelineStage" TEXT NOT NULL DEFAULT 'COLLECT',
    "outcome" TEXT NOT NULL DEFAULT 'NONE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStageMessage" TEXT NOT NULL DEFAULT '',
    "needsRegeneration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "analysis_tasks_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "analysis_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_analysis_tasks" ("completedAt", "createdAt", "currentStageMessage", "id", "outcome", "pipelineStage", "progress", "targetId", "taskStatus", "updatedAt") SELECT "completedAt", "createdAt", "currentStageMessage", "id", "outcome", "pipelineStage", "progress", "targetId", "taskStatus", "updatedAt" FROM "analysis_tasks";
DROP TABLE "analysis_tasks";
ALTER TABLE "new_analysis_tasks" RENAME TO "analysis_tasks";
CREATE INDEX "analysis_tasks_targetId_idx" ON "analysis_tasks"("targetId");
CREATE INDEX "analysis_tasks_taskStatus_idx" ON "analysis_tasks"("taskStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "self_provided_fields_fieldName_idx" ON "self_provided_fields"("fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "self_provided_fields_profileId_fieldName_key" ON "self_provided_fields"("profileId", "fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "self_provided_snapshots_taskId_key" ON "self_provided_snapshots"("taskId");

-- CreateIndex
CREATE INDEX "snapshot_fields_snapshotId_idx" ON "snapshot_fields"("snapshotId");

-- CreateIndex
CREATE INDEX "snapshot_fields_fieldName_idx" ON "snapshot_fields"("fieldName");
