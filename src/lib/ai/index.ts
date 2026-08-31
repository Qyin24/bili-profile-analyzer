/**
 * BiliProfile Analyzer — Phase 6.0, 6.1 & 6.2: AI Module Entrypoint
 */

export * from "@/types/ai-analysis";
export { validateAiAnalysisResult } from "./validator";
export { generateMockAiAnalysis, mockAiProvider } from "./mock-provider";
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
  persistMockAiAnalysisForTask,
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
