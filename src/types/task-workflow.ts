/**
 * BiliProfile Analyzer — Phase 6.3 & 6.3.1: Task-level Offline AI Workflow & Completion Types
 *
 * Defines contracts for orchestrating the offline analysis completion flow:
 * Deterministic Report Storage -> Mock AI Analysis Storage -> Task Completion.
 */

import { TaskStatus } from "./analysis";

export interface TaskAiWorkflowResult {
  taskId: string;
  deterministicReportArtifactId: string;
  aiAnalysisArtifactId: string;
  taskStatus: TaskStatus;
  completedAt: string;
}

export type TaskAiWorkflowErrorCode =
  | "TASK_NOT_FOUND"
  | "TERMINAL_STATE_ERROR"
  | "REPORT_PERSISTENCE_FAILED"
  | "AI_ANALYSIS_PERSISTENCE_FAILED"
  | "ARTIFACT_VERIFICATION_FAILED"
  | "LIFECYCLE_TRANSITION_FAILED"
  | "CONFLICT_ERROR";
