/**
 * BiliProfile Analyzer — Step 3: Extract (Phase 5.2)
 *
 * Deterministic topic and keyword extraction from cleaned records.
 * Rules:
 * - Matches strictly against versioned TOPIC_TAXONOMY.
 * - Evidence tracking: records matchedTerm, matchType (TAG/KEYWORD), and source pointer.
 * - Unmatched records are marked isUnclassified (never guessed or forced into a topic).
 * - Zero LLM usage; zero sensitive personal inferences.
 */

import {
  NormalizedRecord,
  ExtractedRecord,
  TopicMatch,
  EvidenceRef,
  PipelineDiagnostics,
} from "@/types/processing";
import { TOPIC_TAXONOMY } from "./taxonomy";

export interface ExtractStepResult {
  records: ExtractedRecord[];
  diagnostics: PipelineDiagnostics;
}

export function extractTopics(
  cleanedRecords: NormalizedRecord[],
  diagnostics: PipelineDiagnostics
): ExtractStepResult {
  const extractedList: ExtractedRecord[] = [];
  let unclassifiedTotal = 0;

  for (const record of cleanedRecords) {
    const matchedCategoryIds = new Set<string>();
    const matches: TopicMatch[] = [];

    // 1. Tag Matching (exact match, case-insensitive)
    const lowerTags = record.tags.map((t) => t.toLowerCase());
    for (const tag of lowerTags) {
      for (const cat of TOPIC_TAXONOMY) {
        if (cat.tags.includes(tag) && !matchedCategoryIds.has(cat.id)) {
          matchedCategoryIds.add(cat.id);
          const evidenceRef: EvidenceRef = {
            sourceRecordId: record.sourceRecordId,
            sourceType: record.sourceType,
            sourceUrl: record.sourceUrl,
            matchType: "TAG",
            matchedTerm: tag,
            matchedTopicId: cat.id,
          };
          matches.push({
            topicId: cat.id,
            topicName: cat.name,
            evidenceRef,
          });
        }
      }
    }

    // 2. Keyword Matching in Title and Description (case-insensitive substring)
    const combinedText = `${record.title} ${record.description}`.toLowerCase();
    if (combinedText.trim().length > 0) {
      for (const cat of TOPIC_TAXONOMY) {
        if (!matchedCategoryIds.has(cat.id)) {
          for (const kw of cat.keywords) {
            if (combinedText.includes(kw)) {
              matchedCategoryIds.add(cat.id);
              const evidenceRef: EvidenceRef = {
                sourceRecordId: record.sourceRecordId,
                sourceType: record.sourceType,
                sourceUrl: record.sourceUrl,
                matchType: "KEYWORD",
                matchedTerm: kw,
                matchedTopicId: cat.id,
              };
              matches.push({
                topicId: cat.id,
                topicName: cat.name,
                evidenceRef,
              });
              break; // Matched this category, move to next category
            }
          }
        }
      }
    }

    const isUnclassified = matches.length === 0;
    if (isUnclassified) {
      unclassifiedTotal++;
    }

    extractedList.push({
      record,
      topicMatches: matches,
      isUnclassified,
    });
  }

  diagnostics.unclassifiedCount = unclassifiedTotal;

  return { records: extractedList, diagnostics };
}
