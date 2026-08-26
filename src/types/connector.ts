/**
 * BiliProfile Analyzer — Connector Capability & Gating Types (Phase 4.3.1)
 * Aligned with Phase 4.3.1 Invariant Hardening Specification
 */

export type ConnectorCapabilityType =
  | "BASIC_PROFILE"
  | "PUBLIC_FOLLOWS"
  | "PUBLIC_CONTENT";

export type CapabilityStatus =
  | "UNVERIFIED"
  | "PAGE_REACHABLE"
  | "AVAILABLE_PUBLIC"
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
  | "FAILED";

export interface ConnectorResult<T = unknown> {
  success: boolean;
  capability: ConnectorCapabilityType;
  status: ConnectorResultStatus;
  data: T | null;
  reason: string;
  fallbackApplied: boolean;
}

export interface BasicProfileData {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  sign?: string;
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
