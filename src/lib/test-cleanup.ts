/**
 * BiliProfile Analyzer — Controlled Test-Data Cleanup Core
 *
 * Precision deletion of test data created during Production/Preview E2E acceptance.
 *
 * Safety gates (all deletions are by EXACT id; never deleteMany, never fuzzy UID):
 *  1. Task must exist, else throw TestTaskNotFoundError (NOT_FOUND).
 *  2. Task.isTest must be true, else throw NotTestTaskError (FORBIDDEN).
 *     This physically prevents deleting any real user task regardless of token.
 *  3. Deleting the task cascades (via Prisma onDelete: Cascade) to:
 *     DataSourceRun, RawRecord, Metric, ReportEvidenceSnapshot, DeterministicReportArtifact,
 *     AiAnalysisArtifact, SelfProvidedSnapshot (+ SnapshotField), AnalysisResult.
 *  4. Target is deleted ONLY when BOTH hold:
 *     (a) zero remaining tasks reference it (reference-count gate), AND
 *     (b) target.isTest is true.
 *     Otherwise the target is skipped with an explanatory reason.
 *
 * The function is transport-agnostic so it can be unit-tested without the Next runtime,
 * while the route handler is responsible for token verification (see test-cleanup-auth).
 */

import { prisma } from "./prisma";

export interface TestCleanupResult {
  deletedTaskId: string;
  deletedTargetId: string | null;
  skippedTarget: boolean;
  reason: string;
}

export class NotTestTaskError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "该任务不是测试任务，拒绝删除") {
    super(message);
    this.name = "NotTestTaskError";
  }
}

export class TestTaskNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "未找到测试任务") {
    super(message);
    this.name = "TestTaskNotFoundError";
  }
}

export async function cleanupTestTask(taskId: string): Promise<TestCleanupResult> {
  const task = await prisma.analysisTask.findUnique({
    where: { id: taskId },
    select: { id: true, isTest: true, targetId: true },
  });

  if (!task) {
    throw new TestTaskNotFoundError();
  }

  // Gate 2: never touch real user data.
  if (!task.isTest) {
    throw new NotTestTaskError();
  }

  // Gate 3: precise id delete; Prisma cascades to all dependent child records.
  await prisma.analysisTask.delete({ where: { id: taskId } });

  // Gate 4: reference-count gate for the target.
  const remainingTaskCount = await prisma.analysisTask.count({
    where: { targetId: task.targetId },
  });

  if (remainingTaskCount > 0) {
    return {
      deletedTaskId: taskId,
      deletedTargetId: null,
      skippedTarget: true,
      reason: `Target ${task.targetId} is still referenced by ${remainingTaskCount} other task(s); skipped per reference gate.`,
    };
  }

  const target = await prisma.analysisTarget.findUnique({
    where: { id: task.targetId },
    select: { id: true, isTest: true },
  });

  if (!target) {
    return {
      deletedTaskId: taskId,
      deletedTargetId: null,
      skippedTarget: false,
      reason: "Target already absent; task cascade only.",
    };
  }

  if (!target.isTest) {
    return {
      deletedTaskId: taskId,
      deletedTargetId: null,
      skippedTarget: true,
      reason: "Target isTest=false; refusing to delete a non-test target.",
    };
  }

  await prisma.analysisTarget.delete({ where: { id: task.targetId } });

  return {
    deletedTaskId: taskId,
    deletedTargetId: task.targetId,
    skippedTarget: false,
    reason: "Task and its exclusive test target deleted.",
  };
}
