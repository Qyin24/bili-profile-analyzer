/**
 * BiliProfile Analyzer — Phase 5.2.3.1: Deterministic Report Artifact Storage Service
 *
 * Provides controlled, immutable, and minimal-projection persistence and read-only
 * retrieval for DeterministicReportInput associated with an AnalysisTask.
 *
 * Rules:
 * - Concurrency-safe idempotency and conflict resolution (handles P2002 race window).
 * - Metadata consistency check (artifact.schemaVersion === parsed.schemaVersion && artifact.taxonomyVersion === parsed.taxonomyVersion).
 * - Accepts only DeterministicAnalysisResult for writing (never direct client JSON/reportInput).
 * - Strict schema and invariant validation before writing and after reading.
 * - Immutable upon initial persistence: identical repeat writes are idempotent, different writes are rejected.
 * - Terminal tasks cannot have report artifacts added or modified.
 * - Zero reading/writing/propagation of SnapshotField.value, self-profile text, raw public body text, or credentials.
 * - Minimal Prisma select projections only.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DeterministicAnalysisResult,
  DeterministicReportInput,
  TaskDeterministicReportResponse,
  GetDeterministicReportResult,
} from "@/types/processing";
import {
  buildDeterministicReportInput,
  validateDeterministicReportInput,
} from "./processing/pipeline";

export class TaskNotFoundError extends Error {
  constructor(message = "Analysis task not found") {
    super(message);
    this.name = "TaskNotFoundError";
  }
}

export class TerminalTaskReportError extends Error {
  constructor(message = "Cannot modify or attach report artifact to terminal task") {
    super(message);
    this.name = "TerminalTaskReportError";
  }
}

export class ReportValidationFailedError extends Error {
  public readonly errors: string[];
  constructor(errors: string[]) {
    super(`Deterministic report validation failed: ${errors.join("; ")}`);
    this.name = "ReportValidationFailedError";
    this.errors = errors;
  }
}

export class ReportConflictError extends Error {
  constructor(message = "已存在的确定性报告工件不可修改或覆盖") {
    super(message);
    this.name = "ReportConflictError";
  }
}

/**
 * Persists a validated DeterministicReportInput built from DeterministicAnalysisResult.
 * Ensures concurrency safety and race-condition idempotency.
 */
export async function persistDeterministicReportForTask(
  taskId: string,
  analysisResult: DeterministicAnalysisResult
): Promise<TaskDeterministicReportResponse> {
  if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
    throw new TaskNotFoundError("Task ID must be a non-empty string");
  }

  if (!analysisResult || typeof analysisResult !== "object") {
    throw new ReportValidationFailedError(["AnalysisResult must be a valid object"]);
  }

  // 1. Build deterministic report input from analysis result
  const reportInput = buildDeterministicReportInput(analysisResult);

  // 2. Validate report input contract
  const validation = validateDeterministicReportInput(reportInput);
  if (!validation.valid) {
    throw new ReportValidationFailedError(validation.errors);
  }

  const serializedReportData = JSON.stringify(reportInput);

  // 3. Verify task existence and terminal state
  const task = await prisma.analysisTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskStatus: true,
    },
  });

  if (!task) {
    throw new TaskNotFoundError(`未找到 ID 为 ${taskId} 的分析任务`);
  }

  const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
  if (TERMINAL_STATUSES.includes(task.taskStatus)) {
    throw new TerminalTaskReportError(
      `终态任务 (状态: ${task.taskStatus}) 不可再新增或修改确定性报告工件`
    );
  }

  // 4. Check if report artifact already exists (Pre-create check)
  const existing = await prisma.deterministicReportArtifact.findUnique({
    where: { taskId },
    select: {
      id: true,
      taskId: true,
      schemaVersion: true,
      taxonomyVersion: true,
      reportData: true,
      createdAt: true,
    },
  });

  if (existing) {
    // Idempotency: If exact identical reportData AND matching metadata, safely return existing artifact
    if (
      existing.reportData === serializedReportData &&
      existing.schemaVersion === reportInput.schemaVersion &&
      existing.taxonomyVersion === reportInput.taxonomyVersion
    ) {
      return {
        taskId: existing.taskId,
        artifactId: existing.id,
        schemaVersion: existing.schemaVersion,
        taxonomyVersion: existing.taxonomyVersion,
        report: reportInput,
        createdAt: existing.createdAt.toISOString(),
      };
    }
    // Conflict: Different reportData or corrupted metadata -> Reject
    throw new ReportConflictError("该任务已存在确定性报告工件，且不可修改或覆盖");
  }

  // 5. Store new artifact in database with concurrency race handling
  try {
    const created = await prisma.deterministicReportArtifact.create({
      data: {
        taskId,
        schemaVersion: reportInput.schemaVersion,
        taxonomyVersion: reportInput.taxonomyVersion,
        reportData: serializedReportData,
      },
      select: {
        id: true,
        taskId: true,
        schemaVersion: true,
        taxonomyVersion: true,
        createdAt: true,
      },
    });

    return {
      taskId: created.taskId,
      artifactId: created.id,
      schemaVersion: created.schemaVersion,
      taxonomyVersion: created.taxonomyVersion,
      report: reportInput,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (err: unknown) {
    // Handle concurrent P2002 unique constraint race condition
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const reRead = await prisma.deterministicReportArtifact.findUnique({
        where: { taskId },
        select: {
          id: true,
          taskId: true,
          schemaVersion: true,
          taxonomyVersion: true,
          reportData: true,
          createdAt: true,
        },
      });

      if (
        reRead &&
        reRead.reportData === serializedReportData &&
        reRead.schemaVersion === reportInput.schemaVersion &&
        reRead.taxonomyVersion === reportInput.taxonomyVersion
      ) {
        return {
          taskId: reRead.taskId,
          artifactId: reRead.id,
          schemaVersion: reRead.schemaVersion,
          taxonomyVersion: reRead.taxonomyVersion,
          report: reportInput,
          createdAt: reRead.createdAt.toISOString(),
        };
      }

      throw new ReportConflictError("该任务已存在确定性报告工件，且不可修改或覆盖");
    }

    throw err;
  }
}

/**
 * Reads and validates a task's deterministic report artifact using minimal projection.
 * Enforces schemaVersion and taxonomyVersion consistency between metadata and reportData.
 */
export async function getDeterministicReportForTask(
  taskId: string
): Promise<GetDeterministicReportResult> {
  if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
    return {
      success: false,
      error: "TASK_NOT_FOUND",
      message: "任务 ID 必须为非空字符串",
    };
  }

  // Minimal projection select
  const artifact = await prisma.deterministicReportArtifact.findUnique({
    where: { taskId },
    select: {
      id: true,
      taskId: true,
      schemaVersion: true,
      taxonomyVersion: true,
      reportData: true,
      createdAt: true,
    },
  });

  if (!artifact) {
    // Check if task itself exists
    const task = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      select: { id: true },
    });

    if (!task) {
      return {
        success: false,
        error: "TASK_NOT_FOUND",
        message: `未找到 ID 为 ${taskId} 的分析任务`,
      };
    }

    return {
      success: false,
      error: "REPORT_NOT_FOUND",
      message: `任务 ${taskId} 尚未生成确定性报告工件`,
    };
  }

  // Safe JSON deserialization without exposing raw string on failure
  let parsed: unknown;
  try {
    parsed = JSON.parse(artifact.reportData);
  } catch {
    return {
      success: false,
      error: "CORRUPTED_REPORT_DATA",
      message: "确定性报告工件数据损坏，无法完成反序列化",
    };
  }

  // Strict contract validation
  const validation = validateDeterministicReportInput(parsed);
  if (!validation.valid) {
    return {
      success: false,
      error: "INVALID_REPORT_DATA",
      message: "确定性报告工件未通过契约有效性校验",
    };
  }

  const typedReport = parsed as DeterministicReportInput;

  // Metadata consistency verification (artifact columns vs parsed body)
  if (
    artifact.schemaVersion !== typedReport.schemaVersion ||
    artifact.taxonomyVersion !== typedReport.taxonomyVersion
  ) {
    return {
      success: false,
      error: "VERSION_METADATA_MISMATCH",
      message: "报告工件元数据版本与内容版本不一致",
    };
  }

  return {
    success: true,
    data: {
      taskId: artifact.taskId,
      artifactId: artifact.id,
      schemaVersion: artifact.schemaVersion,
      taxonomyVersion: artifact.taxonomyVersion,
      report: typedReport,
      createdAt: artifact.createdAt.toISOString(),
    },
  };
}
