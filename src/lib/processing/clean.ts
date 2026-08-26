/**
 * BiliProfile Analyzer — Step 2: Clean (Phase 5.2.1)
 *
 * Cleans and deduplicates normalized records.
 * Rules:
 * - Deduplicates on compound key (sourceType + sourceRecordId).
 * - Drops records missing sourceRecordId or with zero analyzable text (for AVAILABLE sources).
 * - Preserves PARTIAL/UNAVAILABLE status diagnostics for accurate pipeline reporting.
 */

import { NormalizedRecord, PipelineDiagnostics } from "@/types/processing";
import { recordDropReason, recordQualityWarning } from "./normalize";

export interface CleanStepResult {
  records: NormalizedRecord[];
  diagnostics: PipelineDiagnostics;
}

export function cleanRecords(
  normalizedRecords: NormalizedRecord[],
  diagnostics: PipelineDiagnostics
): CleanStepResult {
  const cleaned: NormalizedRecord[] = [];
  const seenKeys = new Set<string>();

  for (const record of normalizedRecords) {
    // 1. Validate sourceRecordId
    if (!record.sourceRecordId) {
      diagnostics.droppedInvalidCount++;
      recordDropReason(diagnostics, "MISSING_SOURCE_RECORD_ID", "缺少来源唯一标识 sourceRecordId");
      continue;
    }

    // 2. Deduplication check
    const dedupKey = `${record.sourceType}:${record.sourceRecordId}`;
    if (seenKeys.has(dedupKey)) {
      diagnostics.deduplicatedCount++;
      recordDropReason(diagnostics, "DUPLICATE_RECORD", "重复的来源记录已去重");
      continue;
    }
    seenKeys.add(dedupKey);

    // 3. Analyzable text check
    if (!record.hasAnalyzableText) {
      if (record.availability === "AVAILABLE") {
        diagnostics.droppedInvalidCount++;
        recordDropReason(
          diagnostics,
          "NO_ANALYZABLE_TEXT",
          "可用来源记录缺少标题、说明或标签等可分析文本"
        );
        continue;
      } else if (record.availability === "PARTIAL") {
        recordQualityWarning(
          diagnostics,
          "SOURCE_DATA_PARTIAL",
          "存在部分受限的数据源记录 (PARTIAL)"
        );
      } else if (record.availability === "UNAVAILABLE") {
        recordQualityWarning(
          diagnostics,
          "SOURCE_DATA_UNAVAILABLE",
          "存在不可用的数据源记录 (UNAVAILABLE)"
        );
      }
    }

    cleaned.push(record);
  }

  diagnostics.cleanedCount = cleaned.length;

  return { records: cleaned, diagnostics };
}
