-- AlterTable
ALTER TABLE "analysis_targets" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "analysis_tasks" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
