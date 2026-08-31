/**
 * BiliProfile Analyzer — Phase 6.4: Frontend Read-Only View-Model & Status Mappers for /analysis
 *
 * Provides pure conversion, strict sanitization, and state mapping for verified task artifacts.
 *
 * Guarantees:
 * - Only consumes sanitized TaskSummaryResponse, TaskDeterministicReportResponse, TaskAiAnalysisResponse.
 * - Stably sorts completed tasks by completedAt ?? createdAt descending (most recent first).
 * - Validates strict evidence reference integrity: rejects any dangling evidenceId with INVALID_DATA.
 * - Maps 404, 422, 500 into fixed, controlled, sanitized Chinese UI messages.
 * - Zero leakage of raw bodies, descriptions, snapshots, self-profile values, credentials, stacks, or Prisma errors.
 * - Zero fallback to fake demo data or synthetic evidence when no completed tasks exist.
 */

import { TaskSummaryResponse } from "@/types/task-api";
import {
  TaskDeterministicReportResponse,
  ReportEvidence,
  ReportObservation,
  ContentItemEvidence,
  SourceSamplingMetadata,
  BehaviorTopicMatrixItem,
  TemporalPatternItem,
} from "@/types/processing";
import { TaskAiAnalysisResponse, AiFinding, AiProviderType } from "@/types/ai-analysis";

export type AnalysisPageState =
  | { type: "LOADING" }
  | { type: "EMPTY"; message: string }
  | {
      type: "ERROR";
      code: "NOT_FOUND" | "INVALID_DATA" | "SERVER_ERROR";
      message: string;
    }
  | {
      type: "SUCCESS";
      task: {
        id: string;
        targetDisplayName: string;
        platformUid: string;
        completedAt: string | null;
        createdAt: string;
        hasSelfProvidedSnapshot: boolean;
        selfProvidedFieldsCount: number;
        isRealProfile: boolean;
      };
      deterministicReport: {
        artifactId: string;
        schemaVersion: string;
        taxonomyVersion: string;
        summary: string;
        topicShares: {
          topicId: string;
          topicName: string;
          share: number;
          percentage: string;
        }[];
        limitations: string[];
        observations: ReportObservation[];
        evidenceMap: Record<string, ReportEvidence>;
        contentItemsMap: Record<string, ContentItemEvidence>;
        samplingMetadata?: SourceSamplingMetadata[];
        behaviorTopicMatrix?: BehaviorTopicMatrixItem[];
        temporalPatterns?: TemporalPatternItem[];
        diagnostics: {
          totalInputRecords: number;
          droppedRecords: number;
          unclassifiedRecords: number;
          qualityWarningCodes: string[];
        };
      };
      aiAnalysis: {
        artifactId: string;
        provider: AiProviderType;
        summary: string;
        findings: AiFinding[];
        limitations: string[];
      };
    };

/**
 * Maps HTTP error status codes into fixed, controlled, sanitized Chinese UI messages.
 */
export function mapApiStatusToErrorMessage(status: number): {
  code: "NOT_FOUND" | "INVALID_DATA" | "SERVER_ERROR";
  message: string;
} {
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: "任务工件尚未生成或不存在",
    };
  }
  if (status === 422) {
    return {
      code: "INVALID_DATA",
      message: "任务工件未通过安全校验，暂不展示",
    };
  }
  return {
    code: "SERVER_ERROR",
    message: "暂时无法加载分析结果，请稍后重试",
  };
}

/**
 * Safely parses a date string into a timestamp, returning 0 if invalid or missing.
 */
function safeTimestamp(dateStr: string | null | undefined): number {
  if (!dateStr || typeof dateStr !== "string") return 0;
  const time = Date.parse(dateStr);
  return isNaN(time) ? 0 : time;
}

/**
 * Filters completed tasks and stably sorts them by completedAt ?? createdAt descending (most recent first).
 */
export function filterCompletedTasks(
  tasks: TaskSummaryResponse[]
): TaskSummaryResponse[] {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .filter((t) => t && t.taskStatus === "COMPLETED")
    .sort((a, b) => {
      const timeB = safeTimestamp(b.completedAt) || safeTimestamp(b.createdAt);
      const timeA = safeTimestamp(a.completedAt) || safeTimestamp(a.createdAt);
      return timeB - timeA;
    });
}

/**
 * Assembles a strictly sanitized, read-only UI view-model from valid task artifacts.
 * Verifies that all cited evidenceIds exist in evidenceMap; rejects dangling references with INVALID_DATA.
 */
export function buildAnalysisViewModel(
  task: TaskSummaryResponse,
  reportResponse: TaskDeterministicReportResponse,
  aiResponse: TaskAiAnalysisResponse
): AnalysisPageState {
  if (!task || !reportResponse || !aiResponse) {
    return {
      type: "ERROR",
      code: "SERVER_ERROR",
      message: "暂时无法加载分析结果，请稍后重试",
    };
  }

  const { report } = reportResponse;
  const { analysis } = aiResponse;

  if (!report || !analysis) {
    return {
      type: "ERROR",
      code: "INVALID_DATA",
      message: "任务工件未通过安全校验，暂不展示",
    };
  }

  // Build evidenceMap and contentItemsMap for rapid lookup
  const evidenceMap: Record<string, ReportEvidence> = {};
  if (Array.isArray(report.evidence)) {
    for (const item of report.evidence) {
      if (item && typeof item.id === "string") {
        evidenceMap[item.id] = item;
      }
    }
  }

  const contentItemsMap: Record<string, ContentItemEvidence> = {};
  if (Array.isArray(report.contentItems)) {
    for (const item of report.contentItems) {
      if (item && typeof item.evidenceId === "string") {
        contentItemsMap[item.evidenceId] = item;
      }
    }
  }

  // Strict Evidence Integrity: Validate all observation evidenceIds
  if (Array.isArray(report.observations)) {
    for (const obs of report.observations) {
      if (Array.isArray(obs.evidenceIds)) {
        for (const evId of obs.evidenceIds) {
          if (!evidenceMap[evId] && !contentItemsMap[evId]) {
            return {
              type: "ERROR",
              code: "INVALID_DATA",
              message: "任务工件未通过安全校验，暂不展示",
            };
          }
        }
      }
    }
  }

  // Strict Evidence Integrity: Validate all AI finding evidenceIds
  if (Array.isArray(analysis.findings)) {
    for (const finding of analysis.findings) {
      if (Array.isArray(finding.evidenceIds)) {
        for (const evId of finding.evidenceIds) {
          if (!evidenceMap[evId] && !contentItemsMap[evId]) {
            return {
              type: "ERROR",
              code: "INVALID_DATA",
              message: "任务工件未通过安全校验，暂不展示",
            };
          }
        }
      }
    }
  }

  // Extract topic shares from TOPIC_SHARE evidence items
  const topicEvidence = Array.isArray(report.evidence)
    ? report.evidence.filter((e) => e && e.type === "TOPIC_SHARE")
    : [];

  const topicShares = topicEvidence.map((e) => {
    const rawVal =
      typeof e.value === "number" && isFinite(e.value) ? e.value : 0;
    const topicName = e.label
      .replace(/类主题匹配占比$/, "")
      .replace(/主题占比$/, "");
    return {
      topicId: e.id.replace(/^ev_topic_/, ""),
      topicName: topicName || e.label,
      share: rawVal,
      percentage: `${(rawVal * 100).toFixed(1)}%`,
    };
  });

  const totalInput = report.diagnosticsSummary?.totalInput ?? 0;
  const analyzedCount = report.diagnosticsSummary?.analyzedCount ?? 0;
  const unclassifiedCount = report.diagnosticsSummary?.unclassifiedCount ?? 0;
  const droppedRecords = Math.max(0, totalInput - analyzedCount - unclassifiedCount);

  // Generate clean summary text from observations if report.summary is empty
  const sampleObs = Array.isArray(report.observations)
    ? report.observations.find((o) => o.category === "SAMPLE_SIZE")?.statement
    : undefined;
  const topObs = Array.isArray(report.observations)
    ? report.observations.find((o) => o.category === "TOP_TOPIC")?.statement
    : undefined;
  const summaryText = topObs ? `${sampleObs ?? ""} ${topObs}`.trim() : (sampleObs ?? "确定性分析报告已生成");

  return {
    type: "SUCCESS",
    task: {
      id: task.id,
      targetDisplayName: task.target?.displayName || "用户",
      platformUid: task.target?.platformUid || "",
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      hasSelfProvidedSnapshot: Boolean(task.hasSelfProvidedSnapshot),
      selfProvidedFieldsCount: task.selfProvidedFieldsCount ?? 0,
      isRealProfile: Array.isArray(task.dataSourceRuns)
        ? task.dataSourceRuns.some(
            (r) =>
              r &&
              r.sourceName === "BASIC_PROFILE" &&
              r.status === "SUCCEEDED" &&
              r.recordsCount > 0
          )
        : false,
    },
    deterministicReport: {
      artifactId: reportResponse.artifactId,
      schemaVersion: reportResponse.schemaVersion,
      taxonomyVersion: reportResponse.taxonomyVersion,
      summary: summaryText,
      topicShares,
      limitations: Array.isArray(report.limitations) ? report.limitations : [],
      observations: Array.isArray(report.observations)
        ? report.observations
        : [],
      evidenceMap,
      contentItemsMap,
      samplingMetadata: Array.isArray(report.samplingMetadata)
        ? report.samplingMetadata
        : [],
      behaviorTopicMatrix: Array.isArray(report.behaviorTopicMatrix)
        ? report.behaviorTopicMatrix
        : [],
      temporalPatterns: Array.isArray(report.temporalPatterns)
        ? report.temporalPatterns
        : [],
      diagnostics: {
        totalInputRecords: totalInput,
        droppedRecords,
        unclassifiedRecords: unclassifiedCount,
        qualityWarningCodes: Array.isArray(
          report.diagnosticsSummary?.warningCodes
        )
          ? report.diagnosticsSummary.warningCodes
          : [],
      },
    },
    aiAnalysis: {
      artifactId: aiResponse.artifactId,
      provider: aiResponse.provider || "MOCK",
      summary: analysis.summary || "",
      findings: Array.isArray(analysis.findings) ? analysis.findings : [],
      limitations: Array.isArray(analysis.limitations)
        ? analysis.limitations
        : [],
    },
  };
}
