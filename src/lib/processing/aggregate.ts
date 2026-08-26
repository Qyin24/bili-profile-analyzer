/**
 * BiliProfile Analyzer — Step 4: Aggregate (Phase 5.2.1)
 *
 * Aggregates extracted topic matches, source coverage, and evidence references.
 * Rules:
 * - Statistical ratio: topicDistribution[].share uses totalTopicMatches (sum of recordCount across topics) as denominator.
 * - Sum of topicDistribution[].share equals 1.0 (within float precision <= 0.0001).
 * - Deterministic sorting: primary recordCount desc, secondary topicName asc.
 * - Zero division protection: returns safe 0 without NaN or Infinity.
 */

import {
  ExtractedRecord,
  TopicAggregateItem,
  EvidenceRef,
  SourceRecordType,
  PipelineDiagnostics,
} from "@/types/processing";
import { TOPIC_TAXONOMY } from "./taxonomy";

export interface AggregateStepResult {
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
  evidenceRefs: EvidenceRef[];
}

export function aggregateTopics(
  extractedRecords: ExtractedRecord[],
  diagnostics: PipelineDiagnostics
): AggregateStepResult {
  const totalAnalyzed = extractedRecords.filter((r) => !r.isUnclassified).length;
  const unclassifiedCount = diagnostics.unclassifiedCount;

  // Map categoryId -> aggregate container
  const topicMap = new Map<
    string,
    {
      topicId: string;
      topicName: string;
      recordCount: number;
      evidenceCount: number;
      evidenceRefs: EvidenceRef[];
    }
  >();

  // Pre-initialize map with all known taxonomy categories
  for (const cat of TOPIC_TAXONOMY) {
    topicMap.set(cat.id, {
      topicId: cat.id,
      topicName: cat.name,
      recordCount: 0,
      evidenceCount: 0,
      evidenceRefs: [],
    });
  }

  const allEvidenceRefs: EvidenceRef[] = [];
  const sourceTypeCounts: Record<SourceRecordType, number> = {
    PROFILE: 0,
    FOLLOW: 0,
    CONTENT: 0,
  };

  for (const item of extractedRecords) {
    sourceTypeCounts[item.record.sourceType] =
      (sourceTypeCounts[item.record.sourceType] ?? 0) + 1;

    for (const match of item.topicMatches) {
      const agg = topicMap.get(match.topicId);
      if (agg) {
        agg.recordCount++;
        agg.evidenceCount++;
        agg.evidenceRefs.push(match.evidenceRef);
        allEvidenceRefs.push(match.evidenceRef);
      }
    }
  }

  // Calculate sum of all topic matches (denominator for topic distribution share)
  let totalTopicMatches = 0;
  for (const [, agg] of topicMap) {
    totalTopicMatches += agg.recordCount;
  }

  // Build topicDistribution list
  const topicDistribution: TopicAggregateItem[] = [];

  for (const [, agg] of topicMap) {
    if (agg.recordCount > 0) {
      const share =
        totalTopicMatches > 0
          ? Number((agg.recordCount / totalTopicMatches).toFixed(6))
          : 0;
      topicDistribution.push({
        topicId: agg.topicId,
        topicName: agg.topicName,
        recordCount: agg.recordCount,
        share,
        evidenceCount: agg.evidenceCount,
        evidenceRefs: agg.evidenceRefs,
      });
    }
  }

  // Deterministic sorting: 1. recordCount DESC, 2. topicName ASC
  topicDistribution.sort((a, b) => {
    if (b.recordCount !== a.recordCount) {
      return b.recordCount - a.recordCount;
    }
    return a.topicName.localeCompare(b.topicName, "zh-CN");
  });

  // Top topics (e.g. top 5)
  const topTopics = topicDistribution.slice(0, 5).map((t) => ({
    topicId: t.topicId,
    topicName: t.topicName,
    share: t.share,
    recordCount: t.recordCount,
  }));

  // Source coverage calculation
  const totalRecords = extractedRecords.length;
  const sourceCoverage: {
    sourceType: SourceRecordType;
    recordCount: number;
    share: number;
  }[] = (["PROFILE", "FOLLOW", "CONTENT"] as SourceRecordType[]).map((st) => {
    const count = sourceTypeCounts[st] ?? 0;
    const share = totalRecords > 0 ? Number((count / totalRecords).toFixed(6)) : 0;
    return {
      sourceType: st,
      recordCount: count,
      share,
    };
  });

  return {
    topicDistribution,
    topTopics,
    sourceCoverage,
    recordCounts: {
      totalInput: diagnostics.inputCount,
      analyzed: totalAnalyzed,
      unclassified: unclassifiedCount,
    },
    evidenceRefs: allEvidenceRefs,
  };
}
