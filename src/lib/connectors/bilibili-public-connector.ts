/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * BiliProfile Analyzer — Bilibili Public Connector (Phase 4.3.1)
 * Capability-Gated Architecture Specification
 * 
 * Safety & Invariant Rules:
 * 1. Default production registry is immutable and fixed to UNVERIFIED for all 3 capabilities.
 * 2. If capability is NOT 'AVAILABLE_PUBLIC' (e.g. UNVERIFIED, PAGE_REACHABLE, BLOCKED, etc.),
 *    gate returns UNVERIFIED_BLOCKED (success: false, data: null).
 * 3. Even if capability is 'AVAILABLE_PUBLIC' in testing, Connector NEVER fakes success data;
 *    it strictly returns IMPLEMENTATION_NOT_AVAILABLE (success: false, data: null, fallbackApplied: true)
 *    because no approved extraction implementation exists in this phase.
 * 4. Zero credentials (no Cookie, Token, SESSDATA, Wbi, Login), Zero network calls.
 */

import {
  ConnectorCapabilityType,
  CapabilityStatus,
  ConnectorResult,
  BasicProfileData,
  PublicFollowsData,
  PublicContentData,
} from "@/types/connector";

export type CapabilityRegistry = Record<ConnectorCapabilityType, CapabilityStatus>;

export const DEFAULT_PRODUCTION_REGISTRY: Readonly<CapabilityRegistry> = Object.freeze({
  BASIC_PROFILE: "UNVERIFIED",
  PUBLIC_FOLLOWS: "UNVERIFIED",
  PUBLIC_CONTENT: "UNVERIFIED",
});

export class BilibiliPublicConnector {
  private readonly registry: CapabilityRegistry;

  /**
   * Constructs connector instance.
   * @param testOnlyRegistryOverrides Explicit test-only registry overrides for unit/self-tests.
   */
  constructor(testOnlyRegistryOverrides?: Partial<CapabilityRegistry>) {
    this.registry = {
      ...DEFAULT_PRODUCTION_REGISTRY,
      ...testOnlyRegistryOverrides,
    };
  }

  /**
   * Get current capability status from registry.
   */
  public getCapabilityStatus(type: ConnectorCapabilityType): CapabilityStatus {
    return this.registry[type] || "UNVERIFIED";
  }

  /**
   * Fetch Basic Profile (Gated by BASIC_PROFILE status)
   */
  public async fetchBasicProfile(_targetUid: string): Promise<ConnectorResult<BasicProfileData>> {
    const status = this.getCapabilityStatus("BASIC_PROFILE");

    // Strict Gate 1: Non-AVAILABLE_PUBLIC is blocked immediately
    if (status !== "AVAILABLE_PUBLIC") {
      return {
        success: false,
        capability: "BASIC_PROFILE",
        status: "UNVERIFIED_BLOCKED",
        data: null,
        reason: `能力 [BASIC_PROFILE] 当前状态为 [${status}]，未达到 [AVAILABLE_PUBLIC] 放行条件，门控已拦截，未发起外部网络请求。`,
        fallbackApplied: true,
      };
    }

    // Strict Gate 2: No approved extraction implementation in Phase 4.3.1 (Never fake data)
    return {
      success: false,
      capability: "BASIC_PROFILE",
      status: "IMPLEMENTATION_NOT_AVAILABLE",
      data: null,
      reason: "能力状态允许未来扩展，但当前阶段没有经批准的提取实现，因此未发起外部网络请求。",
      fallbackApplied: true,
    };
  }

  /**
   * Fetch Public Follows (Gated by PUBLIC_FOLLOWS status)
   */
  public async fetchPublicFollows(_targetUid: string): Promise<ConnectorResult<PublicFollowsData>> {
    const status = this.getCapabilityStatus("PUBLIC_FOLLOWS");

    // Strict Gate 1: Non-AVAILABLE_PUBLIC is blocked immediately
    if (status !== "AVAILABLE_PUBLIC") {
      return {
        success: false,
        capability: "PUBLIC_FOLLOWS",
        status: "UNVERIFIED_BLOCKED",
        data: null,
        reason: `能力 [PUBLIC_FOLLOWS] 当前状态为 [${status}]，未达到 [AVAILABLE_PUBLIC] 放行条件，门控已拦截，未发起外部网络请求。`,
        fallbackApplied: true,
      };
    }

    // Strict Gate 2: No approved extraction implementation in Phase 4.3.1 (Never fake data)
    return {
      success: false,
      capability: "PUBLIC_FOLLOWS",
      status: "IMPLEMENTATION_NOT_AVAILABLE",
      data: null,
      reason: "能力状态允许未来扩展，但当前阶段没有经批准的提取实现，因此未发起外部网络请求。",
      fallbackApplied: true,
    };
  }

  /**
   * Fetch Public Content (Gated by PUBLIC_CONTENT status)
   */
  public async fetchPublicContent(_targetUid: string): Promise<ConnectorResult<PublicContentData>> {
    const status = this.getCapabilityStatus("PUBLIC_CONTENT");

    // Strict Gate 1: Non-AVAILABLE_PUBLIC is blocked immediately
    if (status !== "AVAILABLE_PUBLIC") {
      return {
        success: false,
        capability: "PUBLIC_CONTENT",
        status: "UNVERIFIED_BLOCKED",
        data: null,
        reason: `能力 [PUBLIC_CONTENT] 当前状态为 [${status}]，未达到 [AVAILABLE_PUBLIC] 放行条件，门控已拦截，未发起外部网络请求。`,
        fallbackApplied: true,
      };
    }

    // Strict Gate 2: No approved extraction implementation in Phase 4.3.1 (Never fake data)
    return {
      success: false,
      capability: "PUBLIC_CONTENT",
      status: "IMPLEMENTATION_NOT_AVAILABLE",
      data: null,
      reason: "能力状态允许未来扩展，但当前阶段没有经批准的提取实现，因此未发起外部网络请求。",
      fallbackApplied: true,
    };
  }
}
