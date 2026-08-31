/**
 * BiliProfile Analyzer — Phase 6.1: AI Provider Registry & Unified Entrypoint
 *
 * Implements a fail-closed registry where MOCK is currently the sole registered provider.
 * Any unknown, unsupported, or future placeholder provider (GEMINI, OPENAI, etc.) MUST
 * fail explicitly with a controlled error message. Zero fallback, zero network.
 *
 * Guarantees:
 * - Fail-closed: Never silently falls back to MOCK when an unsupported provider is requested.
 * - Sanitized errors: Throws fixed, non-leaking error messages without echoing provider names or inputs.
 * - Input/Output verification: Pre-validates DeterministicReportInput and post-validates AiAnalysisResult.
 * - Pure local execution: Zero fetch, zero database queries, zero credentials.
 */

import {
  AiAnalysisProvider,
  AiAnalysisResult,
  OpenAiCompatibleConfig,
} from "@/types/ai-analysis";
import { DeterministicReportInput } from "@/types/processing";
import { validateDeterministicReportInput } from "@/lib/processing/pipeline";
import { mockAiProvider } from "./mock-provider";
import { createOpenAiCompatibleProvider } from "./openai-provider";
import { validateAiAnalysisResult } from "./validator";

export interface GenerateAiAnalysisOptions {
  openAiConfig?: OpenAiCompatibleConfig;
  customFetch?: typeof fetch;
  allowPrivateIps?: boolean;
}

const REGISTERED_PROVIDERS: Record<string, AiAnalysisProvider> = {
  MOCK: mockAiProvider,
};

/**
 * Resolves an AI analysis provider by ID in a fail-closed manner.
 * Defaults to MOCK only when providerId is omitted (undefined).
 */
export function getAiProvider(
  providerId?: unknown,
  options?: GenerateAiAnalysisOptions
): AiAnalysisProvider {
  // Default to MOCK when omitted
  if (providerId === undefined) {
    return mockAiProvider;
  }

  // Non-string or empty strings are rejected with fixed controlled error
  if (typeof providerId !== "string" || !providerId.trim()) {
    throw new Error("Invalid AI provider");
  }

  const trimmedId = providerId.trim();

  if (trimmedId === "OPENAI_COMPATIBLE") {
    if (!options?.openAiConfig) {
      throw new Error("Missing OpenAI configuration");
    }
    return createOpenAiCompatibleProvider(
      options.openAiConfig,
      options.customFetch,
      { allowPrivateIps: options.allowPrivateIps }
    );
  }

  const provider = REGISTERED_PROVIDERS[trimmedId];
  if (!provider) {
    // Unsupported / unknown / future placeholder providers fail explicitly
    throw new Error("Unsupported AI provider");
  }

  return provider;
}

/**
 * Unified entry point for executing AI analysis on a DeterministicReportInput.
 */
export async function generateAiAnalysis(
  reportInput: DeterministicReportInput,
  providerId?: unknown,
  options?: GenerateAiAnalysisOptions
): Promise<AiAnalysisResult> {
  // 1. Pre-execution contract validation on input
  const inputValidation = validateDeterministicReportInput(reportInput);
  if (!inputValidation.valid) {
    throw new Error("DeterministicReportInput validation failed");
  }

  // 2. Resolve provider (fail-closed, throws on invalid/unsupported)
  const provider = getAiProvider(providerId, options);

  // 3. Execute analysis
  const result = await provider.generate(reportInput);

  // 4. Post-execution strict contract verification on output
  const outputValidation = validateAiAnalysisResult(result, reportInput);
  if (!outputValidation.valid) {
    throw new Error("Generated AI Analysis failed validation");
  }

  return result;
}
