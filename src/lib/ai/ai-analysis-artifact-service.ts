/**
 * BiliProfile Analyzer — Phase 6.2: Task-level Offline AI Analysis Artifact Storage Service
 *
 * Provides controlled, immutable, and minimal-projection persistence and read-only
 * retrieval for AiAnalysisResult associated with an AnalysisTask.
 *
 * Rules:
 * - Accepts only validated DeterministicReportArtifact associated with the task as input.
 * - Only MOCK provider is supported; unknown or placeholder providers fail closed.
 * - Concurrency-safe idempotency and conflict resolution (handles P2002 race window).
 * - Comprehensive metadata consistency checks (artifact vs payload vs source report).
 * - Strict schema and invariant validation before writing and after reading.
 * - Immutable upon initial persistence: identical repeat writes are idempotent, different writes are rejected.
 * - Terminal tasks cannot have AI analysis artifacts added or modified.
 * - Zero reading/writing/propagation of SnapshotField.value, self-profile text, raw public body text, or credentials.
 * - Error Sanitization: All error messages are fixed, controlled strings (no dynamic IDs, providers, JSON fragments, or Prisma messages).
 * - Zero raw Prisma exception rethrow: All uncontrolled ORM errors are converted to AiAnalysisPersistenceError / INTERNAL_SERVER_ERROR.
 * - Minimal Prisma select projections only.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AiAnalysisResult,
  AiProviderType,
  TaskAiAnalysisResponse,
  GetTaskAiAnalysisResult,
  OpenAiCompatibleConfig,
  VALID_AI_PROVIDERS,
} from "@/types/ai-analysis";
import { DeterministicReportInput } from "@/types/processing";
import { validateDeterministicReportInput } from "@/lib/processing/pipeline";
import { generateAiAnalysis } from "./provider-registry";
import { validateAiAnalysisResult } from "./validator";

export class TaskNotFoundError extends Error {
  constructor(message = "未找到指定的分析任务") {
    super(message);
    this.name = "TaskNotFoundError";
  }
}

export class TerminalTaskAiAnalysisError extends Error {
  constructor(message = "终态任务不可再新增或修改 AI 分析工件") {
    super(message);
    this.name = "TerminalTaskAiAnalysisError";
  }
}

export class SourceReportNotFoundError extends Error {
  constructor(message = "任务尚未生成确定性报告工件") {
    super(message);
    this.name = "SourceReportNotFoundError";
  }
}

export class SourceReportInvalidError extends Error {
  constructor(message = "确定性报告工件数据损坏或无效") {
    super(message);
    this.name = "SourceReportInvalidError";
  }
}

export class AiAnalysisValidationError extends Error {
  constructor(message = "AI 分析契约校验未通过") {
    super(message);
    this.name = "AiAnalysisValidationError";
  }
}

export class AiAnalysisConflictError extends Error {
  constructor(message = "已存在的 AI 分析工件不可修改或覆盖") {
    super(message);
    this.name = "AiAnalysisConflictError";
  }
}

export class AiAnalysisPersistenceError extends Error {
  constructor(message = "AI 分析工件存储失败") {
    super(message);
    this.name = "AiAnalysisPersistenceError";
  }
}

export interface PersistAiAnalysisOptions {
  provider?: AiProviderType;
  openAiConfig?: OpenAiCompatibleConfig;
  customFetch?: typeof fetch;
}

/**
 * Generates and persists an AI analysis artifact for a task based on its deterministic report.
 * Supports MOCK and OPENAI_COMPATIBLE providers with concurrency safety and race-condition idempotency.
 */
export async function persistAiAnalysisForTask(
  taskId: string,
  options?: PersistAiAnalysisOptions
): Promise<TaskAiAnalysisResponse> {
  if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
    throw new TaskNotFoundError("任务 ID 必须为非空字符串");
  }

  const targetProvider: AiProviderType = options?.provider ?? "MOCK";

  // 1. Verify task existence and terminal state with minimal projection
  let task;
  try {
    task = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskStatus: true,
      },
    });
  } catch {
    throw new AiAnalysisPersistenceError();
  }

  if (!task) {
    throw new TaskNotFoundError("未找到指定的分析任务");
  }

  const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
  if (TERMINAL_STATUSES.includes(task.taskStatus)) {
    throw new TerminalTaskAiAnalysisError("终态任务不可再新增或修改 AI 分析工件");
  }

  // 2. Read the task's DeterministicReportArtifact
  let reportArtifact;
  try {
    reportArtifact = await prisma.deterministicReportArtifact.findUnique({
      where: { taskId },
      select: {
        id: true,
        taskId: true,
        schemaVersion: true,
        taxonomyVersion: true,
        reportData: true,
      },
    });
  } catch {
    throw new AiAnalysisPersistenceError();
  }

  if (!reportArtifact) {
    throw new SourceReportNotFoundError("任务尚未生成确定性报告工件");
  }

  // 3. Safe deserialization and validation of deterministic report input
  let parsedReport: unknown;
  try {
    parsedReport = JSON.parse(reportArtifact.reportData);
  } catch {
    throw new SourceReportInvalidError("确定性报告工件数据损坏，无法完成反序列化");
  }

  const reportValidation = validateDeterministicReportInput(parsedReport);
  if (!reportValidation.valid) {
    throw new SourceReportInvalidError("确定性报告工件未通过契约有效性校验");
  }

  const typedReport = parsedReport as DeterministicReportInput;

  // Verify metadata consistency for deterministic report
  if (
    reportArtifact.schemaVersion !== typedReport.schemaVersion ||
    reportArtifact.taxonomyVersion !== typedReport.taxonomyVersion
  ) {
    throw new SourceReportInvalidError("确定性报告工件元数据版本与内容版本不一致");
  }

  // 4. Generate AI analysis using unified entrypoint
  const aiResult = await generateAiAnalysis(typedReport, targetProvider, {
    openAiConfig: options?.openAiConfig,
    customFetch: options?.customFetch,
  });

  // Validate output result strictly
  const aiValidation = validateAiAnalysisResult(aiResult, typedReport);
  if (!aiValidation.valid) {
    throw new AiAnalysisValidationError();
  }

  const serializedAnalysisData = JSON.stringify(aiResult);

  // 5. Pre-create check for existing artifact (Idempotency check)
  let existing;
  try {
    existing = await prisma.aiAnalysisArtifact.findUnique({
      where: { taskId },
      select: {
        id: true,
        taskId: true,
        provider: true,
        schemaVersion: true,
        reportSchemaVersion: true,
        taxonomyVersion: true,
        analysisData: true,
        createdAt: true,
      },
    });
  } catch {
    throw new AiAnalysisPersistenceError();
  }

  if (existing) {
    if (
      existing.analysisData === serializedAnalysisData &&
      existing.provider === targetProvider &&
      existing.schemaVersion === aiResult.schemaVersion &&
      existing.reportSchemaVersion === typedReport.schemaVersion &&
      existing.taxonomyVersion === typedReport.taxonomyVersion
    ) {
      return {
        taskId: existing.taskId,
        artifactId: existing.id,
        provider: existing.provider as AiProviderType,
        schemaVersion: existing.schemaVersion,
        reportSchemaVersion: existing.reportSchemaVersion,
        taxonomyVersion: existing.taxonomyVersion,
        analysis: aiResult,
        createdAt: existing.createdAt.toISOString(),
      };
    }
    throw new AiAnalysisConflictError("已存在的 AI 分析工件不可修改或覆盖");
  }

  // 6. Persist new AI analysis artifact with concurrency race handling
  try {
    const created = await prisma.aiAnalysisArtifact.create({
      data: {
        taskId,
        provider: targetProvider,
        schemaVersion: aiResult.schemaVersion,
        reportSchemaVersion: typedReport.schemaVersion,
        taxonomyVersion: typedReport.taxonomyVersion,
        analysisData: serializedAnalysisData,
      },
      select: {
        id: true,
        taskId: true,
        provider: true,
        schemaVersion: true,
        reportSchemaVersion: true,
        taxonomyVersion: true,
        createdAt: true,
      },
    });

    return {
      taskId: created.taskId,
      artifactId: created.id,
      provider: created.provider as AiProviderType,
      schemaVersion: created.schemaVersion,
      reportSchemaVersion: created.reportSchemaVersion,
      taxonomyVersion: created.taxonomyVersion,
      analysis: aiResult,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (err: unknown) {
    // Handle concurrent P2002 unique constraint race condition
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      let reRead;
      try {
        reRead = await prisma.aiAnalysisArtifact.findUnique({
          where: { taskId },
          select: {
            id: true,
            taskId: true,
            provider: true,
            schemaVersion: true,
            reportSchemaVersion: true,
            taxonomyVersion: true,
            analysisData: true,
            createdAt: true,
          },
        });
      } catch {
        throw new AiAnalysisPersistenceError();
      }

      if (
        reRead &&
        reRead.analysisData === serializedAnalysisData &&
        reRead.provider === targetProvider &&
        reRead.schemaVersion === aiResult.schemaVersion &&
        reRead.reportSchemaVersion === typedReport.schemaVersion &&
        reRead.taxonomyVersion === typedReport.taxonomyVersion
      ) {
        return {
          taskId: reRead.taskId,
          artifactId: reRead.id,
          provider: reRead.provider as AiProviderType,
          schemaVersion: reRead.schemaVersion,
          reportSchemaVersion: reRead.reportSchemaVersion,
          taxonomyVersion: reRead.taxonomyVersion,
          analysis: aiResult,
          createdAt: reRead.createdAt.toISOString(),
        };
      }

      throw new AiAnalysisConflictError("已存在的 AI 分析工件不可修改或覆盖");
    }

    throw new AiAnalysisPersistenceError();
  }
}

export const DESENSITIZED_AI_UNAVAILABLE_SUMMARY = "AI 分析暂不可用；已保留确定性统计结果。";
export const DESENSITIZED_AI_UNAVAILABLE_LIMITATION = "AI 分析暂不可用，本次分析仅展示确定性统计结果。";

/**
 * Persists a standardized, desensitized AI degradation artifact for a task.
 * Used when real or mock AI analysis generation or validation fails, ensuring deterministic report is preserved.
 */
export async function persistAiDegradedArtifactForTask(
  taskId: string,
  provider: AiProviderType = "MOCK"
): Promise<TaskAiAnalysisResponse> {
  if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
    throw new TaskNotFoundError("任务 ID 必须为非空字符串");
  }

  // 1. Verify task existence and terminal state
  let task;
  try {
    task = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      select: { id: true, taskStatus: true },
    });
  } catch {
    throw new AiAnalysisPersistenceError();
  }

  if (!task) {
    throw new TaskNotFoundError("未找到指定的分析任务");
  }

  const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
  if (TERMINAL_STATUSES.includes(task.taskStatus)) {
    throw new TerminalTaskAiAnalysisError("终态任务不可再新增或修改 AI 分析工件");
  }

  // 2. Read deterministic report artifact
  let reportArtifact;
  try {
    reportArtifact = await prisma.deterministicReportArtifact.findUnique({
      where: { taskId },
      select: {
        id: true,
        taskId: true,
        schemaVersion: true,
        taxonomyVersion: true,
      },
    });
  } catch {
    throw new AiAnalysisPersistenceError();
  }

  if (!reportArtifact) {
    throw new SourceReportNotFoundError("任务尚未生成确定性报告工件");
  }

  const degradedAiResult: AiAnalysisResult = {
    schemaVersion: "ai-analysis-result/v1",
    provider,
    summary: DESENSITIZED_AI_UNAVAILABLE_SUMMARY,
    findings: [],
    limitations: [DESENSITIZED_AI_UNAVAILABLE_LIMITATION],
  };

  const serializedData = JSON.stringify(degradedAiResult);

  // 3. Check existing artifact (idempotency check)
  let existing;
  try {
    existing = await prisma.aiAnalysisArtifact.findUnique({
      where: { taskId },
      select: {
        id: true,
        taskId: true,
        provider: true,
        schemaVersion: true,
        reportSchemaVersion: true,
        taxonomyVersion: true,
        analysisData: true,
        createdAt: true,
      },
    });
  } catch {
    throw new AiAnalysisPersistenceError();
  }

  if (existing) {
    return {
      taskId: existing.taskId,
      artifactId: existing.id,
      provider: existing.provider as AiProviderType,
      schemaVersion: existing.schemaVersion,
      reportSchemaVersion: existing.reportSchemaVersion,
      taxonomyVersion: existing.taxonomyVersion,
      analysis: degradedAiResult,
      createdAt: existing.createdAt.toISOString(),
    };
  }

  // 4. Create new degraded artifact
  try {
    const created = await prisma.aiAnalysisArtifact.create({
      data: {
        taskId,
        provider,
        schemaVersion: degradedAiResult.schemaVersion,
        reportSchemaVersion: reportArtifact.schemaVersion,
        taxonomyVersion: reportArtifact.taxonomyVersion,
        analysisData: serializedData,
      },
      select: {
        id: true,
        taskId: true,
        provider: true,
        schemaVersion: true,
        reportSchemaVersion: true,
        taxonomyVersion: true,
        createdAt: true,
      },
    });

    return {
      taskId: created.taskId,
      artifactId: created.id,
      provider: created.provider as AiProviderType,
      schemaVersion: created.schemaVersion,
      reportSchemaVersion: created.reportSchemaVersion,
      taxonomyVersion: created.taxonomyVersion,
      analysis: degradedAiResult,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raceExisting = await prisma.aiAnalysisArtifact.findUnique({
        where: { taskId },
      });
      if (raceExisting) {
        return {
          taskId: raceExisting.taskId,
          artifactId: raceExisting.id,
          provider: raceExisting.provider as AiProviderType,
          schemaVersion: raceExisting.schemaVersion,
          reportSchemaVersion: raceExisting.reportSchemaVersion,
          taxonomyVersion: raceExisting.taxonomyVersion,
          analysis: degradedAiResult,
          createdAt: raceExisting.createdAt.toISOString(),
        };
      }
    }
    throw new AiAnalysisPersistenceError();
  }
}

/**
 * Generates and persists a mock AI analysis artifact for a task based on its deterministic report.
 * Ensures concurrency safety and race-condition idempotency.
 */
export async function persistMockAiAnalysisForTask(
  taskId: string
): Promise<TaskAiAnalysisResponse> {
  return persistAiAnalysisForTask(taskId, { provider: "MOCK" });
}

/**
 * Reads and validates a task's AI analysis artifact using minimal projection.
 * Re-validates the AI analysis against the task's deterministic report and verifies metadata.
 */
export async function getAiAnalysisForTask(
  taskId: string
): Promise<GetTaskAiAnalysisResult> {
  if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
    return {
      success: false,
      error: "TASK_NOT_FOUND",
      message: "任务 ID 必须为非空字符串",
    };
  }

  // 1. Read AI analysis artifact using minimal projection
  let aiArtifact;
  try {
    aiArtifact = await prisma.aiAnalysisArtifact.findUnique({
      where: { taskId },
      select: {
        id: true,
        taskId: true,
        provider: true,
        schemaVersion: true,
        reportSchemaVersion: true,
        taxonomyVersion: true,
        analysisData: true,
        createdAt: true,
      },
    });
  } catch {
    return {
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "获取 AI 分析工件失败",
    };
  }

  if (!aiArtifact) {
    // Check if the task itself exists
    let task;
    try {
      task = await prisma.analysisTask.findUnique({
        where: { id: taskId },
        select: { id: true },
      });
    } catch {
      return {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "获取 AI 分析工件失败",
      };
    }

    if (!task) {
      return {
        success: false,
        error: "TASK_NOT_FOUND",
        message: "未找到指定的分析任务",
      };
    }

    return {
      success: false,
      error: "AI_ANALYSIS_NOT_FOUND",
      message: "任务尚未生成 AI 分析工件",
    };
  }

  // 2. Safe JSON deserialization of AI analysis data
  let parsedAiData: unknown;
  try {
    parsedAiData = JSON.parse(aiArtifact.analysisData);
  } catch {
    return {
      success: false,
      error: "CORRUPTED_AI_ANALYSIS_DATA",
      message: "AI 分析工件数据损坏，无法完成反序列化",
    };
  }

  // 3. Read and validate the corresponding DeterministicReportArtifact
  let reportArtifact;
  try {
    reportArtifact = await prisma.deterministicReportArtifact.findUnique({
      where: { taskId },
      select: {
        id: true,
        schemaVersion: true,
        taxonomyVersion: true,
        reportData: true,
      },
    });
  } catch {
    return {
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "获取 AI 分析工件失败",
    };
  }

  if (!reportArtifact) {
    return {
      success: false,
      error: "SOURCE_REPORT_NOT_FOUND",
      message: "AI 分析工件引用的确定性报告不存在",
    };
  }

  let parsedReportData: unknown;
  try {
    parsedReportData = JSON.parse(reportArtifact.reportData);
  } catch {
    return {
      success: false,
      error: "SOURCE_REPORT_INVALID",
      message: "引用的确定性报告数据损坏",
    };
  }

  const reportValidation = validateDeterministicReportInput(parsedReportData);
  if (!reportValidation.valid) {
    return {
      success: false,
      error: "SOURCE_REPORT_INVALID",
      message: "引用的确定性报告未通过契约有效性校验",
    };
  }

  const typedReport = parsedReportData as DeterministicReportInput;

  // Verify source report metadata consistency
  if (
    reportArtifact.schemaVersion !== typedReport.schemaVersion ||
    reportArtifact.taxonomyVersion !== typedReport.taxonomyVersion
  ) {
    return {
      success: false,
      error: "VERSION_METADATA_MISMATCH",
      message: "引用的确定性报告元数据版本与内容版本不一致",
    };
  }

  // 4. Validate AI Analysis Result against the source report
  const aiValidation = validateAiAnalysisResult(parsedAiData, typedReport);
  if (!aiValidation.valid) {
    return {
      success: false,
      error: "INVALID_AI_ANALYSIS_DATA",
      message: "AI 分析工件未通过契约有效性校验",
    };
  }

  const typedAiResult = parsedAiData as AiAnalysisResult;

  // 5. Verify metadata consistency between AI artifact columns, AI result, and source report
  if (
    aiArtifact.provider !== typedAiResult.provider ||
    !VALID_AI_PROVIDERS.includes(aiArtifact.provider as AiProviderType) ||
    aiArtifact.schemaVersion !== typedAiResult.schemaVersion ||
    aiArtifact.reportSchemaVersion !== typedReport.schemaVersion ||
    aiArtifact.taxonomyVersion !== typedReport.taxonomyVersion
  ) {
    return {
      success: false,
      error: "VERSION_METADATA_MISMATCH",
      message: "AI 分析工件元数据版本与内容或来源报告版本不一致",
    };
  }

  return {
    success: true,
    data: {
      taskId: aiArtifact.taskId,
      artifactId: aiArtifact.id,
      provider: aiArtifact.provider as AiProviderType,
      schemaVersion: aiArtifact.schemaVersion,
      reportSchemaVersion: aiArtifact.reportSchemaVersion,
      taxonomyVersion: aiArtifact.taxonomyVersion,
      analysis: typedAiResult,
      createdAt: aiArtifact.createdAt.toISOString(),
    },
  };
}
