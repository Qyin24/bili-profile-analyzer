/**
 * BiliProfile Analyzer — Domain & Mock Type Definitions (Phase 2)
 * Aligned with Phase 0.3 Architecture Specification (docs/PROJECT_PLAN.md)
 */

export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type PipelineStage =
  | "COLLECT"
  | "NORMALIZE"
  | "CLEAN"
  | "EXTRACT"
  | "AGGREGATE"
  | "STATISTICAL_ANALYSIS"
  | "AI_ANALYSIS"
  | "SYNTHESIS"
  | "REPORT";

export type TaskOutcome = "FULL" | "PARTIAL" | "NONE";

export type DataSourceRunStatus =
  | "SUCCEEDED"
  | "SKIPPED_UNAVAILABLE"
  | "RATE_LIMITED"
  | "FAILED";

export type ConsentScope = "THIS_TASK_ONLY" | "PERSISTENT_ACROSS_TASKS";

export type MappingMethod = "RULE_BASED" | "MANUAL";
export type FutureMappingMethod = "RULE_BASED" | "MANUAL" | "AI_ASSISTED";

export interface SelfProvidedField<T = string> {
  value: T;
  allowedForAnalysis: boolean;
  consentScope: ConsentScope;
}

export interface SelfProvidedProfile {
  id: string;
  targetId: string;
  currentGoals: SelfProvidedField<string>;
  learningDirections: SelfProvidedField<string[]>;
  careerOrMajor: SelfProvidedField<string>;
  interestTags: SelfProvidedField<string[]>;
  questionsForAnalysis: SelfProvidedField<string[]>;
  additionalContext: SelfProvidedField<string>;
  updatedAt: string;
}

export interface AnalysisTargetSummary {
  id: string;
  name: string;
  platform: "BILIBILI";
  platformUid: string;
  avatarUrl?: string;
  category: "人物" | "组织" | "事件";
  totalFollowingsSampled: number;
  totalDynamicsSampled: number;
  createdAt: string;
  lastAnalyzedAt?: string;
  description?: string;
}

export type AnalysisTarget = AnalysisTargetSummary;

export interface DataSourceRun {
  id: string;
  taskId: string;
  sourceName: string;
  status: DataSourceRunStatus;
  recordsCount: number;
  durationMs?: number;
  message?: string | null;
}

export interface AnalysisTaskDeterministic {
  id: string;
  targetId: string;
  targetName: string;
  platformUid: string;
  taskStatus: TaskStatus;
  pipelineStage: PipelineStage;
  outcome: TaskOutcome;
  progress: number;
  currentStageMessage: string;
  createdAt: string;
  completedAt?: string;
  dataSourceRuns: DataSourceRun[];
}

export type AnalysisTask = AnalysisTaskDeterministic;

export interface TopicTaxonomyItem {
  id: string;
  name: string;
  code: string;
  color: string;
  description: string;
}

export interface TopicAssignmentItem {
  id: string;
  subjectType: "FOLLOW" | "CONTENT_ITEM";
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  taxonomyVersion: string;
  method: MappingMethod;
  confidence: number;
  evidenceIds: string[];
  createdAt: string;
}

export interface FollowEntityItem {
  id: string;
  targetId: string;
  name: string;
  sign: string;
  avatarUrl?: string;
  entityType: "UP主" | "机构媒体" | "个人博主" | "官方号";
  topicId: string;
  topicName: string;
  mappingMethod: MappingMethod;
  confidence: number;
  followedOrder: number;
}

export interface CategoryMetric {
  topicId: string;
  topicName: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ReportEvidenceSnapshot {
  id: string;
  taskId: string;
  sourceType: "SELF_REPORTED" | "FOLLOW_RECORD" | "CONTENT_SAMPLE" | "STATISTICAL_METRIC";
  evidenceId: string;
  title: string;
  excerptOrMetricValue: string;
  contentHash: string;
  createdAt: string;
}

export interface AIClaimItem {
  id: string;
  dimension: "知识与学习诉求" | "兴趣与内容消费偏好" | "公开表达特征" | "模拟表达特征" | "综合研判" | string;
  claim: string;
  evidenceIds: string[];
  scope: string;
  uncertainty: string;
}

export interface AnalysisResultDeterministic {
  id: string;
  taskId: string;
  targetId: string;
  targetName: string;
  platformUid: string;
  summary: string;
  generatedAt: string;
  outcome: TaskOutcome;
  metricsSnapshot: {
    categoryMetrics: CategoryMetric[];
    totalSampleCount: number;
    diversityEntropy: number;
    peakActiveHours: string;
  };
  selfProvidedSnapshot: {
    currentGoals?: string;
    learningDirections?: string[];
    careerOrMajor?: string;
    interestTags?: string[];
    questionsForAnalysis?: string[];
  };
  publicDataObservations: {
    title: string;
    description: string;
    statValue: string;
  }[];
  aiClaims: AIClaimItem[];
  evidenceSnapshots: ReportEvidenceSnapshot[];
}

export interface DeterministicQAPair {
  id: string;
  question: string;
  answer: string;
  referencedEvidenceIds: string[];
}
