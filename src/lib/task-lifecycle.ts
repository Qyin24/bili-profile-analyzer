import { TaskStatus, PipelineStage, TaskOutcome } from "@/types/analysis";
import { UpdateTaskDto } from "@/types/task-api";

/**
 * Ordered pipeline stages index (0 to 8).
 * Ensures sequential monotonic progress without stage regression.
 */
export const PIPELINE_STAGE_ORDER: Record<PipelineStage, number> = {
  COLLECT: 0,
  NORMALIZE: 1,
  CLEAN: 2,
  EXTRACT: 3,
  AGGREGATE: 4,
  STATISTICAL_ANALYSIS: 5,
  AI_ANALYSIS: 6,
  SYNTHESIS: 7,
  REPORT: 8,
};

/**
 * Terminal statuses: Once a task enters these states, it cannot be modified by ordinary PATCH calls.
 */
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

/**
 * Allowed status transitions state machine.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  PENDING: ["PENDING", "RUNNING", "CANCELLED"],
  RUNNING: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export interface TaskLifecycleState {
  taskStatus: TaskStatus;
  pipelineStage: PipelineStage;
  progress: number;
  outcome: TaskOutcome;
  completedAt?: Date | string | null;
}

export interface TaskLifecycleValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
}

export class TaskLifecycleValidationError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TaskLifecycleValidationError";
    this.code = code;
  }
}

/**
 * Pure function to validate task lifecycle transitions and state invariants.
 *
 * Rules:
 * 1. Rejects empty patch requests (where all updateable fields are undefined).
 * 2. Terminal tasks (COMPLETED, FAILED, CANCELLED) cannot be updated.
 * 3. Status transitions must follow ALLOWED_STATUS_TRANSITIONS.
 * 4. Pipeline stages must not regress (PIPELINE_STAGE_ORDER).
 * 5. Progress percentage must not regress.
 * 6. PENDING state must have pipelineStage='COLLECT', progress=0, outcome='NONE'.
 * 7. COMPLETED state must have pipelineStage='REPORT', progress=100, outcome in ['FULL', 'PARTIAL'], and a valid non-null completedAt.
 */
export function validateTaskLifecycleTransition(
  current: TaskLifecycleState,
  patch: UpdateTaskDto
): TaskLifecycleValidationResult {
  // 1. Empty patch check: true empty is only when all update fields are strictly undefined
  const hasUpdateField =
    patch.taskStatus !== undefined ||
    patch.pipelineStage !== undefined ||
    patch.outcome !== undefined ||
    patch.progress !== undefined ||
    patch.currentStageMessage !== undefined ||
    patch.completedAt !== undefined ||
    patch.dataSourceRuns !== undefined;

  if (!hasUpdateField) {
    return {
      valid: false,
      code: "EMPTY_UPDATE",
      message: "更新请求体不能为空，至少需提供一项更新字段。",
    };
  }

  // 2. Terminal State Guard
  if (TERMINAL_TASK_STATUSES.includes(current.taskStatus)) {
    return {
      valid: false,
      code: "TERMINAL_STATE_IMMUTABLE",
      message: `任务已处于终态 [${current.taskStatus}]，不可再次更新状态、进度或数据源。`,
    };
  }

  // 3. Status Transition Validity
  const nextStatus: TaskStatus = patch.taskStatus ?? current.taskStatus;
  if (patch.taskStatus !== undefined && patch.taskStatus !== current.taskStatus) {
    const allowed = ALLOWED_STATUS_TRANSITIONS[current.taskStatus];
    if (!allowed || !allowed.includes(patch.taskStatus)) {
      return {
        valid: false,
        code: "INVALID_STATUS_TRANSITION",
        message: `不允许从状态 [${current.taskStatus}] 转换至 [${patch.taskStatus}]。`,
      };
    }
  }

  // Synthesize Next Candidate State
  const nextStage: PipelineStage = patch.pipelineStage ?? current.pipelineStage;
  const nextProgress: number = patch.progress ?? current.progress;
  const nextOutcome: TaskOutcome = patch.outcome ?? current.outcome;

  // 4. Stage Monotonicity (No Stage Regression)
  const currentStageIndex = PIPELINE_STAGE_ORDER[current.pipelineStage] ?? 0;
  const nextStageIndex = PIPELINE_STAGE_ORDER[nextStage] ?? 0;
  if (nextStageIndex < currentStageIndex) {
    return {
      valid: false,
      code: "STAGE_REGRESSION",
      message: `流水线阶段不可倒退：无法从 [${current.pipelineStage}] 回退至 [${nextStage}]。`,
    };
  }

  // 5. Progress Monotonicity (No Progress Regression)
  if (nextProgress < current.progress) {
    return {
      valid: false,
      code: "PROGRESS_REGRESSION",
      message: `任务进度不可倒退：无法从 ${current.progress}% 回退至 ${nextProgress}%。`,
    };
  }

  // 6. PENDING State Invariants
  if (nextStatus === "PENDING") {
    if (nextStage !== "COLLECT") {
      return {
        valid: false,
        code: "INVALID_PENDING_STAGE",
        message: "PENDING 状态的任务流水线阶段必须为 COLLECT。",
      };
    }
    if (nextProgress !== 0) {
      return {
        valid: false,
        code: "INVALID_PENDING_PROGRESS",
        message: "PENDING 状态的任务进度必须为 0%。",
      };
    }
    if (nextOutcome !== "NONE") {
      return {
        valid: false,
        code: "INVALID_PENDING_OUTCOME",
        message: "PENDING 状态的任务 outcome 必须为 NONE。",
      };
    }
  }

  // 7. COMPLETED State Invariants
  if (nextStatus === "COMPLETED") {
    if (nextStage !== "REPORT") {
      return {
        valid: false,
        code: "INCOMPLETE_STAGE_FOR_COMPLETION",
        message: `任务完成时 pipelineStage 必须为 REPORT，当前为 [${nextStage}]。`,
      };
    }
    if (nextProgress !== 100) {
      return {
        valid: false,
        code: "INCOMPLETE_PROGRESS_FOR_COMPLETION",
        message: `任务完成时 progress 必须为 100%，当前为 ${nextProgress}%。`,
      };
    }
    if (nextOutcome !== "FULL" && nextOutcome !== "PARTIAL") {
      return {
        valid: false,
        code: "INVALID_COMPLETED_OUTCOME",
        message: `任务完成时 outcome 必须为 FULL 或 PARTIAL，当前为 [${nextOutcome}]。`,
      };
    }

    // Check candidate completedAt
    const candidateCompletedAt =
      patch.completedAt !== undefined ? patch.completedAt : current.completedAt;

    if (candidateCompletedAt === null || candidateCompletedAt === undefined) {
      return {
        valid: false,
        code: "COMPLETED_REQUIRES_COMPLETED_AT",
        message: "任务完成时 completedAt 必须为有效日期时间，不能为 null 或空。",
      };
    }

    if (candidateCompletedAt instanceof Date) {
      if (isNaN(candidateCompletedAt.getTime())) {
        return {
          valid: false,
          code: "INVALID_COMPLETED_AT",
          message: "completedAt 必须为有效的 Date 对象。",
        };
      }
    } else if (typeof candidateCompletedAt === "string") {
      if (!candidateCompletedAt.trim()) {
        return {
          valid: false,
          code: "COMPLETED_REQUIRES_COMPLETED_AT",
          message: "任务完成时 completedAt 必须为有效日期时间，不能为 null 或空。",
        };
      }
      if (isNaN(new Date(candidateCompletedAt).getTime())) {
        return {
          valid: false,
          code: "INVALID_COMPLETED_AT",
          message: "completedAt 必须为合法的日期时间字符串。",
        };
      }
    } else {
      return {
        valid: false,
        code: "INVALID_COMPLETED_AT",
        message: "completedAt 格式无效。",
      };
    }
  }

  return { valid: true };
}
