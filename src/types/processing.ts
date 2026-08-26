/**
 * BiliProfile Analyzer — Pure Data Processing Pipeline Types (Phase 5.2 & Phase 5.2.2)
 *
 * Defines contracts for offline deterministic processing:
 * Normalize -> Clean -> Extract -> Aggregate -> Statistical Analysis -> Report Input.
 *
 * Rules:
 * - Pure data structures only.
 * - Zero network, database, auth, or cookie concepts.
 * - Zero sensitive personality/demographic/diagnostic attributes.
 */

export type SourceRecordType = "PROFILE" | "FOLLOW" | "CONTENT";

export type RecordAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

export type EvidenceMatchType = "TAG" | "KEYWORD" | "TITLE" | "DESCRIPTION";

export type DiversityLevel = "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA";

/**
 * Public source record input (controlled mock/sample format for offline pipeline).
 */
export interface PublicSourceRecord {
  /** Source-scoped unique record identifier */
  sourceRecordId: string;
  /** Type of source record */
  sourceType: SourceRecordType;
  /** Observation timestamp */
  observedAt?: string | Date | null;
  /** Optional public title */
  title?: string | null;
  /** Optional public description/bio/summary */
  description?: string | null;
  /** Public category or content tags */
  tags?: string[] | null;
  /** Public author / channel / uploader display name */
  authorName?: string | null;
  /** Public reference URL (optional) */
  sourceUrl?: string | null;
  /** Source availability flag */
  availability?: RecordAvailability;
}

/**
 * Traceable evidence pointer referencing a source record match without copying full text bodies.
 */
export interface EvidenceRef {
  sourceRecordId: string;
  sourceType: SourceRecordType;
  sourceUrl?: string | null;
  matchType: EvidenceMatchType;
  matchedTerm: string;
  matchedTopicId: string;
}

/**
 * Normalized intermediate representation of a public record.
 */
export interface NormalizedRecord {
  recordId: string;
  sourceRecordId: string;
  sourceType: SourceRecordType;
  title: string;
  description: string;
  tags: string[];
  authorName: string;
  observedAt: string | null;
  sourceUrl: string | null;
  availability: RecordAvailability;
  hasAnalyzableText: boolean;
}

/**
 * Single topic match result for a record.
 */
export interface TopicMatch {
  topicId: string;
  topicName: string;
  evidenceRef: EvidenceRef;
}

/**
 * Extracted record with topic associations.
 */
export interface ExtractedRecord {
  record: NormalizedRecord;
  topicMatches: TopicMatch[];
  isUnclassified: boolean;
}

/**
 * Aggregated statistics for a single taxonomy topic.
 */
export interface TopicAggregateItem {
  topicId: string;
  topicName: string;
  recordCount: number;
  share: number; // 0.0 to 1.0
  evidenceCount: number;
  evidenceRefs: EvidenceRef[];
}

/**
 * Diagnostic tracking of data quality, drop counts, and source status across the pipeline.
 */
export interface PipelineDiagnostics {
  inputCount: number;
  normalizedCount: number;
  cleanedCount: number;
  droppedInvalidCount: number;
  deduplicatedCount: number;
  unclassifiedCount: number;
  sourceTypeStats: Record<
    SourceRecordType,
    {
      total: number;
      available: number;
      partial: number;
      unavailable: number;
    }
  >;
  dropReasons: {
    code: string;
    message: string;
    count: number;
  }[];
  qualityWarnings: {
    code: string;
    message: string;
  }[];
}

/**
 * Statistical diversity and distribution metrics.
 */
export interface DiversityMetrics {
  topicCount: number;
  topTopicShare: number;
  shannonEntropy: number;
  normalizedEntropy: number; // 0.0 to 1.0
  diversityLevel: DiversityLevel;
  isSufficientData: boolean;
  minimumRecordThreshold: number;
}

/**
 * Complete deterministic analysis output contract.
 */
export interface DeterministicAnalysisResult {
  topicDistribution: TopicAggregateItem[];
  topTopics: {
    topicId: string;
    topicName: string;
    share: number;
    recordCount: number;
  }[];
  sourceCoverage: {
    sourceType: SourceRecordType;
    recordCount: number;
    share: number;
  }[];
  recordCounts: {
    totalInput: number;
    analyzed: number;
    unclassified: number;
  };
  diversityMetrics: DiversityMetrics;
  evidenceRefs: EvidenceRef[];
  diagnostics: PipelineDiagnostics;
  taxonomyVersion: string;
}

// =========================================================================
// Phase 5.2.2: Deterministic Report Input & Evidence Package Contracts
// =========================================================================

export const REPORT_INPUT_SCHEMA_VERSION = "deterministic-report-input/v1" as const;

export const VALID_OBSERVATION_CATEGORIES = [
  "TOPIC_DISTRIBUTION",
  "TOP_TOPIC",
  "DIVERSITY",
  "SAMPLE_SIZE",
  "SOURCE_LIMITATION",
  "DATA_QUALITY",
] as const;

export type ObservationCategory = (typeof VALID_OBSERVATION_CATEGORIES)[number];

export interface ReportObservation {
  id: string;
  category: ObservationCategory;
  statement: string;
  evidenceIds: string[];
  scopeNote?: string;
}

export const VALID_EVIDENCE_TYPES = [
  "METRIC",
  "TOPIC_SHARE",
  "SOURCE_STATUS",
  "QUALITY_WARNING",
  "SAMPLE_COUNT",
] as const;

export type EvidenceType = (typeof VALID_EVIDENCE_TYPES)[number];

export interface ReportEvidence {
  id: string;
  type: EvidenceType;
  label: string;
  value: number | string | boolean;
  unit?: string;
  sourceKey?: string;
}

export interface ReportDiagnosticsSummary {
  totalInput: number;
  analyzedCount: number;
  unclassifiedCount: number;
  hasQualityWarnings: boolean;
  warningCodes: string[];
}

export interface DeterministicReportInput {
  schemaVersion: typeof REPORT_INPUT_SCHEMA_VERSION;
  taxonomyVersion: string;
  observations: ReportObservation[];
  evidence: ReportEvidence[];
  limitations: string[];
  diagnosticsSummary: ReportDiagnosticsSummary;
}

export interface ReportInputValidationResult {
  valid: boolean;
  errors: string[];
}
