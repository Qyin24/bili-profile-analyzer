-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('COLLECT', 'NORMALIZE', 'CLEAN', 'EXTRACT', 'AGGREGATE', 'STATISTICAL_ANALYSIS', 'AI_ANALYSIS', 'SYNTHESIS', 'REPORT');

-- CreateEnum
CREATE TYPE "TaskOutcome" AS ENUM ('FULL', 'PARTIAL', 'NONE');

-- CreateEnum
CREATE TYPE "DataSourceRunStatus" AS ENUM ('SUCCEEDED', 'SKIPPED_UNAVAILABLE', 'RATE_LIMITED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('THIS_TASK_ONLY', 'PERSISTENT_ACROSS_TASKS');

-- CreateEnum
CREATE TYPE "RawRecordSourceType" AS ENUM ('BASIC_PROFILE', 'PUBLIC_FOLLOWS', 'PUBLIC_CONTENT');

-- CreateEnum
CREATE TYPE "TopicSubjectType" AS ENUM ('FOLLOW', 'CONTENT_ITEM');

-- CreateEnum
CREATE TYPE "TopicAssignmentMethod" AS ENUM ('RULE_BASED', 'MANUAL');

-- CreateEnum
CREATE TYPE "EvidenceSourceType" AS ENUM ('SELF_REPORTED', 'STATISTICAL_METRIC', 'FOLLOW_RECORD', 'CONTENT_SAMPLE');

-- CreateTable
CREATE TABLE "analysis_targets" (
    "id" TEXT NOT NULL,
    "inputType" TEXT NOT NULL DEFAULT 'UID',
    "platform" TEXT NOT NULL DEFAULT 'BILIBILI',
    "platformUid" TEXT NOT NULL,
    "normalizedIdentifier" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT,
    "operatorConsentConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_provided_profiles" (
    "id" TEXT NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "self_provided_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_provided_fields" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL DEFAULT '',
    "fieldName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "allowedForAnalysis" BOOLEAN NOT NULL DEFAULT true,
    "consentScope" "ConsentScope" NOT NULL DEFAULT 'PERSISTENT_ACROSS_TASKS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "self_provided_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_tasks" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "taskStatus" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'COLLECT',
    "outcome" "TaskOutcome" NOT NULL DEFAULT 'NONE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStageMessage" TEXT NOT NULL DEFAULT '',
    "needsRegeneration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "analysis_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_provided_snapshots" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "self_provided_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshot_fields" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceFieldId" TEXT,
    "fieldKey" TEXT NOT NULL DEFAULT '',
    "fieldName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "consentScope" "ConsentScope" NOT NULL DEFAULT 'PERSISTENT_ACROSS_TASKS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshot_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source_runs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "status" "DataSourceRunStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "recordsCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_source_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_records" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dataSourceRunId" TEXT,
    "sourceType" "RawRecordSourceType" NOT NULL,
    "sourceIdentifier" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "platformUid" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "signature" TEXT,
    "level" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "followUid" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "signature" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "title" TEXT,
    "textExcerpt" TEXT,
    "publishTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_taxonomies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_taxonomies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_assignments" (
    "id" TEXT NOT NULL,
    "subjectType" "TopicSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "method" "TopicAssignmentMethod" NOT NULL DEFAULT 'RULE_BASED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "evidenceIds" TEXT NOT NULL DEFAULT '[]',
    "followId" TEXT,
    "contentItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "numericValue" DOUBLE PRECISION NOT NULL,
    "structuredValue" TEXT,
    "unit" TEXT,
    "source" TEXT NOT NULL DEFAULT 'STATISTICAL_ANALYSIS',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_evidence_snapshots" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceType" "EvidenceSourceType" NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "title" TEXT,
    "excerptOrMetricValue" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_evidence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_results" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "outcome" "TaskOutcome" NOT NULL DEFAULT 'FULL',
    "metricsData" TEXT,
    "claimsData" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deterministic_report_artifacts" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "reportData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deterministic_report_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analysis_artifacts" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "reportSchemaVersion" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "analysisData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_targets_platformUid_key" ON "analysis_targets"("platformUid");

-- CreateIndex
CREATE UNIQUE INDEX "self_provided_profiles_targetId_key" ON "self_provided_profiles"("targetId");

-- CreateIndex
CREATE INDEX "self_provided_fields_fieldName_idx" ON "self_provided_fields"("fieldName");

-- CreateIndex
CREATE INDEX "self_provided_fields_fieldKey_idx" ON "self_provided_fields"("fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "self_provided_fields_profileId_fieldName_key" ON "self_provided_fields"("profileId", "fieldName");

-- CreateIndex
CREATE INDEX "analysis_tasks_targetId_idx" ON "analysis_tasks"("targetId");

-- CreateIndex
CREATE INDEX "analysis_tasks_taskStatus_idx" ON "analysis_tasks"("taskStatus");

-- CreateIndex
CREATE UNIQUE INDEX "self_provided_snapshots_taskId_key" ON "self_provided_snapshots"("taskId");

-- CreateIndex
CREATE INDEX "snapshot_fields_snapshotId_idx" ON "snapshot_fields"("snapshotId");

-- CreateIndex
CREATE INDEX "snapshot_fields_fieldName_idx" ON "snapshot_fields"("fieldName");

-- CreateIndex
CREATE INDEX "snapshot_fields_fieldKey_idx" ON "snapshot_fields"("fieldKey");

-- CreateIndex
CREATE INDEX "data_source_runs_taskId_idx" ON "data_source_runs"("taskId");

-- CreateIndex
CREATE INDEX "raw_records_taskId_idx" ON "raw_records"("taskId");

-- CreateIndex
CREATE INDEX "raw_records_dataSourceRunId_idx" ON "raw_records"("dataSourceRunId");

-- CreateIndex
CREATE INDEX "raw_records_expiresAt_idx" ON "raw_records"("expiresAt");

-- CreateIndex
CREATE INDEX "profiles_targetId_idx" ON "profiles"("targetId");

-- CreateIndex
CREATE INDEX "profiles_platformUid_idx" ON "profiles"("platformUid");

-- CreateIndex
CREATE INDEX "follows_targetId_idx" ON "follows"("targetId");

-- CreateIndex
CREATE INDEX "follows_followUid_idx" ON "follows"("followUid");

-- CreateIndex
CREATE INDEX "content_items_targetId_idx" ON "content_items"("targetId");

-- CreateIndex
CREATE INDEX "content_items_itemId_idx" ON "content_items"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "topic_taxonomies_code_key" ON "topic_taxonomies"("code");

-- CreateIndex
CREATE INDEX "topic_assignments_subjectType_subjectId_idx" ON "topic_assignments"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "topic_assignments_topicId_idx" ON "topic_assignments"("topicId");

-- CreateIndex
CREATE INDEX "topic_assignments_followId_idx" ON "topic_assignments"("followId");

-- CreateIndex
CREATE INDEX "topic_assignments_contentItemId_idx" ON "topic_assignments"("contentItemId");

-- CreateIndex
CREATE INDEX "metrics_taskId_idx" ON "metrics"("taskId");

-- CreateIndex
CREATE INDEX "report_evidence_snapshots_taskId_idx" ON "report_evidence_snapshots"("taskId");

-- CreateIndex
CREATE INDEX "report_evidence_snapshots_evidenceId_idx" ON "report_evidence_snapshots"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_results_taskId_key" ON "analysis_results"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "deterministic_report_artifacts_taskId_key" ON "deterministic_report_artifacts"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_analysis_artifacts_taskId_key" ON "ai_analysis_artifacts"("taskId");

-- AddForeignKey
ALTER TABLE "self_provided_profiles" ADD CONSTRAINT "self_provided_profiles_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "analysis_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_provided_fields" ADD CONSTRAINT "self_provided_fields_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "self_provided_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_tasks" ADD CONSTRAINT "analysis_tasks_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "analysis_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_provided_snapshots" ADD CONSTRAINT "self_provided_snapshots_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_fields" ADD CONSTRAINT "snapshot_fields_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "self_provided_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_fields" ADD CONSTRAINT "snapshot_fields_sourceFieldId_fkey" FOREIGN KEY ("sourceFieldId") REFERENCES "self_provided_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source_runs" ADD CONSTRAINT "data_source_runs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_records" ADD CONSTRAINT "raw_records_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_records" ADD CONSTRAINT "raw_records_dataSourceRunId_fkey" FOREIGN KEY ("dataSourceRunId") REFERENCES "data_source_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "analysis_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "analysis_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "analysis_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_assignments" ADD CONSTRAINT "topic_assignments_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topic_taxonomies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_assignments" ADD CONSTRAINT "topic_assignments_followId_fkey" FOREIGN KEY ("followId") REFERENCES "follows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_assignments" ADD CONSTRAINT "topic_assignments_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_evidence_snapshots" ADD CONSTRAINT "report_evidence_snapshots_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deterministic_report_artifacts" ADD CONSTRAINT "deterministic_report_artifacts_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_artifacts" ADD CONSTRAINT "ai_analysis_artifacts_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "analysis_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddCheckConstraint for polymorphic subject integrity
ALTER TABLE "topic_assignments" ADD CONSTRAINT "topic_assignments_subject_integrity_check" CHECK (
    ("subjectType" = 'FOLLOW' AND "followId" IS NOT NULL AND "contentItemId" IS NULL AND "subjectId" = "followId")
    OR
    ("subjectType" = 'CONTENT_ITEM' AND "contentItemId" IS NOT NULL AND "followId" IS NULL AND "subjectId" = "contentItemId")
);
