/**
 * BiliProfile Analyzer — Phase 6.0, 6.1 & 6.2: AI Module Entrypoint
 */

export * from "@/types/ai-analysis";
export { validateAiAnalysisResult } from "./validator";
export { generateDeterministicAiAnalysis, deterministicAiProvider } from "./deterministic-provider";
export { getAiProvider, generateAiAnalysis } from "./provider-registry";
export {
  normalizeOpenAiBaseUrl,
  validateOpenAiConfig,
  generateOpenAiAnalysis,
  createOpenAiCompatibleProvider,
  OpenAiProviderError,
} from "./openai-provider";
export {
  persistAiAnalysisForTask,
  persistDeterministicAiAnalysisForTask,
  persistAiDegradedArtifactForTask,
  DESENSITIZED_AI_UNAVAILABLE_SUMMARY,
  DESENSITIZED_AI_UNAVAILABLE_LIMITATION,
  getAiAnalysisForTask,
  TaskNotFoundError,
  TerminalTaskAiAnalysisError,
  SourceReportNotFoundError,
  SourceReportInvalidError,
  AiAnalysisValidationError,
  AiAnalysisConflictError,
  AiAnalysisPersistenceError,
} from "./ai-analysis-artifact-service";
