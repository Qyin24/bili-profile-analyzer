import {
  TaskStatus,
  PipelineStage,
  TaskOutcome,
  DataSourceRunStatus,
} from "./analysis";

export const VALID_TASK_STATUSES: TaskStatus[] = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export const VALID_PIPELINE_STAGES: PipelineStage[] = [
  "COLLECT",
  "NORMALIZE",
  "CLEAN",
  "EXTRACT",
  "AGGREGATE",
  "STATISTICAL_ANALYSIS",
  "AI_ANALYSIS",
  "SYNTHESIS",
  "REPORT",
];

export const VALID_TASK_OUTCOMES: TaskOutcome[] = ["FULL", "PARTIAL", "NONE"];

export const VALID_DATA_SOURCE_STATUSES: DataSourceRunStatus[] = [
  "SUCCEEDED",
  "SKIPPED_UNAVAILABLE",
  "RATE_LIMITED",
  "FAILED",
];

export interface CreateTaskDto {
  platformUid: string;
  displayName?: string;
  selfProvidedConsentConfirmed?: boolean;
}

export interface UpdateDataSourceRunDto {
  sourceName: string;
  status: DataSourceRunStatus;
  recordsCount?: number;
  message?: string | null;
}

export interface UpdateTaskDto {
  taskStatus?: TaskStatus;
  pipelineStage?: PipelineStage;
  outcome?: TaskOutcome;
  progress?: number;
  currentStageMessage?: string;
  completedAt?: string | Date | null;
  dataSourceRuns?: UpdateDataSourceRunDto[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Phase 5.0.2 Minimized Task Summary Projection (Strictly desensitized output)
export interface TaskSummaryResponse {
  id: string;
  targetId: string;
  taskStatus: TaskStatus;
  pipelineStage: PipelineStage;
  outcome: TaskOutcome;
  progress: number;
  currentStageMessage: string;
  needsRegeneration: boolean;
  hasSelfProvidedSnapshot: boolean;
  selfProvidedFieldsCount: number;
  snapshotCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  target?: {
    id: string;
    platform: string;
    platformUid: string;
    displayName: string | null;
  };
  dataSourceRuns: {
    id: string;
    sourceName: string;
    status: DataSourceRunStatus;
    recordsCount: number;
    message: string | null;
  }[];
}
