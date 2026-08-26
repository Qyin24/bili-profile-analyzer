/**
 * BiliProfile Analyzer — Step 5: Statistical Analysis (Phase 5.2.1)
 *
 * Computes deterministic information entropy and diversity metrics.
 *
 * Rules:
 * - Metric definitions:
 *   - Shannon Entropy: H = -Σ (p_i * ln(p_i)) where p_i = topic.recordCount / sum(topic.recordCount)
 *   - Normalized Entropy: H_norm = H / ln(K) (where K is topic count, K > 1)
 * - Diversity Level Thresholds:
 *   - If total analyzed records < MIN_RECORDS_THRESHOLD (5): INSUFFICIENT_DATA
 *   - H_norm >= 0.70: HIGH (广泛涉猎，主题分布均匀)
 *   - 0.40 <= H_norm < 0.70: MEDIUM (偏好适中，聚焦于几个主要领域)
 *   - H_norm < 0.40: LOW (高度聚焦于少数核心主题)
 * - Zero sensitive demographic, psychological, or clinical interpretations.
 */

import { DiversityMetrics, DiversityLevel, TopicAggregateItem } from "@/types/processing";

export const MIN_RECORDS_THRESHOLD = 5;

export const DIVERSITY_THRESHOLDS = {
  HIGH_MIN: 0.7,
  MEDIUM_MIN: 0.4,
} as const;

export function computeStatisticalAnalysis(
  topicDistribution: TopicAggregateItem[],
  totalAnalyzedRecords: number
): DiversityMetrics {
  const topicCount = topicDistribution.length;

  if (topicCount === 0 || totalAnalyzedRecords === 0) {
    return {
      topicCount: 0,
      topTopicShare: 0,
      shannonEntropy: 0,
      normalizedEntropy: 0,
      diversityLevel: "INSUFFICIENT_DATA",
      isSufficientData: false,
      minimumRecordThreshold: MIN_RECORDS_THRESHOLD,
    };
  }

  // Calculate sum of topic record counts for relative proportion
  const totalTopicMatches = topicDistribution.reduce((acc, t) => acc + t.recordCount, 0);

  if (totalTopicMatches === 0) {
    return {
      topicCount: 0,
      topTopicShare: 0,
      shannonEntropy: 0,
      normalizedEntropy: 0,
      diversityLevel: "INSUFFICIENT_DATA",
      isSufficientData: false,
      minimumRecordThreshold: MIN_RECORDS_THRESHOLD,
    };
  }

  // Top topic share (consistent with topicDistribution[0].share)
  const topTopicShare = topicDistribution[0]?.share ?? 0;

  // Shannon Entropy: H = - Σ (p_i * ln(p_i))
  let shannonEntropy = 0;
  for (const topic of topicDistribution) {
    const p = topic.recordCount / totalTopicMatches;
    if (p > 0) {
      shannonEntropy -= p * Math.log(p);
    }
  }

  // Normalized Entropy: H / ln(K)
  let normalizedEntropy = 0;
  if (topicCount > 1) {
    const maxEntropy = Math.log(topicCount);
    if (maxEntropy > 0) {
      normalizedEntropy = Math.min(1.0, Math.max(0.0, shannonEntropy / maxEntropy));
    }
  }

  // Round values to 4 decimal places
  shannonEntropy = Number(shannonEntropy.toFixed(4));
  normalizedEntropy = Number(normalizedEntropy.toFixed(4));

  // Determine diversity level
  const isSufficientData = totalAnalyzedRecords >= MIN_RECORDS_THRESHOLD;
  let diversityLevel: DiversityLevel;

  if (!isSufficientData) {
    diversityLevel = "INSUFFICIENT_DATA";
  } else if (normalizedEntropy >= DIVERSITY_THRESHOLDS.HIGH_MIN) {
    diversityLevel = "HIGH";
  } else if (normalizedEntropy >= DIVERSITY_THRESHOLDS.MEDIUM_MIN) {
    diversityLevel = "MEDIUM";
  } else {
    diversityLevel = "LOW";
  }

  return {
    topicCount,
    topTopicShare,
    shannonEntropy,
    normalizedEntropy,
    diversityLevel,
    isSufficientData,
    minimumRecordThreshold: MIN_RECORDS_THRESHOLD,
  };
}
