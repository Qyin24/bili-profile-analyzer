/**
 * BiliProfile Analyzer — Pure Data Processing Pipeline Types (Phase 5.2 & Phase 5.2.2 & Phase 5.2.3)
 *
 * Defines contracts for offline deterministic processing:
 * Normalize -> Clean -> Extract -> Aggregate -> Statistical Analysis -> Report Input.
 *
 * Rules:
 * - Pure data structures only.
 * - Zero network, database, auth, or cookie concepts.
 * - Zero sensitive personality/demographic/diagnostic attributes.
 */

export type SourceRecordType = "PROFILE" | "CONTENT" | "FAVORITE" | "LIKE" | "FOLLOW";

export type RecordAvailability = "AVAILABLE" | "PARTIAL" | "PRIVATE" | "REQUIRES_AUTH" | "UNAVAILABLE";

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
  /** Original creation / publication timestamp */
  publishedAt?: string | Date | null;
  /** Interaction timestamp (e.g. favorite time, like time) */
  interactionAt?: string | Date | null;
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
  /** Extra metadata */
  metadata?: Record<string, unknown>;
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
  signalStrength?: "STRONG" | "MEDIUM" | "WEAK";
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
  publishedAt: string | null;
  interactionAt: string | null;
  sourceUrl: string | null;
  availability: RecordAvailability;
  hasAnalyzableText: boolean;
  metadata?: Record<string, unknown>;
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
  sourceBreakdown?: Record<SourceRecordType, number>;
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
  extractedRecords?: ExtractedRecord[];
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
  "CONTENT_ITEM",
  "PROFILE_ITEM",
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

export interface ContentItemTopicMatch {
  topicId: string;
  topicName: string;
  matchedTerm: string;
  matchType: EvidenceMatchType;
  signalStrength?: "STRONG" | "MEDIUM" | "WEAK";
}

export interface ContentItemEvidence {
  evidenceId: string;
  sourceRecordId: string;
  sourceType: SourceRecordType;
  title: string;
  description: string;
  tags: string[];
  authorName?: string | null;
  observedAt?: string | null;
  publishedAt?: string | null;
  interactionAt?: string | null;
  matchedTopics: ContentItemTopicMatch[];
  metadata?: Record<string, unknown>;
}

export interface BehaviorTopicMatrixItem {
  topicId: string;
  topicName: string;
  contentCount: number;
  favoriteCount: number;
  likeCount: number;
  followCount: number;
  totalInteractions: number;
  sourceCoverage: {
    hasContent: boolean;
    hasFavorite: boolean;
    hasLike: boolean;
    hasFollow: boolean;
    activeSourceCount: number;
  };
  timeSpan: {
    firstInteractionAt: string | null;
    lastInteractionAt: string | null;
    timeSpanDays: number;
    temporalCategory: "LONG_TERM_STABLE" | "RECENT_RISING" | "RECENT_ONLY" | "HISTORICAL" | "SPORADIC" | "INSUFFICIENT_TIME_DATA";
  };
  signalBreakdown: {
    strongCount: number;
    mediumCount: number;
    weakCount: number;
  };
  crossSourcePresence: {
    level: "HIGH_CROSS_SOURCE" | "MODERATE_CROSS_SOURCE" | "SINGLE_SOURCE" | "EPHEMERAL";
    description: string;
  };
}

export interface TemporalPatternItem {
  topicId: string;
  topicName: string;
  pattern: "LONG_TERM_STABLE" | "RECENT_RISING" | "RECENT_ONLY" | "HISTORICAL" | "SPORADIC" | "INSUFFICIENT_TIME_DATA";
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  timeSpanDays: number;
  summary: string;
}

export interface MultiSourceAvailabilitySummary {
  content: RecordAvailability;
  favorites: RecordAvailability;
  likes: RecordAvailability;
  follows: RecordAvailability;
  profile: RecordAvailability;
}

export interface ReportDiagnosticsSummary {
  totalInput: number;
  analyzedCount: number;
  unclassifiedCount: number;
  hasQualityWarnings: boolean;
  warningCodes: string[];
}

export interface SourceSamplingMetadata {
  sourceType: SourceRecordType;
  platformTotalCount: number | null;
  collectedCount: number;
  analyzedCount: number;
  samplingStrategy: "FULL_OBSERVATION" | "LATEST_WINDOW_SAMPLE" | "PAGINATED_SAMPLE" | "NOT_AVAILABLE";
  isComplete: boolean;
  timeWindowDescription: string;
  samplingWarning?: string;
}

export interface DeterministicReportInput {
  schemaVersion: typeof REPORT_INPUT_SCHEMA_VERSION;
  taxonomyVersion: string;
  observations: ReportObservation[];
  evidence: ReportEvidence[];
  contentItems?: ContentItemEvidence[];
  behaviorTopicMatrix?: BehaviorTopicMatrixItem[];
  temporalPatterns?: TemporalPatternItem[];
  sourceAvailability?: MultiSourceAvailabilitySummary;
  samplingMetadata?: SourceSamplingMetadata[];
  limitations: string[];
  diagnosticsSummary: ReportDiagnosticsSummary;
}

export interface ReportInputValidationResult {
  valid: boolean;
  errors: string[];
}

// =========================================================================
// Phase 5.2.3: Task-level Deterministic Report Storage & API Contracts
// =========================================================================

export interface TaskDeterministicReportResponse {
  taskId: string;
  artifactId: string;
  schemaVersion: string;
  taxonomyVersion: string;
  report: DeterministicReportInput;
  createdAt: string;
}

export type GetDeterministicReportResult =
  | {
      success: true;
      data: TaskDeterministicReportResponse;
    }
  | {
      success: false;
      error:
        | "TASK_NOT_FOUND"
        | "REPORT_NOT_FOUND"
        | "CORRUPTED_REPORT_DATA"
        | "INVALID_REPORT_DATA"
        | "VERSION_METADATA_MISMATCH";
      message: string;
    };

// =========================================================================
// Minimal BASIC_PROFILE Input Contract (Offline & Source-Auditable)
// =========================================================================

/**
 * Declarative provenance label distinguishing offline fixtures from future real connector inputs.
 * NOTE: "REAL_CONNECTOR" is a declarative format label and does NOT constitute proof of real data authentication in offline mode.
 */
export type BasicProfileProvenance = "LOCAL_FIXTURE" | "REAL_CONNECTOR";

/**
 * Minimal platform-agnostic public basic profile input contract.
 * Contains only normalized public presentation fields without raw platform-specific fields.
 */
export interface NormalizedBasicProfileInput {
  /** Record identifier scoped to the input batch (batch uniqueness verified at batch level) */
  recordId: string;
  /** Declarative provenance marker indicating source origin (LOCAL_FIXTURE or REAL_CONNECTOR) */
  provenance: BasicProfileProvenance;
  /** Public display name / nickname (optional if unverified or absent) */
  displayName?: string | null;
  /** Public bio / signature / description (optional if unverified or absent) */
  description?: string | null;
  /** Public topic or interest tags associated with profile */
  tags?: string[] | null;
  /** Public avatar reference or asset identifier (optional, non-sensitive) */
  avatarIdentifier?: string | null;
  /** Explicit timezone ISO 8601 timestamp (e.g. 2026-08-20T12:00:00Z or +08:00) when the profile record was observed */
  observedAt?: string | null;
  /** Record availability indicator */
  availability: RecordAvailability;
}

export interface BasicProfileInputValidationResult {
  valid: boolean;
  errors: string[];
}
