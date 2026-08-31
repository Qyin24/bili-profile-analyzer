/**
 * BiliProfile Analyzer — Connector Capability & Gating Types (Phase 4.3.1)
 * Aligned with Phase 4.3.1 Invariant Hardening Specification
 */

export type ConnectorCapabilityType =
  | "BASIC_PROFILE"
  | "PUBLIC_FOLLOWS"
  | "PUBLIC_CONTENT"
  | "PUBLIC_FAVORITES"
  | "PUBLIC_LIKES"
  | "PUBLIC_DYNAMICS";

export type CapabilityStatus =
  | "UNVERIFIED"
  | "PAGE_REACHABLE"
  | "AVAILABLE_PUBLIC"
  | "AVAILABLE_AUTHENTICATED"
  | "REQUIRES_AUTH"
  | "UNAVAILABLE_PRIVATE"
  | "UNAVAILABLE_UNKNOWN"
  | "RATE_LIMITED"
  | "BLOCKED"
  | "REDIRECTED_NOT_FOLLOWED"
  | "NETWORK_ERROR"
  | "UNSUPPORTED"
  | "SKIPPED_NOT_CONFIGURED"
  | "SKIPPED_INVALID_CONFIGURATION";

export type FieldSignalStatus =
  | "NOT_ATTEMPTED"
  | "TITLE_SIGNAL_OBSERVED"
  | "TITLE_SIGNAL_NOT_OBSERVED";

export type ProfileLabelSignalStatus =
  | "PROFILE_LABEL_SIGNAL_OBSERVED"
  | "PROFILE_LABEL_SIGNAL_NOT_OBSERVED"
  | "NOT_ATTEMPTED";

export type BasicProfileSignalStatus =
  | "FIELD_SIGNALS_PRESENT"
  | "FIELD_SIGNALS_NOT_DETECTED"
  | "NOT_ATTEMPTED";

export type IndividualFieldSignalStatus =
  | "UNVERIFIED"
  | "OBSERVED"
  | "NOT_OBSERVED"
  | "BLOCKED"
  | "NOT_ATTEMPTED";

export interface BasicProfileFieldSignals {
  displayName: IndividualFieldSignalStatus;
  avatarUrl: IndividualFieldSignalStatus;
  signature: IndividualFieldSignalStatus;
}

export type FieldValueValidationStatus =
  | "PARSED_NONEMPTY"
  | "PARSED_EMPTY_OR_ABSENT"
  | "PARSE_REJECTED"
  | "NOT_OBSERVED";

export interface BasicProfileValueValidationResult {
  displayName: FieldValueValidationStatus;
  avatarUrl: FieldValueValidationStatus;
  avatarUrlSyntaxValid: boolean;
  signature: FieldValueValidationStatus;
}

export interface BasicProfileSignalInspectionResult {
  ruleVersion: string;
  signals: BasicProfileFieldSignals;
  valueValidation?: BasicProfileValueValidationResult;
  bytesProcessed: number;
  maxObservedBufferLength: number;
  failureReason?: string;
}

export type ObservationSource =
  | "SYNTHETIC_OFFLINE_TEST"
  | "CONTROLLED_LIVE_PROBE";

export type ControlledProbeOutcome =
  | "SIGNALS_OBSERVED"
  | "SIGNALS_NOT_OBSERVED"
  | "BLOCKED"
  | "UNREACHABLE"
  | "INVALID_INPUT";

export interface ControlledProbeResult {
  probeVersion: string;
  observationSource: ObservationSource;
  observedAt: string;
  outcome: ControlledProbeOutcome;
  isReachable: boolean;
  httpStatus?: number;
  signals: BasicProfileFieldSignals;
  valueValidation?: BasicProfileValueValidationResult;
  bytesProcessed: number;
  hitByteLimit: boolean;
  summary: string;
}

/**
 * ============================================================================
 * Phase 4.5 — 结构化公开资料字段契约与离线验证类型 (Field Contract Types)
 * ============================================================================
 *
 * 核心语义与自然语言边界说明：
 * 1. 字段级“已验证”(VERIFIED) 与能力级“可稳定使用”(AVAILABLE_PUBLIC) 是两个完全不同的结论。
 * 2. 字段达到 VERIFIED 仅代表在当前受控测试样本或单次探针中，存在确定的结构锚点/元数据来源且值格式合法；
 * 3. 这绝不代表 BASIC_PROFILE 整体能力已达到生产环境稳定可用，亦不代表可以启动正式采集或写入数据库；
 * 4. 无论单个字段验证结果如何，当前整体能力状态 overallCapabilityStatus 均严格保持 UNVERIFIED。
 */

export type PublicProfileFieldName =
  | "displayName"
  | "signature"
  | "avatarUrl"
  | "verifiedLabel"
  | "level";

export type ProfileFieldContractStatus =
  | "VERIFIED"
  | "UNVERIFIED"
  | "UNAVAILABLE";

export type FieldEvidenceSourceType =
  | "STRUCTURED_META_TAG"
  | "DOM_SEMANTIC_ANCHOR"
  | "CANONICAL_LINK"
  | "SYNTHETIC_TEST_FIXTURE"
  | "NONE";

export interface PositiveFieldEvidenceDescriptor {
  evidenceType: Exclude<FieldEvidenceSourceType, "NONE">;
  anchorIdentifier: string;
}

export interface NoneFieldEvidenceDescriptor {
  evidenceType: "NONE";
  anchorIdentifier: "";
}

export type ProfileFieldEvidenceDescriptor =
  | PositiveFieldEvidenceDescriptor
  | NoneFieldEvidenceDescriptor;

export interface VerifiedFieldObservation<T = string | number> {
  fieldName: PublicProfileFieldName;
  status: "VERIFIED";
  value: T;
  evidence: PositiveFieldEvidenceDescriptor;
  failureReason?: undefined | null;
}

export interface UnverifiedFieldObservation {
  fieldName: PublicProfileFieldName;
  status: "UNVERIFIED";
  value?: undefined | null;
  evidence?: NoneFieldEvidenceDescriptor | null;
  failureReason: string;
}

export interface UnavailableFieldObservation {
  fieldName: PublicProfileFieldName;
  status: "UNAVAILABLE";
  value?: undefined | null;
  evidence?: NoneFieldEvidenceDescriptor | null;
  failureReason: string;
}

export type PublicProfileFieldObservation<T = string | number> =
  | VerifiedFieldObservation<T>
  | UnverifiedFieldObservation
  | UnavailableFieldObservation;

export interface PublicProfileFieldContractRecord {
  contractVersion: string;
  observedAt: string;
  source: ObservationSource;
  /**
   * 当前能力基线严格保持字面量 UNVERIFIED，不可因单个候选字段验证而误升为 AVAILABLE_PUBLIC。
   */
  overallCapabilityStatus: "UNVERIFIED";
  fields: {
    displayName: PublicProfileFieldObservation<string>;
    signature: PublicProfileFieldObservation<string>;
    avatarUrl: PublicProfileFieldObservation<string>;
    verifiedLabel: PublicProfileFieldObservation<string>;
    level: PublicProfileFieldObservation<number>;
  };
  /**
   * 零敏感留存断言标记：确认不包含原始 HTML、Cookie、响应头或任何密钥。
   */
  dataMinimizationGuaranteed: boolean;
}

export interface ConnectorCapability {
  type: ConnectorCapabilityType;
  name: string;
  description: string;
  requiredForFullReport: boolean;
  fallbackStrategy: string;
}

export interface ProbeResult {
  timestamp: string;
  capability: ConnectorCapabilityType;
  status: CapabilityStatus;
  httpStatus?: number;
  fieldSignal?: FieldSignalStatus;
  message: string;
}

export interface ProbeTransportResult {
  capability: ConnectorCapabilityType;
  statusCode?: number;
  contentType?: string;
  responseSizeBytes?: number;
  elapsedMs?: number;
  observedAt: string;
  outcome: CapabilityStatus;
  note: string;
  observationSource?: ObservationSource;
  probeVersion?: string;
}

export interface CapabilityReportItem {
  capability: ConnectorCapabilityType;
  name: string;
  verificationMethod: string;
  status: CapabilityStatus;
  fieldSignal?: FieldSignalStatus;
  fallbackStrategy: string;
  lastVerifiedAt: string;
  notes: string;
}

// Phase 4.3.1 Gated Connector Structured Types
export type ConnectorResultStatus =
  | "SUCCESS"
  | "SKIPPED_UNAVAILABLE"
  | "UNVERIFIED_BLOCKED"
  | "IMPLEMENTATION_NOT_AVAILABLE"
  | "RATE_LIMITED"
  | "REQUIRES_AUTH"
  | "PRIVATE"
  | "FAILED";

export interface ConnectorResult<T = unknown> {
  success: boolean;
  capability: ConnectorCapabilityType;
  status: ConnectorResultStatus;
  data: T | null;
  reason: string;
  fallbackApplied: boolean;
}

import { NormalizedBasicProfileInput } from "@/types/processing";

export interface ConnectorFetchOptions {
  customFetch?: typeof fetch;
}

export interface BasicProfileData {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  sign?: string;
  normalizedInput?: NormalizedBasicProfileInput;
}

export interface PublicFollowsData {
  uid: string;
  totalFollowsSampled: number;
  items: {
    mid: string;
    uname: string;
    sign?: string;
  }[];
}

export interface PublicContentData {
  uid: string;
  totalDynamicsSampled: number;
  items: {
    id: string;
    timestamp: number;
    textExcerpt?: string;
  }[];
}
