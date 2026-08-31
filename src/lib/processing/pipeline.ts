/**
 * BiliProfile Analyzer — Deterministic Processing Pipeline Orchestrator (Phase 5.2 & Phase 5.2.2)
 *
 * Provides the unified offline data processing pipeline entrypoint:
 * Normalize -> Clean -> Extract -> Aggregate -> Statistical Analysis -> Report Input.
 *
 * Guarantees:
 * - Deterministic: identical input yields identical output.
 * - JSON serializable output.
 * - Zero network requests, zero database mutations, zero LLM calls.
 */

import {
  PublicSourceRecord,
  DeterministicAnalysisResult,
} from "@/types/processing";
import { normalizeRecords } from "./normalize";
import { cleanRecords } from "./clean";
import { extractTopics } from "./extract";
import { aggregateTopics } from "./aggregate";
import { computeStatisticalAnalysis } from "./statistical-analysis";
import { TAXONOMY_VERSION } from "./taxonomy";

export { buildDeterministicReportInput, validateDeterministicReportInput } from "./report-input";
export {
  validateBasicProfileInputContract,
  validateBasicProfileInputBatch,
  createLocalFixtureBasicProfileInput,
  basicProfileInputToPublicSourceRecord,
} from "./basic-profile-input-contract";

export function runDeterministicAnalysis(
  rawRecords: PublicSourceRecord[]
): DeterministicAnalysisResult {
  // Step 1: Normalize
  const { records: normalizedRecords, diagnostics } = normalizeRecords(rawRecords);

  // Step 2: Clean
  const { records: cleanedRecords } = cleanRecords(normalizedRecords, diagnostics);

  // Step 3: Extract
  const { records: extractedRecords } = extractTopics(cleanedRecords, diagnostics);

  // Step 4: Aggregate
  const aggregates = aggregateTopics(extractedRecords, diagnostics);

  // Step 5: Statistical Analysis
  const diversityMetrics = computeStatisticalAnalysis(
    aggregates.topicDistribution,
    aggregates.recordCounts.analyzed
  );

  return {
    topicDistribution: aggregates.topicDistribution,
    topTopics: aggregates.topTopics,
    sourceCoverage: aggregates.sourceCoverage,
    recordCounts: aggregates.recordCounts,
    diversityMetrics,
    evidenceRefs: aggregates.evidenceRefs,
    extractedRecords,
    diagnostics,
    taxonomyVersion: TAXONOMY_VERSION,
  };
}
