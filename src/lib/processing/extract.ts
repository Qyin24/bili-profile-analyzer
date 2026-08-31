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

    // 1. Tag Matching (exact match, case-insensitive) -> STRONG signal
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
            signalStrength: "STRONG",
          };
          matches.push({
            topicId: cat.id,
            topicName: cat.name,
            evidenceRef,
          });
        }
      }
    }

    // 2. Title Matching (case-insensitive) -> STRONG signal
    const titleLower = (record.title || "").toLowerCase();
    if (titleLower.trim().length > 0) {
      for (const cat of TOPIC_TAXONOMY) {
        if (!matchedCategoryIds.has(cat.id)) {
          for (const kw of cat.keywords) {
            const isMatched = /^[a-z0-9]{1,3}$/.test(kw)
              ? new RegExp(`(?:^|[^a-z0-9])${kw}(?:$|[^a-z0-9])`, "i").test(titleLower)
              : titleLower.includes(kw);

            if (isMatched) {
              matchedCategoryIds.add(cat.id);
              const evidenceRef: EvidenceRef = {
                sourceRecordId: record.sourceRecordId,
                sourceType: record.sourceType,
                sourceUrl: record.sourceUrl,
                matchType: "TITLE",
                matchedTerm: kw,
                matchedTopicId: cat.id,
                signalStrength: "STRONG",
              };
              matches.push({
                topicId: cat.id,
                topicName: cat.name,
                evidenceRef,
              });
              break;
            }
          }
        }
      }
    }

    // 3. Description Matching -> MEDIUM (prose) or WEAK (link/casual mention) signal
    const descLower = (record.description || "").toLowerCase();
    if (descLower.trim().length > 0) {
      for (const cat of TOPIC_TAXONOMY) {
        if (!matchedCategoryIds.has(cat.id)) {
          for (const kw of cat.keywords) {
            const isMatched = /^[a-z0-9]{1,3}$/.test(kw)
              ? new RegExp(`(?:^|[^a-z0-9])${kw}(?:$|[^a-z0-9])`, "i").test(descLower)
              : descLower.includes(kw);

            if (isMatched) {
              matchedCategoryIds.add(cat.id);
              // Determine if mention is within a URL or external link (WEAK) or direct prose (MEDIUM)
              const isUrlContext =
                descLower.includes(`http://${kw}`) ||
                descLower.includes(`https://${kw}`) ||
                descLower.includes(`${kw}.com`) ||
                descLower.includes(`steamcommunity`) ||
                descLower.includes(`sharedfiles`);

              const signalStrength = isUrlContext ? "WEAK" : "MEDIUM";

              const evidenceRef: EvidenceRef = {
                sourceRecordId: record.sourceRecordId,
                sourceType: record.sourceType,
                sourceUrl: record.sourceUrl,
                matchType: "DESCRIPTION",
                matchedTerm: kw,
                matchedTopicId: cat.id,
                signalStrength,
              };
              matches.push({
                topicId: cat.id,
                topicName: cat.name,
                evidenceRef,
              });
              break;
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
