/**
 * BiliProfile Analyzer — Phase 6.0, 6.1 & 6.2: AI Analysis Contract, Provider & Storage Types
 *
 * Defines contracts for offline AI analysis layers:
 * DeterministicReportInput -> AI Analysis Provider -> AiAnalysisResult.
 *
 * Rules:
 * - AI layer can ONLY consume validated DeterministicReportInput (zero raw bodies, zero snapshots).
 * - Every finding MUST cite existing evidence IDs from the input.
 * - Factual, objective explanations only (zero MBTI/personality/sensitive attributes).
 * - Fully deterministic and JSON serializable.
 */

import { DeterministicReportInput } from "./processing";

export const AI_ANALYSIS_SCHEMA_VERSION = "ai-analysis-result/v1" as const;

export const VALID_AI_PROVIDERS = ["MOCK", "OPENAI_COMPATIBLE"] as const;
export type AiProviderType = (typeof VALID_AI_PROVIDERS)[number];

export interface OpenAiCompatibleConfig {
  apiBaseUrl: string;
  apiKey: string; // IN-MEMORY ONLY - NEVER PERSISTED
  model: string;
}

export const VALID_AI_FINDING_CATEGORIES = [
  "TOPIC_INTERPRETATION",
  "DIVERSITY_ASSESSMENT",
  "SAMPLE_RELIABILITY",
  "SOURCE_LIMITATION",
  "DATA_QUALITY",
] as const;

export type AiFindingCategory = (typeof VALID_AI_FINDING_CATEGORIES)[number];

export interface AiFinding {
  id: string;
  category: AiFindingCategory;
  statement: string;
  evidenceIds: string[];
}

export interface AiAnalysisResult {
  schemaVersion: typeof AI_ANALYSIS_SCHEMA_VERSION;
  provider: AiProviderType;
  summary: string;
  findings: AiFinding[];
  limitations: string[];
}

export interface AiValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AiAnalysisProvider {
  readonly id: AiProviderType;
  generate(reportInput: DeterministicReportInput): Promise<AiAnalysisResult>;
}

export interface AiAnalysisContext {
  reportInput: DeterministicReportInput;
}

// =========================================================================
// Phase 6.2: Task-level AI Analysis Storage & API Contracts
// =========================================================================

export interface TaskAiAnalysisResponse {
  taskId: string;
  artifactId: string;
  provider: AiProviderType;
  schemaVersion: string;
  reportSchemaVersion: string;
  taxonomyVersion: string;
  analysis: AiAnalysisResult;
  createdAt: string;
}

export type GetTaskAiAnalysisErrorCode =
  | "TASK_NOT_FOUND"
  | "SOURCE_REPORT_NOT_FOUND"
  | "SOURCE_REPORT_INVALID"
  | "AI_ANALYSIS_NOT_FOUND"
  | "CORRUPTED_AI_ANALYSIS_DATA"
  | "INVALID_AI_ANALYSIS_DATA"
  | "VERSION_METADATA_MISMATCH"
  | "INTERNAL_SERVER_ERROR";

export type GetTaskAiAnalysisResult =
  | {
      success: true;
      data: TaskAiAnalysisResponse;
    }
  | {
      success: false;
      error: GetTaskAiAnalysisErrorCode;
      message: string;
    };
