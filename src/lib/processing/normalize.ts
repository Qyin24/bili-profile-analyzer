/**
 * BiliProfile Analyzer — Step 1: Normalize (Phase 5.2.1)
 *
 * Normalizes raw PublicSourceRecord entries into standard NormalizedRecord structures.
 * Tracks diagnostics without throwing global exceptions and without silent fallbacks.
 */

import {
  PublicSourceRecord,
  NormalizedRecord,
  PipelineDiagnostics,
  RecordAvailability,
  SourceRecordType,
} from "@/types/processing";

export interface NormalizeStepResult {
  records: NormalizedRecord[];
  diagnostics: PipelineDiagnostics;
}

export const VALID_SOURCE_TYPES: readonly SourceRecordType[] = [
  "PROFILE",
  "CONTENT",
  "FAVORITE",
  "LIKE",
  "FOLLOW",
] as const;

export const VALID_AVAILABILITIES: readonly RecordAvailability[] = [
  "AVAILABLE",
  "PARTIAL",
  "PRIVATE",
  "REQUIRES_AUTH",
  "UNAVAILABLE",
] as const;

export function createInitialDiagnostics(): PipelineDiagnostics {
  return {
    inputCount: 0,
    normalizedCount: 0,
    cleanedCount: 0,
    droppedInvalidCount: 0,
    deduplicatedCount: 0,
    unclassifiedCount: 0,
    sourceTypeStats: {
      PROFILE: { total: 0, available: 0, partial: 0, unavailable: 0 },
      CONTENT: { total: 0, available: 0, partial: 0, unavailable: 0 },
      FAVORITE: { total: 0, available: 0, partial: 0, unavailable: 0 },
      LIKE: { total: 0, available: 0, partial: 0, unavailable: 0 },
      FOLLOW: { total: 0, available: 0, partial: 0, unavailable: 0 },
    },
    dropReasons: [],
    qualityWarnings: [],
  };
}

export function recordDropReason(
  diagnostics: PipelineDiagnostics,
  code: string,
  message: string,
  count: number = 1
): void {
  const existing = diagnostics.dropReasons.find((r) => r.code === code);
  if (existing) {
    existing.count += count;
  } else {
    diagnostics.dropReasons.push({ code, message, count });
  }
}

export function recordQualityWarning(
  diagnostics: PipelineDiagnostics,
  code: string,
  message: string
): void {
  const existing = diagnostics.qualityWarnings.find((w) => w.code === code);
  if (!existing) {
    diagnostics.qualityWarnings.push({ code, message });
  }
}

export function normalizeRecords(
  rawRecords: PublicSourceRecord[],
  initialDiagnostics?: PipelineDiagnostics
): NormalizeStepResult {
  const diagnostics = initialDiagnostics ?? createInitialDiagnostics();
  diagnostics.inputCount = Array.isArray(rawRecords) ? rawRecords.length : 0;

  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    return { records: [], diagnostics };
  }

  const normalizedList: NormalizedRecord[] = [];

  for (const raw of rawRecords) {
    if (!raw || typeof raw !== "object") {
      diagnostics.droppedInvalidCount++;
      recordDropReason(diagnostics, "NON_OBJECT_RECORD", "记录非有效对象格式");
      continue;
    }

    // 1. Strict sourceType validation (no silent fallback)
    if (!raw.sourceType || !VALID_SOURCE_TYPES.includes(raw.sourceType as SourceRecordType)) {
      diagnostics.droppedInvalidCount++;
      recordDropReason(
        diagnostics,
        "INVALID_SOURCE_TYPE",
        `缺少有效来源类型或 sourceType 非法: ${String(raw.sourceType)}`
      );
      continue;
    }
    const sourceType: SourceRecordType = raw.sourceType as SourceRecordType;

    // 2. Strict availability validation (defaults to AVAILABLE if omitted, rejects if explicitly invalid)
    let availability: RecordAvailability = "AVAILABLE";
    if (raw.availability !== undefined && raw.availability !== null) {
      if (!VALID_AVAILABILITIES.includes(raw.availability as RecordAvailability)) {
        diagnostics.droppedInvalidCount++;
        recordDropReason(
          diagnostics,
          "INVALID_AVAILABILITY",
          `来源可用性 availability 字段值非法: ${String(raw.availability)}`
        );
        continue;
      }
      availability = raw.availability as RecordAvailability;
    }

    // Track source stats
    const stats = diagnostics.sourceTypeStats[sourceType];
    stats.total++;
    if (availability === "AVAILABLE") stats.available++;
    else if (availability === "PARTIAL") {
      stats.partial++;
      recordQualityWarning(
        diagnostics,
        "SOURCE_DATA_PARTIAL",
        "存在部分受限的数据源记录 (PARTIAL)"
      );
    } else if (availability === "UNAVAILABLE") {
      stats.unavailable++;
      recordQualityWarning(
        diagnostics,
        "SOURCE_DATA_UNAVAILABLE",
        "存在不可用的数据源记录 (UNAVAILABLE)"
      );
    }

    const sourceRecordId =
      typeof raw.sourceRecordId === "string" ? raw.sourceRecordId.trim() : "";

    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    const authorName = typeof raw.authorName === "string" ? raw.authorName.trim() : "";
    const sourceUrl =
      typeof raw.sourceUrl === "string" && raw.sourceUrl.trim() ? raw.sourceUrl.trim() : null;

    // Standardize tags: trim, remove empty, deduplicate preserving order
    const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
    const seenTags = new Set<string>();
    const standardizedTags: string[] = [];

    for (const t of rawTags) {
      if (typeof t === "string") {
        const trimmed = t.trim();
        if (trimmed.length > 0) {
          const lower = trimmed.toLowerCase();
          if (!seenTags.has(lower)) {
            seenTags.add(lower);
            standardizedTags.push(trimmed);
          }
        }
      }
    }

    // Standardize observedAt
    let observedAt: string | null = null;
    if (raw.observedAt !== undefined && raw.observedAt !== null) {
      const d = raw.observedAt instanceof Date ? raw.observedAt : new Date(raw.observedAt);
      if (!isNaN(d.getTime())) {
        observedAt = d.toISOString();
      } else {
        recordQualityWarning(
          diagnostics,
          "INVALID_OBSERVED_AT",
          "部分记录的时间格式非法，已归一化为 null"
        );
      }
    }

    // Standardize publishedAt
    let publishedAt: string | null = null;
    if (raw.publishedAt !== undefined && raw.publishedAt !== null) {
      const d = raw.publishedAt instanceof Date ? raw.publishedAt : new Date(raw.publishedAt);
      if (!isNaN(d.getTime())) {
        publishedAt = d.toISOString();
      }
    }

    // Standardize interactionAt
    let interactionAt: string | null = null;
    if (raw.interactionAt !== undefined && raw.interactionAt !== null) {
      const d = raw.interactionAt instanceof Date ? raw.interactionAt : new Date(raw.interactionAt);
      if (!isNaN(d.getTime())) {
        interactionAt = d.toISOString();
      }
    }

    const hasAnalyzableText =
      title.length > 0 || description.length > 0 || standardizedTags.length > 0;

    const recordId = `${sourceType}:${sourceRecordId || "anon"}`;

    normalizedList.push({
      recordId,
      sourceRecordId,
      sourceType,
      title,
      description,
      tags: standardizedTags,
      authorName,
      observedAt,
      publishedAt,
      interactionAt,
      sourceUrl,
      availability,
      hasAnalyzableText,
      metadata: raw.metadata,
    });
  }

  diagnostics.normalizedCount = normalizedList.length;

  return { records: normalizedList, diagnostics };
}
