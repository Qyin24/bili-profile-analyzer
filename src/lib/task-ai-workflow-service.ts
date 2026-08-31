/**
 * BiliProfile Analyzer — Phase 6.3 & 6.3.1: Task-level Offline AI Workflow & Completion Service
 *
 * Orchestrates the secure completion workflow for an AnalysisTask:
 * 1. Validates task existence and non-terminal status;
 * 2. Persists DeterministicReportArtifact via persistDeterministicReportForTask;
 * 3. Persists AiAnalysisArtifact (MOCK provider) via persistMockAiAnalysisForTask;
 * 4. Verifies both artifacts via read-only services (getDeterministicReportForTask & getAiAnalysisForTask);
 * 5. Updates task to COMPLETED / REPORT / 100% via task lifecycle rules only after both artifacts are verified.
 *
 * Concurrency & Terminal Safety:
 * - Deterministic report ALWAYS precedes AI artifact.
 * - Task is NEVER completed before both artifacts are written and verified.
 * - Final task completion write uses Prisma atomic conditional update (updateMany with non-terminal filter).
 * - If conditional update fails (count === 0), safely re-reads task:
 *   * If already COMPLETED with identical matching artifacts -> idempotent success.
 *   * If FAILED, CANCELLED, or invalid -> controlled terminal error (zero resurrection of cancelled tasks).
 * - Idempotent on repeat executions for the same task and same input.
 * - Safe against concurrency races (unique constraint / P2002 handling handled by underlying services).
 * - Conflict fail-closed if input conflicts with existing immutable artifacts.
 * - Zero reading/writing of raw source bodies, snapshots, self-profile fields, or credentials.
 * - All error classes have static readonly `code` properties and static sanitized Chinese messages.
 */

import { prisma } from "@/lib/prisma";
import { DeterministicAnalysisResult } from "@/types/processing";
import {
  TaskAiWorkflowResult,
  TaskAiWorkflowErrorCode,
} from "@/types/task-workflow";
import { TaskStatus, PipelineStage, TaskOutcome } from "@/types/analysis";
import {
  persistDeterministicReportForTask,
  getDeterministicReportForTask,
  ReportConflictError,
  TerminalTaskReportError,
  TaskNotFoundError as ReportTaskNotFoundError,
} from "./deterministic-report-service";
import {
  persistAiAnalysisForTask,
  getAiAnalysisForTask,
  AiAnalysisConflictError,
  TerminalTaskAiAnalysisError,
  TaskNotFoundError as AiTaskNotFoundError,
} from "./ai";
import {
  validateTaskLifecycleTransition,
  TaskLifecycleState,
} from "./task-lifecycle";
import { buildDeterministicReportInput } from "./processing/pipeline";
import { UpdateTaskDto } from "@/types/task-api";
import { AiProviderType, OpenAiCompatibleConfig } from "@/types/ai-analysis";

export class TaskWorkflowTaskNotFoundError extends Error {
  public readonly code: TaskAiWorkflowErrorCode = "TASK_NOT_FOUND";
  constructor(message = "未找到指定的分析任务") {
    super(message);
    this.name = "TaskWorkflowTaskNotFoundError";
  }
}

export class TaskWorkflowTerminalStateError extends Error {
  public readonly code: TaskAiWorkflowErrorCode = "TERMINAL_STATE_ERROR";
  constructor(message = "终态任务不可再新增或修改报告与 AI 工件") {
    super(message);
    this.name = "TaskWorkflowTerminalStateError";
  }
}

export class TaskWorkflowConflictError extends Error {
  public readonly code: TaskAiWorkflowErrorCode = "CONFLICT_ERROR";
  constructor(message = "任务报告或 AI 工件存在冲突，不可修改或覆盖") {
    super(message);
    this.name = "TaskWorkflowConflictError";
  }
}

export class TaskWorkflowReportPersistError extends Error {
  public readonly code: TaskAiWorkflowErrorCode = "REPORT_PERSISTENCE_FAILED";
  constructor(message = "确定性报告持久化失败") {
    super(message);
    this.name = "TaskWorkflowReportPersistError";
  }
}

export class TaskWorkflowAiPersistError extends Error {
  public readonly code: TaskAiWorkflowErrorCode = "AI_ANALYSIS_PERSISTENCE_FAILED";
  constructor(message = "AI 分析工件持久化失败") {
    super(message);
    this.name = "TaskWorkflowAiPersistError";
  }
}

export class TaskWorkflowVerificationError extends Error {
  public readonly code: TaskAiWorkflowErrorCode = "ARTIFACT_VERIFICATION_FAILED";
  constructor(message = "分析工件读取验证失败") {
    super(message);
    this.name = "TaskWorkflowVerificationError";
  }
}

export class TaskWorkflowLifecycleError extends Error {
  public readonly code: TaskAiWorkflowErrorCode = "LIFECYCLE_TRANSITION_FAILED";
  constructor(message = "任务生命周期校验未通过") {
    super(message);
    this.name = "TaskWorkflowLifecycleError";
  }
}

export class TaskWorkflowExecutionError extends Error {
  public readonly code: TaskAiWorkflowErrorCode;
  constructor(
    message = "任务离线分析编排执行失败",
    code: TaskAiWorkflowErrorCode = "REPORT_PERSISTENCE_FAILED"
  ) {
    super(message);
    this.name = "TaskWorkflowExecutionError";
    this.code = code;
  }
}

/**
 * Checks whether an already completed task has valid matching artifacts
 * and returns the idempotent completion result.
 */
async function checkCompletedTaskMatch(
  taskId: string,
  deterministicAnalysis: DeterministicAnalysisResult
): Promise<TaskAiWorkflowResult | null> {
  const existingReportResult = await getDeterministicReportForTask(taskId);
  const existingAiResult = await getAiAnalysisForTask(taskId);

  if (existingReportResult.success && existingAiResult.success) {
    let candidateReport;
    try {
      candidateReport = buildDeterministicReportInput(deterministicAnalysis);
    } catch {
      throw new TaskWorkflowReportPersistError("确定性分析构建失败");
    }

    if (
      JSON.stringify(candidateReport) ===
      JSON.stringify(existingReportResult.data.report)
    ) {
      const task = await prisma.analysisTask.findUnique({
        where: { id: taskId },
        select: { id: true, taskStatus: true, completedAt: true },
      });

      return {
        taskId,
        deterministicReportArtifactId: existingReportResult.data.artifactId,
        aiAnalysisArtifactId: existingAiResult.data.artifactId,
        taskStatus: (task?.taskStatus ?? "COMPLETED") as TaskStatus,
        completedAt: task?.completedAt
          ? task.completedAt.toISOString()
          : new Date().toISOString(),
      };
    }
    throw new TaskWorkflowConflictError("已存在的确定性报告工件不可修改或覆盖");
  }

  return null;
}

export interface CompleteTaskWithAiOptions {
  provider?: AiProviderType;
  openAiConfig?: OpenAiCompatibleConfig;
  customFetch?: typeof fetch;
}

/**
 * Orchestrates deterministic report storage, AI analysis generation & storage,
 * and subsequent conditional atomic task completion.
 */
export async function completeTaskWithAi(
  taskId: string,
  deterministicAnalysis: DeterministicAnalysisResult,
  options?: CompleteTaskWithAiOptions
): Promise<TaskAiWorkflowResult> {
  if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
    throw new TaskWorkflowTaskNotFoundError("任务 ID 必须为非空字符串");
  }

  if (!deterministicAnalysis || typeof deterministicAnalysis !== "object") {
    throw new TaskWorkflowReportPersistError("确定性分析结果无效");
  }

  // 1. Minimal projection read of task to check existence and lifecycle state
  let task;
  try {
    task = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskStatus: true,
        pipelineStage: true,
        progress: true,
        outcome: true,
        completedAt: true,
      },
    });
  } catch {
    throw new TaskWorkflowExecutionError("读取任务状态失败", "LIFECYCLE_TRANSITION_FAILED");
  }

  if (!task) {
    throw new TaskWorkflowTaskNotFoundError("未找到指定的分析任务");
  }

  // 2. Handle initial terminal states
  if (task.taskStatus === "COMPLETED") {
    const completedMatch = await checkCompletedTaskMatch(
      taskId,
      deterministicAnalysis
    );
    if (completedMatch) {
      return completedMatch;
    }
    throw new TaskWorkflowTerminalStateError("终态任务缺少有效工件且不可再修改");
  }

  if (task.taskStatus === "FAILED" || task.taskStatus === "CANCELLED") {
    throw new TaskWorkflowTerminalStateError("终态任务不可再新增或修改报告与 AI 工件");
  }

  // 3. Persist Deterministic Report first
  let reportArtifact;
  try {
    reportArtifact = await persistDeterministicReportForTask(
      taskId,
      deterministicAnalysis
    );
  } catch (err: unknown) {
    if (err instanceof ReportConflictError) {
      throw new TaskWorkflowConflictError("已存在的确定性报告工件不可修改或覆盖");
    }
    if (err instanceof ReportTaskNotFoundError) {
      throw new TaskWorkflowTaskNotFoundError("未找到指定的分析任务");
    }
    if (err instanceof TerminalTaskReportError) {
      // Check if a concurrent execution just completed the task
      const concurrentMatch = await checkCompletedTaskMatch(
        taskId,
        deterministicAnalysis
      );
      if (concurrentMatch) {
        return concurrentMatch;
      }
      throw new TaskWorkflowTerminalStateError("终态任务不可再新增或修改报告与 AI 工件");
    }
    throw new TaskWorkflowReportPersistError("确定性报告持久化失败");
  }

  // 4. Persist AI Analysis Artifact second (only after report succeeds)
  let aiArtifact;
  try {
    aiArtifact = await persistAiAnalysisForTask(taskId, options);
  } catch (err: unknown) {
    if (err instanceof AiAnalysisConflictError) {
      throw new TaskWorkflowConflictError("已存在的 AI 分析工件不可修改或覆盖");
    }
    if (err instanceof AiTaskNotFoundError) {
      throw new TaskWorkflowTaskNotFoundError("未找到指定的分析任务");
    }
    if (err instanceof TerminalTaskAiAnalysisError) {
      // Check if a concurrent execution just completed the task
      const concurrentMatch = await checkCompletedTaskMatch(
        taskId,
        deterministicAnalysis
      );
      if (concurrentMatch) {
        return concurrentMatch;
      }
      throw new TaskWorkflowTerminalStateError("终态任务不可再新增或修改 AI 分析工件");
    }
    throw new TaskWorkflowAiPersistError("AI 分析工件持久化失败");
  }

  // 5. Verify both artifacts via read services
  const verifyReport = await getDeterministicReportForTask(taskId);
  if (!verifyReport.success) {
    throw new TaskWorkflowVerificationError("确定性报告工件读取验证失败");
  }

  const verifyAi = await getAiAnalysisForTask(taskId);
  if (!verifyAi.success) {
    throw new TaskWorkflowVerificationError("AI 分析工件读取验证失败");
  }

  // 6. Complete task using task lifecycle rules and atomic conditional update
  let currentTask;
  try {
    currentTask = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskStatus: true,
        pipelineStage: true,
        progress: true,
        outcome: true,
        completedAt: true,
      },
    });
  } catch {
    throw new TaskWorkflowExecutionError("读取任务最新状态失败", "LIFECYCLE_TRANSITION_FAILED");
  }

  if (!currentTask) {
    throw new TaskWorkflowTaskNotFoundError("未找到指定的分析任务");
  }

  if (
    currentTask.taskStatus === "FAILED" ||
    currentTask.taskStatus === "CANCELLED"
  ) {
    throw new TaskWorkflowTerminalStateError("终态任务不可再新增或修改报告与 AI 工件");
  }

  const completionTime = currentTask.completedAt ?? new Date();

  // If task became COMPLETED concurrently, return idempotent result
  if (currentTask.taskStatus === "COMPLETED") {
    const completedMatch = await checkCompletedTaskMatch(
      taskId,
      deterministicAnalysis
    );
    if (completedMatch) {
      return completedMatch;
    }
    throw new TaskWorkflowTerminalStateError("终态任务缺少有效工件且不可再修改");
  }

  const currentLifecycle: TaskLifecycleState = {
    taskStatus: currentTask.taskStatus as TaskStatus,
    pipelineStage: currentTask.pipelineStage as PipelineStage,
    progress: currentTask.progress,
    outcome: currentTask.outcome as TaskOutcome,
    completedAt: currentTask.completedAt,
  };

  const patchCandidate: UpdateTaskDto = {
    taskStatus: "COMPLETED",
    pipelineStage: "REPORT",
    progress: 100,
    outcome: (currentTask.outcome === "NONE" ? "FULL" : currentTask.outcome) as TaskOutcome,
    completedAt: completionTime,
  };

  const lifecycleCheck = validateTaskLifecycleTransition(
    currentLifecycle,
    patchCandidate
  );
  if (!lifecycleCheck.valid) {
    throw new TaskWorkflowLifecycleError("任务生命周期校验未通过");
  }

  try {
    // Atomic conditional update: only update if task is STILL in a non-terminal state
    const updateResult = await prisma.analysisTask.updateMany({
      where: {
        id: taskId,
        taskStatus: {
          notIn: ["COMPLETED", "FAILED", "CANCELLED"],
        },
      },
      data: {
        taskStatus: "COMPLETED",
        pipelineStage: "REPORT",
        progress: 100,
        outcome: (currentTask.outcome === "NONE" ? "FULL" : currentTask.outcome) as TaskOutcome,
        completedAt: completionTime,
        currentStageMessage: "任务离线分析与报告生成完成",
      },
    });

    if (updateResult.count === 1) {
      return {
        taskId,
        deterministicReportArtifactId: reportArtifact.artifactId,
        aiAnalysisArtifactId: aiArtifact.artifactId,
        taskStatus: "COMPLETED" as TaskStatus,
        completedAt: completionTime.toISOString(),
      };
    }

    // If count === 0: the task was updated concurrently to terminal state or removed
    let reReadTask;
    try {
      reReadTask = await prisma.analysisTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          taskStatus: true,
          completedAt: true,
        },
      });
    } catch {
      throw new TaskWorkflowExecutionError("读取任务最新状态失败", "LIFECYCLE_TRANSITION_FAILED");
    }

    if (!reReadTask) {
      throw new TaskWorkflowTaskNotFoundError("未找到指定的分析任务");
    }

    if (reReadTask.taskStatus === "COMPLETED") {
      const completedMatch = await checkCompletedTaskMatch(
        taskId,
        deterministicAnalysis
      );
      if (completedMatch) {
        return completedMatch;
      }
      throw new TaskWorkflowTerminalStateError("终态任务缺少有效工件且不可再修改");
    }

    if (
      reReadTask.taskStatus === "FAILED" ||
      reReadTask.taskStatus === "CANCELLED"
    ) {
      throw new TaskWorkflowTerminalStateError("终态任务不可再新增或修改报告与 AI 工件");
    }

    throw new TaskWorkflowExecutionError("更新任务完成状态失败", "LIFECYCLE_TRANSITION_FAILED");
  } catch (err: unknown) {
    if (
      err instanceof TaskWorkflowTaskNotFoundError ||
      err instanceof TaskWorkflowTerminalStateError ||
      err instanceof TaskWorkflowConflictError ||
      err instanceof TaskWorkflowReportPersistError ||
      err instanceof TaskWorkflowAiPersistError ||
      err instanceof TaskWorkflowVerificationError ||
      err instanceof TaskWorkflowLifecycleError
    ) {
      throw err;
    }
    throw new TaskWorkflowExecutionError("更新任务完成状态失败", "LIFECYCLE_TRANSITION_FAILED");
  }
}

/**
 * Convenience wrapper for completing tasks with the offline MOCK AI provider.
 */
export async function completeTaskWithOfflineMockAi(
  taskId: string,
  deterministicAnalysis: DeterministicAnalysisResult
): Promise<TaskAiWorkflowResult> {
  return completeTaskWithAi(taskId, deterministicAnalysis, { provider: "MOCK" });
}

