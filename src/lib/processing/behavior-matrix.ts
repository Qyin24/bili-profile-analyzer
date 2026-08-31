/**
 * BiliProfile Analyzer — Behavior-Topic Cross Validation & Temporal Analysis Engine
 *
 * Computes multi-source behavioral matrix and temporal stability metrics
 * across CONTENT, FAVORITE, LIKE, and FOLLOW dimensions.
 *
 * Strictly adheres to:
 * 1. Zero black-box personality or MBTI scores.
 * 2. Transparent multi-source coverage and time span metrics.
 * 3. Objective categorization of behavior patterns and temporal stability.
 */

import {
  ExtractedRecord,
  BehaviorTopicMatrixItem,
  TemporalPatternItem,
  SourceRecordType,
  MultiSourceAvailabilitySummary,
  SourceSamplingMetadata,
  RecordAvailability,
} from "@/types/processing";
import { TOPIC_TAXONOMY } from "./taxonomy";

export interface BehaviorAnalysisResult {
  matrix: BehaviorTopicMatrixItem[];
  temporalPatterns: TemporalPatternItem[];
  sourceAvailability: MultiSourceAvailabilitySummary;
  samplingMetadata: SourceSamplingMetadata[];
}

export function computeBehaviorTopicMatrix(
  extractedRecords: ExtractedRecord[],
  sourceStats?: Record<SourceRecordType, { total: number; available: number; partial: number; unavailable: number }>
): BehaviorAnalysisResult {
  const matrix: BehaviorTopicMatrixItem[] = [];
  const temporalPatterns: TemporalPatternItem[] = [];

  const nowMs = Date.now();

  for (const cat of TOPIC_TAXONOMY) {
    const matchingRecords = extractedRecords.filter((er) =>
      er.topicMatches.some((tm) => tm.topicId === cat.id)
    );

    if (matchingRecords.length === 0) continue;

    let contentCount = 0;
    let favoriteCount = 0;
    let likeCount = 0;
    let followCount = 0;

    let strongCount = 0;
    let mediumCount = 0;
    let weakCount = 0;

    const interactionDates: number[] = [];

    for (const er of matchingRecords) {
      const st = er.record.sourceType;
      if (st === "CONTENT") contentCount++;
      else if (st === "FAVORITE") favoriteCount++;
      else if (st === "LIKE") likeCount++;
      else if (st === "FOLLOW") followCount++;

      for (const tm of er.topicMatches) {
        if (tm.topicId === cat.id) {
          const sig = tm.evidenceRef.signalStrength;
          if (sig === "STRONG") strongCount++;
          else if (sig === "MEDIUM") mediumCount++;
          else if (sig === "WEAK") weakCount++;
        }
      }

      // Collect timestamp
      const timeStr = er.record.interactionAt || er.record.publishedAt || er.record.observedAt;
      if (timeStr) {
        const t = Date.parse(timeStr);
        if (!isNaN(t)) {
          interactionDates.push(t);
        }
      }
    }

    const totalInteractions = contentCount + favoriteCount + likeCount + followCount;
    if (totalInteractions === 0) continue;

    const hasContent = contentCount > 0;
    const hasFavorite = favoriteCount > 0;
    const hasLike = likeCount > 0;
    const hasFollow = followCount > 0;
    const activeSourceCount = [hasContent, hasFavorite, hasLike, hasFollow].filter(Boolean).length;

    // Time calculations
    let firstInteractionAt: string | null = null;
    let lastInteractionAt: string | null = null;
    let timeSpanDays = 0;
    let temporalCategory: BehaviorTopicMatrixItem["timeSpan"]["temporalCategory"] = "INSUFFICIENT_TIME_DATA";

    if (interactionDates.length > 0) {
      interactionDates.sort((a, b) => a - b);
      const minDate = interactionDates[0];
      const maxDate = interactionDates[interactionDates.length - 1];

      firstInteractionAt = new Date(minDate).toISOString();
      lastInteractionAt = new Date(maxDate).toISOString();
      timeSpanDays = Math.max(0, Math.round((maxDate - minDate) / (1000 * 86400)));

      const daysSinceLast = Math.max(0, Math.round((nowMs - maxDate) / (1000 * 86400)));

      if (timeSpanDays >= 120) {
        temporalCategory = "LONG_TERM_STABLE";
      } else if (timeSpanDays <= 30 && daysSinceLast <= 30 && totalInteractions >= 2) {
        temporalCategory = "RECENT_RISING";
      } else if (timeSpanDays <= 14 && daysSinceLast <= 14) {
        temporalCategory = "RECENT_ONLY";
      } else if (daysSinceLast > 120 && totalInteractions >= 2) {
        temporalCategory = "HISTORICAL";
      } else {
        temporalCategory = "SPORADIC";
      }
    }

    // Cross source presence
    let crossLevel: BehaviorTopicMatrixItem["crossSourcePresence"]["level"] = "SINGLE_SOURCE";
    let crossDesc = "单一行为源记录";

    if (activeSourceCount >= 3) {
      crossLevel = "HIGH_CROSS_SOURCE";
      crossDesc = `跨创作(${contentCount})、收藏(${favoriteCount})、互动(${likeCount})多维行为交叉验证`;
    } else if (activeSourceCount === 2) {
      crossLevel = "MODERATE_CROSS_SOURCE";
      const parts: string[] = [];
      if (hasContent) parts.push(`创作(${contentCount})`);
      if (hasFavorite) parts.push(`收藏(${favoriteCount})`);
      if (hasLike) parts.push(`点赞(${likeCount})`);
      if (hasFollow) parts.push(`关注(${followCount})`);
      crossDesc = `在 ${parts.join(" 与 ")} 双源中交叉印证`;
    } else {
      if (hasContent) {
        crossLevel = "SINGLE_SOURCE";
        crossDesc = `主要表现为用户主动投稿制作 (${contentCount} 条)`;
      } else if (hasFavorite) {
        crossLevel = "SINGLE_SOURCE";
        crossDesc = `主要表现为用户主动价值收藏 (${favoriteCount} 条)`;
      } else if (hasLike) {
        crossLevel = "EPHEMERAL";
        crossDesc = `仅表现为轻量即时互动点赞 (${likeCount} 条)`;
      }
    }

    const matrixItem: BehaviorTopicMatrixItem = {
      topicId: cat.id,
      topicName: cat.name,
      contentCount,
      favoriteCount,
      likeCount,
      followCount,
      totalInteractions,
      sourceCoverage: {
        hasContent,
        hasFavorite,
        hasLike,
        hasFollow,
        activeSourceCount,
      },
      timeSpan: {
        firstInteractionAt,
        lastInteractionAt,
        timeSpanDays,
        temporalCategory,
      },
      signalBreakdown: {
        strongCount,
        mediumCount,
        weakCount,
      },
      crossSourcePresence: {
        level: crossLevel,
        description: crossDesc,
      },
    };

    matrix.push(matrixItem);

    // Temporal summary
    let timeSummary = "时间记录不充分";
    if (temporalCategory === "LONG_TERM_STABLE") {
      timeSummary = `跨度 ${timeSpanDays} 天持续活跃，具备长期稳定性`;
    } else if (temporalCategory === "RECENT_RISING") {
      timeSummary = `集中在近期 (${timeSpanDays} 天内) 活跃涌现`;
    } else if (temporalCategory === "HISTORICAL") {
      timeSummary = `历史早期沉淀，近期无显著新互动`;
    } else if (temporalCategory === "SPORADIC") {
      timeSummary = `零星偶发出现，未见显著时间聚集`;
    }

    temporalPatterns.push({
      topicId: cat.id,
      topicName: cat.name,
      pattern: temporalCategory,
      firstInteractionAt,
      lastInteractionAt,
      timeSpanDays,
      summary: timeSummary,
    });
  }

  // Deterministic sort: 1. activeSourceCount desc, 2. totalInteractions desc
  matrix.sort((a, b) => {
    if (b.sourceCoverage.activeSourceCount !== a.sourceCoverage.activeSourceCount) {
      return b.sourceCoverage.activeSourceCount - a.sourceCoverage.activeSourceCount;
    }
    return b.totalInteractions - a.totalInteractions;
  });

  // Source availability summary
  const getAvail = (st: SourceRecordType): RecordAvailability => {
    if (!sourceStats) return "AVAILABLE";
    const stat = sourceStats[st];
    if (!stat || stat.total === 0) return "PARTIAL";
    if (stat.available > 0) return "AVAILABLE";
    if (stat.partial > 0) return "PARTIAL";
    return "UNAVAILABLE";
  };

  const sourceAvailability: MultiSourceAvailabilitySummary = {
    content: getAvail("CONTENT"),
    favorites: getAvail("FAVORITE"),
    likes: getAvail("LIKE"),
    follows: getAvail("FOLLOW"),
    profile: getAvail("PROFILE"),
  };

  // Sampling metadata per source
  const sourceTypes: SourceRecordType[] = ["CONTENT", "FAVORITE", "LIKE", "FOLLOW", "PROFILE"];
  const samplingMetadata: SourceSamplingMetadata[] = [];

  for (const st of sourceTypes) {
    const records = extractedRecords.filter((r) => r.record.sourceType === st);
    const analyzedCount = records.filter((r) => !r.isUnclassified).length;
    const collectedCount = records.length;

    let platformTotal: number | null = null;
    for (const r of records) {
      const metaTotal = r.record.metadata?.platformTotalCount;
      if (typeof metaTotal === "number" && isFinite(metaTotal) && metaTotal > 0) {
        platformTotal = metaTotal;
        break;
      }
    }

    let samplingStrategy: SourceSamplingMetadata["samplingStrategy"] = "FULL_OBSERVATION";
    let isComplete = true;
    let timeWindowDesc = "全量历史观测";
    let warning: string | undefined = undefined;

    if (st === "CONTENT") {
      platformTotal = platformTotal ?? collectedCount;
      isComplete = collectedCount >= platformTotal;
      samplingStrategy = isComplete ? "FULL_OBSERVATION" : "PAGINATED_SAMPLE";
      timeWindowDesc = `采集 ${collectedCount} 条公开投稿（平台总数: ${platformTotal} 条）`;
      if (!isComplete) {
        warning = `仅采集了最近 ${collectedCount} 条公开投稿，未能覆盖全部 ${platformTotal} 条历史投稿。`;
      }
    } else if (st === "FAVORITE") {
      platformTotal = platformTotal ?? (collectedCount > 0 ? collectedCount : null);
      isComplete = platformTotal !== null ? collectedCount >= platformTotal : true;
      samplingStrategy = isComplete ? "FULL_OBSERVATION" : "LATEST_WINDOW_SAMPLE";
      if (collectedCount > 0) {
        const coveragePct = platformTotal ? ((collectedCount / platformTotal) * 100).toFixed(1) : "100";
        timeWindowDesc = `仅采集最近 ${collectedCount} 条公开收藏样本（平台总收藏数: ${platformTotal ?? collectedCount} 条，采样覆盖率: ${coveragePct}%）`;
        if (!isComplete) {
          warning = `当前仅观测到最近 ${collectedCount} 条公开收藏样本，不代表用户全部 ${platformTotal} 条历史收藏行为，严禁直接外推全局历史比例。`;
        }
      } else {
        timeWindowDesc = "未采集到公开收藏数据或用户设置了隐私保护";
      }
    } else if (st === "LIKE") {
      platformTotal = null; // 20 条是公开接口观测窗口，不代表用户全部历史点赞总数
      samplingStrategy = "LATEST_WINDOW_SAMPLE";
      isComplete = false; // 窗口采样，未覆盖历史全部点赞
      timeWindowDesc = `受 Bilibili 接口限制，仅能获取最新 ${collectedCount} 条公开点赞记录`;
      warning = "仅代表近期即时互动窗口，不代表用户历史全部点赞行为，严禁外推全局点赞偏好。";
    } else if (st === "FOLLOW") {
      samplingStrategy = collectedCount > 0 ? "PAGINATED_SAMPLE" : "NOT_AVAILABLE";
      isComplete = false;
      timeWindowDesc = collectedCount > 0 ? `采集 ${collectedCount} 条关注创作者` : "未提供登录凭据，未采集关注列表";
      if (collectedCount === 0) {
        warning = "未采集关注列表数据。";
      }
    } else if (st === "PROFILE") {
      platformTotal = 1;
      isComplete = true;
      samplingStrategy = "FULL_OBSERVATION";
      timeWindowDesc = "公开主页展示信息，不参与兴趣画像";
    }

    samplingMetadata.push({
      sourceType: st,
      platformTotalCount: platformTotal,
      collectedCount,
      analyzedCount,
      samplingStrategy,
      isComplete,
      timeWindowDescription: timeWindowDesc,
      samplingWarning: warning,
    });
  }

  return {
    matrix,
    temporalPatterns,
    sourceAvailability,
    samplingMetadata,
  };
}
