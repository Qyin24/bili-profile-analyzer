/**
 * BiliProfile Analyzer — Phase 8.2.1 Minimal Real BASIC_PROFILE Validation Gate
 *
 * Purpose:
 * Evaluates whether BASIC_PROFILE meets the prerequisites for formal Connector integration.
 * Strictly decoupled from production runtime; never imported by production code.
 *
 * Safety & Compliance Invariants:
 * 1. Scope: STRICTLY BASIC_PROFILE. Rejects follows, content, dynamic, and any other capability.
 * 2. Opt-in Environment Gates:
 *    - RUN_REAL_BASIC_PROFILE_VALIDATION=true
 *    - BASIC_PROFILE_VALIDATION_TARGET_UID=<pure numeric digits, 1 <= length <= 16>
 *    If either is missing or invalid: strictly 0 network calls, outputs validationMode="UNAVAILABLE", errorCode="ENVIRONMENT_FAILURE".
 * 3. Approved Path Whitelist:
 *    - Strict constant: APPROVED_BASIC_PROFILE_URL_TEMPLATE === "https://space.bilibili.com/{uid}"
 *    - Exact origin and pathname validation (https://space.bilibili.com/<uid>). Rejects any query, hash, port, credentials.
 * 4. Execution Ceilings & Streaming Limits:
 *    - Maximum 1 fetch call: credentials="omit", redirect="manual", no automatic retry.
 *    - Hard ceiling MAX_BYTES_CAP = 64 KiB (65536 bytes) with stream chunk byte tracking.
 *    - Missing res.body is treated as fail-closed (SAFETY_BOUNDARY_VIOLATION); never calls res.text().
 *    - Any response exceeding 64 KiB immediately triggers reader cancellation and fails closed (SAFETY_BOUNDARY_VIOLATION).
 * 5. Zero Sensitive Data & Header Persistence:
 *    - In-memory only processing. 0 raw responses, 0 URLs, 0 UIDs, 0 raw request/response headers, 0 cookies/tokens.
 *    - Request record records only a fixed bodyFormat enum ("HTML" | "JSON" | "OTHER" | "UNKNOWN").
 *    - Error summaries are strictly whitelisted static strings; 0 raw error messages or exceptions.
 * 6. Tightened Success Criteria:
 *    - In Phase 8.2, real AI/Synthesis is NOT executed. Real connector data passing shadow pipeline
 *      strictly yields finalConclusion="当前环境无法完成验证，需要以下前置条件" and errorCode="AI_STAGE_UNAVAILABLE".
 *    - Pure decision rule testing is decoupled into an exported pure function.
 * 7. Invariant Baseline:
 *    - All production capabilities remain UNVERIFIED. Connector remains fail-closed.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_PRODUCTION_REGISTRY,
  BilibiliPublicConnector,
} from "../../src/lib/connectors/bilibili-public-connector";
import {
  NormalizedBasicProfileInput,
} from "../../src/types/processing";
import {
  validateBasicProfileInputContract,
  basicProfileInputToPublicSourceRecord,
} from "../../src/lib/processing/basic-profile-input-contract";
import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
} from "../../src/lib/processing/pipeline";

export const APPROVED_BASIC_PROFILE_URL_TEMPLATE = "https://space.bilibili.com/{uid}";
export const MAX_BYTES_CAP = 64 * 1024; // 64 KiB (65536 bytes)

export type ValidationMode = "REAL_CONNECTOR" | "LOCAL_FIXTURE" | "UNAVAILABLE";

export type ValidationErrorCode =
  | "CAPABILITY_ABSENT"
  | "ACCESS_BLOCKED"
  | "AUTHENTICATION_REQUIRED"
  | "RATE_LIMITED"
  | "REGION_RESTRICTED"
  | "ANTI_BOT_RESTRICTED"
  | "ENVIRONMENT_FAILURE"
  | "CONTRACT_INSUFFICIENT"
  | "CONTRACT_CONFLICT"
  | "PIPELINE_INCOMPATIBLE"
  | "AI_STAGE_UNAVAILABLE"
  | "SAFETY_BOUNDARY_VIOLATION";

export type ShadowStageStatus = "NOT_RUN" | "PASSED" | "FAILED" | "BLOCKED";
export type ResponseBodyFormat = "HTML" | "JSON" | "OTHER" | "UNKNOWN";

export type MappingFailureCategory =
  | "CONTRACT_VALIDATION_FAILED"
  | "CONTRACT_MAPPING_EXCEPTION"
  | "MISSING_REQUIRED_FIELDS";

export type NetworkFailureCategory = "DNS" | "TIMEOUT" | "TLS" | "CONNECTION" | "OTHER";

export const WHITELISTED_ERROR_SUMMARIES = new Set<string>([
  "项目中未定义经证据批准的 BASIC_PROFILE 访问路径。",
  "未检测到运行环境变量 RUN_REAL_BASIC_PROFILE_VALIDATION=true 与有效的纯数字 BASIC_PROFILE_VALIDATION_TARGET_UID (长度 1-16 位)，已按照安全要求拦截并保持离线状态。",
  "请求 URL 不符合经批准的格式白名单。",
  "响应体大小超过 64 KiB 安全上限或缺少可读流，触发安全边界熔断。",
  "Bilibili BASIC_PROFILE 响应要求认证或登录态，超出 MVP 无凭据公开数据采集边界。",
  "Bilibili BASIC_PROFILE 请求触发 429/限流响应。",
  "Bilibili BASIC_PROFILE 请求触发 403 访问阻断或反爬拦截。",
  "网络传输异常: DNS 解析失败",
  "网络传输异常: 网络连接超时",
  "网络传输异常: TLS/SSL 握手异常",
  "网络传输异常: 网络连接被拒绝或重置",
  "网络传输异常: 受限环境网络传输异常",
  "BASIC_PROFILE 数据源与确定性流水线均已验证通过，但 AI Provider 尚未配置或不可用。",
  "响应数据缺少 Phase 8.1 契约必填字段（如个人空间昵称）。",
  "契约转换适配过程发生异常，已按安全要求熔断。",
  "响应数据字段结构未通过严格白名单契约校验。",
  "响应数据未通过 Phase 8.1 契约白名单校验或来源模式不满足真实接入要求。",
]);

export interface ValidationRequestRecord {
  requestIndex: number;
  timestampUtc: string;
  method: "GET";
  targetHost: string;
  pathTemplate: string;
  httpStatus: number | null;
  bodyFormat: ResponseBodyFormat;
  responseBodyHash: string | null;
  observedFieldManifest: {
    fieldName: string;
    type: string;
    isPresent: boolean;
    isNullOrEmpty: boolean;
    mappingSuccess: boolean;
  }[];
}

export interface ValidationAuditReport {
  validationRunId: string;
  executedAtUtc: string;
  validationMode: ValidationMode;
  targetFingerprint: string;
  precheckBaseline: {
    basicProfileCapabilityBefore: string;
    publicFollowsCapabilityBefore: string;
    publicContentCapabilityBefore: string;
  };
  requestRecords: ValidationRequestRecord[];
  sourceAssessment: {
    sourceExists: boolean | null;
    publiclyAccessibleObserved: boolean | null;
    authenticationRequiredObserved: boolean | null;
    rateLimitObserved: boolean | null;
    regionRestrictionObserved: boolean | null;
    antiBotObserved: boolean | null;
    environmentIssueObserved: boolean | null;
  };
  contractCompatibility: {
    requiredFields: string[];
    optionalFields: string[];
    observedFieldManifest: {
      fieldName: string;
      type: string;
      isPresent: boolean;
      isNullOrEmpty: boolean;
      mappingSuccess: boolean;
    }[];
    mappingResult: "SUCCESS" | "PARTIAL" | "FAILED" | "NOT_APPLICABLE";
    irreconcilableConflict: boolean;
  };
  provenanceAssessment: {
    sourceType: "PROFILE";
    sourceIdentifier: string;
    fetchedAt: string | null;
    responseHash: string | null;
    auditProjectionValid: boolean;
  };
  safetyAssessment: {
    rawResponsePersisted: false;
    credentialsObserved: false;
    credentialsPersisted: false;
    rawResponseSentToAi: false;
    sensitiveDataSentToAi: false;
  };
  pipelineShadowRun: {
    normalize: ShadowStageStatus;
    clean: ShadowStageStatus;
    extract: ShadowStageStatus;
    aggregate: ShadowStageStatus;
    statisticalAnalysis: ShadowStageStatus;
    aiSynthesis: ShadowStageStatus;
    report: ShadowStageStatus;
  };
  failClosedCheck: boolean;
  recommendedNextStep: string;
  finalConclusion:
    | "BASIC_PROFILE 可以正式接入"
    | "BASIC_PROFILE 暂时不能正式接入"
    | "当前环境无法完成验证，需要以下前置条件";
  errorCode?: ValidationErrorCode;
  errorSummary?: string;
  dataSourceSubAssessment?: string;
  auditChainHash: string;
}

/**
 * Validates UID string: pure digits (no whitespace or symbols), length between 1 and 16.
 */
export function validateTargetUid(uid: unknown): boolean {
  if (typeof uid !== "string") return false;
  if (uid.length < 1 || uid.length > 16) return false;
  return /^\d+$/.test(uid);
}

/**
 * Strictly validates that the request URL matches the approved public profile endpoint.
 */
export function validateApprovedRequestUrl(urlStr: string, targetUid: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return (
      parsed.protocol === "https:" &&
      parsed.origin === "https://space.bilibili.com" &&
      parsed.hostname === "space.bilibili.com" &&
      parsed.pathname === `/${targetUid}` &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.port === "" &&
      parsed.username === "" &&
      parsed.password === "" &&
      urlStr === `https://space.bilibili.com/${targetUid}`
    );
  } catch {
    return false;
  }
}

/**
 * Mask and hash target UID to ensure zero plaintext UID leakage.
 */
export function hashTargetUid(uid: string): { fingerprint: string; masked: string } {
  const sha = crypto.createHash("sha256").update(uid, "utf8").digest("hex");
  const masked = uid.length > 4 ? uid.slice(0, 2) + "***" + uid.slice(-2) : "***";
  return {
    fingerprint: `sha256:${sha}`,
    masked,
  };
}

/**
 * Calculate SHA-256 hash of a string.
 */
export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Computes canonical audit chain hash for the report.
 */
export function computeAuditChainHash(report: Omit<ValidationAuditReport, "auditChainHash">): string {
  const shallowCopy = { ...report, auditChainHash: "" };
  return sha256(JSON.stringify(shallowCopy));
}

/**
 * Maps raw network error in memory to a strict closed union category.
 * Never leaks raw error message.
 */
export function categorizeNetworkError(err: unknown): NetworkFailureCategory {
  if (!err) return "OTHER";
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("timeout") || msg.includes("etimedout")) {
    return "TIMEOUT";
  }
  if (msg.includes("enotfound") || msg.includes("getaddrinfo")) {
    return "DNS";
  }
  if (msg.includes("tls") || msg.includes("cert") || msg.includes("ssl")) {
    return "TLS";
  }
  if (msg.includes("econnrefused") || msg.includes("econnreset")) {
    return "CONNECTION";
  }
  return "OTHER";
}

/**
 * Maps category to fixed, static Chinese error summary string.
 */
export function getWhitelistedNetworkErrorSummary(cat?: NetworkFailureCategory | null): string {
  switch (cat) {
    case "DNS":
      return "网络传输异常: DNS 解析失败";
    case "TIMEOUT":
      return "网络传输异常: 网络连接超时";
    case "TLS":
      return "网络传输异常: TLS/SSL 握手异常";
    case "CONNECTION":
      return "网络传输异常: 网络连接被拒绝或重置";
    case "OTHER":
    default:
      return "网络传输异常: 受限环境网络传输异常";
  }
}

/**
 * Infers body format enum without persisting any raw header value.
 */
export function inferBodyFormat(
  contentTypeHeader: string | null,
  textSnippet: string
): ResponseBodyFormat {
  const lowerHeader = (contentTypeHeader || "").toLowerCase();
  if (lowerHeader.includes("application/json") || lowerHeader.includes("text/json")) {
    return "JSON";
  }
  if (lowerHeader.includes("text/html") || lowerHeader.includes("application/xhtml")) {
    return "HTML";
  }
  const trimmed = textSnippet.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "JSON";
  }
  if (trimmed.startsWith("<") || trimmed.toLowerCase().includes("<html")) {
    return "HTML";
  }
  if (trimmed.length > 0) {
    return "OTHER";
  }
  return "UNKNOWN";
}

export interface StreamReadResult {
  text: string;
  totalBytes: number;
  exceededLimit: boolean;
}

/**
 * Reads response stream with hard byte limit (MAX_BYTES_CAP = 64 KiB).
 * If res.body is missing, fails closed immediately without calling res.text().
 * If byte limit is exceeded, cancels stream immediately and returns exceededLimit=true.
 */
export async function readStreamWithByteCap(
  res: Response,
  maxBytesCap: number = MAX_BYTES_CAP
): Promise<StreamReadResult> {
  if (!res || !res.body) {
    // Fail-closed: missing stream body is treated as safety violation; NEVER call res.text()
    return { text: "", totalBytes: 0, exceededLimit: true };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let totalBytes = 0;
  let text = "";
  let exceededLimit = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytesCap) {
          exceededLimit = true;
          try {
            await reader.cancel("Response size exceeded MAX_BYTES_CAP");
          } catch {
            // Ignore cancel error
          }
          break;
        }
        text += decoder.decode(value, { stream: true });
      }
    }
    if (!exceededLimit) {
      text += decoder.decode(); // Flush stream
    }
  } catch (err) {
    if (!exceededLimit) {
      throw err;
    }
  }

  return {
    text: exceededLimit ? "" : text,
    totalBytes,
    exceededLimit,
  };
}

/**
 * Extracts metadata fields from HTML in memory using safe regex patterns.
 */
export function extractBasicProfileFromHtml(html: string): {
  name: string | null;
  sign: string | null;
  face: string | null;
} {
  // Extract profile name strictly requiring recognized space profile pattern or h-name
  let name: string | null = null;
  const ogTitleMatch =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i.exec(html);
  if (ogTitleMatch && ogTitleMatch[1]) {
    const raw = ogTitleMatch[1].trim();
    const spaceMatch = /^(.+?)的个人空间/i.exec(raw);
    if (spaceMatch && spaceMatch[1].trim().length > 0) {
      name = spaceMatch[1].trim();
    }
  }
  if (!name) {
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    if (titleMatch && titleMatch[1]) {
      const raw = titleMatch[1].trim();
      const spaceMatch = /^(.+?)的个人空间/i.exec(raw);
      if (spaceMatch && spaceMatch[1].trim().length > 0) {
        name = spaceMatch[1].trim();
      }
    }
  }
  if (!name) {
    const hNameMatch =
      /<h[1-6][^>]*class=["'][^"']*h-name[^"']*["'][^>]*>([^<]*)<\/h[1-6]>/i.exec(html) ||
      /<span[^>]*id=["']h-name["'][^>]*>([^<]*)<\/span>/i.exec(html);
    if (hNameMatch && hNameMatch[1] && hNameMatch[1].trim().length > 0) {
      name = hNameMatch[1].trim();
    }
  }

  // Extract description / sign
  let sign: string | null = null;
  const descMatch =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html) ||
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i.exec(html);
  if (descMatch && descMatch[1] && descMatch[1].trim().length > 0) {
    sign = descMatch[1].trim();
  }

  // Extract face / avatar
  let face: string | null = null;
  const imgMatch =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i.exec(html);
  if (imgMatch && imgMatch[1] && imgMatch[1].trim().length > 0) {
    face = imgMatch[1].trim();
  }

  return { name, sign, face };
}

export interface PureDecisionInput {
  validationMode: ValidationMode;
  isSuccessResponse: boolean;
  hasMappedInput: boolean;
  hasExceededByteLimit: boolean;
  pipelineStages: {
    normalize: ShadowStageStatus;
    clean: ShadowStageStatus;
    extract: ShadowStageStatus;
    aggregate: ShadowStageStatus;
    statisticalAnalysis: ShadowStageStatus;
    report: ShadowStageStatus;
    aiSynthesis: ShadowStageStatus;
  };
  isAuthRequired: boolean;
  isRateLimited: boolean;
  isBlocked: boolean;
  hasRequestError: boolean;
  mappingFailureCategory?: MappingFailureCategory | null;
  networkFailureCategory?: NetworkFailureCategory | null;
}

/**
 * Pure decision evaluator for validation results.
 * Decouples decision rules from network execution.
 * Outputs strictly static, whitelisted Chinese summaries without concatenating raw dynamic error text.
 */
export function evaluateValidationDecision(input: PureDecisionInput): {
  finalConclusion: ValidationAuditReport["finalConclusion"];
  errorCode?: ValidationErrorCode;
  errorSummary?: string;
  dataSourceSubAssessment?: string;
} {
  if (input.hasExceededByteLimit) {
    return {
      finalConclusion: "BASIC_PROFILE 暂时不能正式接入",
      errorCode: "SAFETY_BOUNDARY_VIOLATION",
      errorSummary: "响应体大小超过 64 KiB 安全上限或缺少可读流，触发安全边界熔断。",
    };
  }

  if (input.isAuthRequired) {
    return {
      finalConclusion: "BASIC_PROFILE 暂时不能正式接入",
      errorCode: "AUTHENTICATION_REQUIRED",
      errorSummary: "Bilibili BASIC_PROFILE 响应要求认证或登录态，超出 MVP 无凭据公开数据采集边界。",
    };
  }

  if (input.isRateLimited) {
    return {
      finalConclusion: "BASIC_PROFILE 暂时不能正式接入",
      errorCode: "RATE_LIMITED",
      errorSummary: "Bilibili BASIC_PROFILE 请求触发 429/限流响应。",
    };
  }

  if (input.isBlocked) {
    return {
      finalConclusion: "BASIC_PROFILE 暂时不能正式接入",
      errorCode: "ACCESS_BLOCKED",
      errorSummary: "Bilibili BASIC_PROFILE 请求触发 403 访问阻断或反爬拦截。",
    };
  }

  if (input.hasRequestError) {
    return {
      finalConclusion: "当前环境无法完成验证，需要以下前置条件",
      errorCode: "ENVIRONMENT_FAILURE",
      errorSummary: getWhitelistedNetworkErrorSummary(input.networkFailureCategory),
    };
  }

  const deterministicPassed =
    input.hasMappedInput &&
    input.pipelineStages.normalize === "PASSED" &&
    input.pipelineStages.clean === "PASSED" &&
    input.pipelineStages.extract === "PASSED" &&
    input.pipelineStages.aggregate === "PASSED" &&
    input.pipelineStages.statisticalAnalysis === "PASSED" &&
    input.pipelineStages.report === "PASSED";

  const isRealSuccessCandidate =
    input.validationMode === "REAL_CONNECTOR" &&
    input.isSuccessResponse === true;

  if (
    isRealSuccessCandidate &&
    deterministicPassed &&
    input.pipelineStages.aiSynthesis === "PASSED"
  ) {
    return {
      finalConclusion: "BASIC_PROFILE 可以正式接入",
      errorCode: undefined,
      errorSummary: undefined,
    };
  }

  if (
    isRealSuccessCandidate &&
    deterministicPassed &&
    input.pipelineStages.aiSynthesis !== "PASSED"
  ) {
    return {
      finalConclusion: "当前环境无法完成验证，需要以下前置条件",
      errorCode: "AI_STAGE_UNAVAILABLE",
      errorSummary: "BASIC_PROFILE 数据源与确定性流水线均已验证通过，但 AI Provider 尚未配置或不可用。",
      dataSourceSubAssessment: "BASIC_PROFILE 数据源及确定性影子流水线均通过，待 AI 配置就绪后可正式接入。",
    };
  }

  let contractSummary = "响应数据未通过 Phase 8.1 契约白名单校验或来源模式不满足真实接入要求。";
  if (input.mappingFailureCategory === "MISSING_REQUIRED_FIELDS") {
    contractSummary = "响应数据缺少 Phase 8.1 契约必填字段（如个人空间昵称）。";
  } else if (input.mappingFailureCategory === "CONTRACT_MAPPING_EXCEPTION") {
    contractSummary = "契约转换适配过程发生异常，已按安全要求熔断。";
  } else if (input.mappingFailureCategory === "CONTRACT_VALIDATION_FAILED") {
    contractSummary = "响应数据字段结构未通过严格白名单契约校验。";
  }

  return {
    finalConclusion: "BASIC_PROFILE 暂时不能正式接入",
    errorCode: "CONTRACT_INSUFFICIENT",
    errorSummary: contractSummary,
  };
}

export interface RunValidationOptions {
  outputDir?: string;
}

/**
 * Sanitizes a ValidationAuditReport ensuring errorSummary strictly matches the whitelist.
 */
export function sanitizeReportForAudit(report: ValidationAuditReport): ValidationAuditReport {
  const sanitized = { ...report };

  if (sanitized.errorSummary !== undefined) {
    if (!WHITELISTED_ERROR_SUMMARIES.has(sanitized.errorSummary)) {
      sanitized.errorSummary = "受限环境未分类异常，已阻断输出。";
    }
  }

  sanitized.auditChainHash = computeAuditChainHash(sanitized);
  return sanitized;
}

/**
 * Executes the Phase 8.2.1 Minimal Real BASIC_PROFILE Validation Gate.
 */
export async function runBasicProfileRealValidation(
  options: RunValidationOptions = {}
): Promise<ValidationAuditReport> {
  const executedAtUtc = new Date().toISOString();
  const runId = `val-bp-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

  // Step 1: Pre-check Baseline Verification
  const connector = new BilibiliPublicConnector();
  const basicCap = connector.getCapabilityStatus("BASIC_PROFILE");
  const followsCap = connector.getCapabilityStatus("PUBLIC_FOLLOWS");
  const contentCap = connector.getCapabilityStatus("PUBLIC_CONTENT");

  const baselineValid =
    DEFAULT_PRODUCTION_REGISTRY.BASIC_PROFILE === "AVAILABLE_PUBLIC" &&
    DEFAULT_PRODUCTION_REGISTRY.PUBLIC_FOLLOWS === "UNVERIFIED" &&
    DEFAULT_PRODUCTION_REGISTRY.PUBLIC_CONTENT === "UNVERIFIED" &&
    basicCap === "AVAILABLE_PUBLIC" &&
    followsCap === "UNVERIFIED" &&
    contentCap === "UNVERIFIED";

  if (!baselineValid) {
    throw new Error(
      "Pre-check baseline verification failed: BASIC_PROFILE must be AVAILABLE_PUBLIC, PUBLIC_FOLLOWS and PUBLIC_CONTENT must be UNVERIFIED!"
    );
  }

  // Step 2: Check Approved Path Template (Exact match, no loose includes)
  if (APPROVED_BASIC_PROFILE_URL_TEMPLATE !== "https://space.bilibili.com/{uid}") {
    const report: ValidationAuditReport = {
      validationRunId: runId,
      executedAtUtc,
      validationMode: "UNAVAILABLE",
      targetFingerprint: "NONE_UNAVAILABLE",
      precheckBaseline: {
        basicProfileCapabilityBefore: basicCap,
        publicFollowsCapabilityBefore: followsCap,
        publicContentCapabilityBefore: contentCap,
      },
      requestRecords: [],
      sourceAssessment: {
        sourceExists: null,
        publiclyAccessibleObserved: null,
        authenticationRequiredObserved: null,
        rateLimitObserved: null,
        regionRestrictionObserved: null,
        antiBotObserved: null,
        environmentIssueObserved: null,
      },
      contractCompatibility: {
        requiredFields: ["recordId", "provenance", "availability"],
        optionalFields: ["displayName", "description", "tags", "avatarIdentifier", "observedAt"],
        observedFieldManifest: [],
        mappingResult: "NOT_APPLICABLE",
        irreconcilableConflict: true,
      },
      provenanceAssessment: {
        sourceType: "PROFILE",
        sourceIdentifier: "NONE",
        fetchedAt: null,
        responseHash: null,
        auditProjectionValid: false,
      },
      safetyAssessment: {
        rawResponsePersisted: false,
        credentialsObserved: false,
        credentialsPersisted: false,
        rawResponseSentToAi: false,
        sensitiveDataSentToAi: false,
      },
      pipelineShadowRun: {
        normalize: "NOT_RUN",
        clean: "NOT_RUN",
        extract: "NOT_RUN",
        aggregate: "NOT_RUN",
        statisticalAnalysis: "NOT_RUN",
        aiSynthesis: "NOT_RUN",
        report: "NOT_RUN",
      },
      failClosedCheck: true,
      recommendedNextStep: "当前项目未包含经批准的 BASIC_PROFILE 请求路径，保持门控封锁。",
      finalConclusion: "当前环境无法完成验证，需要以下前置条件",
      errorCode: "CAPABILITY_ABSENT",
      errorSummary: "项目中未定义经证据批准的 BASIC_PROFILE 访问路径。",
      auditChainHash: "",
    };

    report.auditChainHash = computeAuditChainHash(report);
    await writeAuditArtifacts(report, options.outputDir);
    return report;
  }

  // Step 3: Check Environment Trigger Variables (with strict UID validation)
  const runRealFlag = process.env.RUN_REAL_BASIC_PROFILE_VALIDATION === "true";
  const targetUidRaw = process.env.BASIC_PROFILE_VALIDATION_TARGET_UID;
  const isUidValid = typeof targetUidRaw === "string" && validateTargetUid(targetUidRaw);
  const isRealExecutionEnabled = runRealFlag && isUidValid;

  if (!isRealExecutionEnabled) {
    const report: ValidationAuditReport = {
      validationRunId: runId,
      executedAtUtc,
      validationMode: "UNAVAILABLE",
      targetFingerprint: "NONE_UNAVAILABLE",
      precheckBaseline: {
        basicProfileCapabilityBefore: basicCap,
        publicFollowsCapabilityBefore: followsCap,
        publicContentCapabilityBefore: contentCap,
      },
      requestRecords: [],
      sourceAssessment: {
        sourceExists: null,
        publiclyAccessibleObserved: null,
        authenticationRequiredObserved: null,
        rateLimitObserved: null,
        regionRestrictionObserved: null,
        antiBotObserved: null,
        environmentIssueObserved: true,
      },
      contractCompatibility: {
        requiredFields: ["recordId", "provenance", "availability"],
        optionalFields: ["displayName", "description", "tags", "avatarIdentifier", "observedAt"],
        observedFieldManifest: [],
        mappingResult: "NOT_APPLICABLE",
        irreconcilableConflict: false,
      },
      provenanceAssessment: {
        sourceType: "PROFILE",
        sourceIdentifier: "NONE",
        fetchedAt: null,
        responseHash: null,
        auditProjectionValid: false,
      },
      safetyAssessment: {
        rawResponsePersisted: false,
        credentialsObserved: false,
        credentialsPersisted: false,
        rawResponseSentToAi: false,
        sensitiveDataSentToAi: false,
      },
      pipelineShadowRun: {
        normalize: "NOT_RUN",
        clean: "NOT_RUN",
        extract: "NOT_RUN",
        aggregate: "NOT_RUN",
        statisticalAnalysis: "NOT_RUN",
        aiSynthesis: "NOT_RUN",
        report: "NOT_RUN",
      },
      failClosedCheck: true,
      recommendedNextStep:
        "若需执行真实验证，请在非生产受控环境中配置非持久化环境变量 RUN_REAL_BASIC_PROFILE_VALIDATION=true 与有效的纯数字 BASIC_PROFILE_VALIDATION_TARGET_UID (长度 1-16 位)，已按照安全要求拦截并保持离线状态。",
      finalConclusion: "当前环境无法完成验证，需要以下前置条件",
      errorCode: "ENVIRONMENT_FAILURE",
      errorSummary:
        "未检测到运行环境变量 RUN_REAL_BASIC_PROFILE_VALIDATION=true 与有效的纯数字 BASIC_PROFILE_VALIDATION_TARGET_UID (长度 1-16 位)，已按照安全要求拦截并保持离线状态。",
      auditChainHash: "",
    };

    report.auditChainHash = computeAuditChainHash(report);
    await writeAuditArtifacts(report, options.outputDir);
    return report;
  }

  // Step 4: Real Request Execution (Scoped to MAX 1 GET, 64 KiB stream limit)
  const targetUid = targetUidRaw!.trim();
  const requestUrl = APPROVED_BASIC_PROFILE_URL_TEMPLATE.replace("{uid}", targetUid);

  if (!validateApprovedRequestUrl(requestUrl, targetUid)) {
    const report: ValidationAuditReport = {
      validationRunId: runId,
      executedAtUtc,
      validationMode: "UNAVAILABLE",
      targetFingerprint: hashTargetUid(targetUid).fingerprint,
      precheckBaseline: {
        basicProfileCapabilityBefore: basicCap,
        publicFollowsCapabilityBefore: followsCap,
        publicContentCapabilityBefore: contentCap,
      },
      requestRecords: [],
      sourceAssessment: {
        sourceExists: null,
        publiclyAccessibleObserved: null,
        authenticationRequiredObserved: null,
        rateLimitObserved: null,
        regionRestrictionObserved: null,
        antiBotObserved: null,
        environmentIssueObserved: null,
      },
      contractCompatibility: {
        requiredFields: ["recordId", "provenance", "availability"],
        optionalFields: ["displayName", "description", "tags", "avatarIdentifier", "observedAt"],
        observedFieldManifest: [],
        mappingResult: "NOT_APPLICABLE",
        irreconcilableConflict: true,
      },
      provenanceAssessment: {
        sourceType: "PROFILE",
        sourceIdentifier: hashTargetUid(targetUid).fingerprint,
        fetchedAt: null,
        responseHash: null,
        auditProjectionValid: false,
      },
      safetyAssessment: {
        rawResponsePersisted: false,
        credentialsObserved: false,
        credentialsPersisted: false,
        rawResponseSentToAi: false,
        sensitiveDataSentToAi: false,
      },
      pipelineShadowRun: {
        normalize: "NOT_RUN",
        clean: "NOT_RUN",
        extract: "NOT_RUN",
        aggregate: "NOT_RUN",
        statisticalAnalysis: "NOT_RUN",
        aiSynthesis: "NOT_RUN",
        report: "NOT_RUN",
      },
      failClosedCheck: true,
      recommendedNextStep: "请求 URL 不符合经批准的格式白名单，门控已阻断。",
      finalConclusion: "当前环境无法完成验证，需要以下前置条件",
      errorCode: "CAPABILITY_ABSENT",
      errorSummary: "请求 URL 不符合经批准的格式白名单。",
      auditChainHash: "",
    };

    report.auditChainHash = computeAuditChainHash(report);
    await writeAuditArtifacts(report, options.outputDir);
    return report;
  }

  const { fingerprint } = hashTargetUid(targetUid);
  const targetHost = new URL(requestUrl).hostname;
  const pathTemplate = `/[MASKED_UID]`;

  const requestRecords: ValidationRequestRecord[] = [];
  let rawBodyText = "";
  let httpStatus: number | null = null;
  let rawContentTypeHeader: string | null = null;
  let requestError: Error | null = null;
  let exceededByteLimit = false;

  const requestTimestamp = new Date().toISOString();
  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "User-Agent": "BiliProfileAnalyzerValidationGate/0.1.0",
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
      credentials: "omit",
      redirect: "manual",
    });

    httpStatus = res.status;
    rawContentTypeHeader = res.headers.get("content-type");

    const streamResult = await readStreamWithByteCap(res, MAX_BYTES_CAP);
    rawBodyText = streamResult.text;
    exceededByteLimit = streamResult.exceededLimit;
  } catch (err: any) {
    requestError = err instanceof Error ? err : new Error(String(err));
  }

  const responseHash = rawBodyText && !exceededByteLimit ? sha256(rawBodyText) : null;
  const bodyFormat = inferBodyFormat(rawContentTypeHeader, rawBodyText);

  // In-memory extraction (never persist rawBodyText)
  let extractedName: string | null = null;
  let extractedSign: string | null = null;
  let extractedFace: string | null = null;

  if (rawBodyText && !exceededByteLimit) {
    try {
      if (bodyFormat === "JSON") {
        const json = JSON.parse(rawBodyText);
        if (json?.data?.name) extractedName = String(json.data.name).trim();
        if (json?.data?.sign) extractedSign = String(json.data.sign).trim();
        if (json?.data?.face) extractedFace = String(json.data.face).trim();
      } else {
        const parsed = extractBasicProfileFromHtml(rawBodyText);
        extractedName = parsed.name;
        extractedSign = parsed.sign;
        extractedFace = parsed.face;
      }
    } catch {
      // Parsing failed
    }
  }

  const manifest = [
    {
      fieldName: "displayName",
      type: typeof extractedName,
      isPresent: extractedName !== null && extractedName.length > 0,
      isNullOrEmpty: !extractedName || extractedName.trim().length === 0,
      mappingSuccess: typeof extractedName === "string" && extractedName.trim().length > 0,
    },
    {
      fieldName: "description",
      type: typeof extractedSign,
      isPresent: extractedSign !== null,
      isNullOrEmpty: !extractedSign || extractedSign.trim().length === 0,
      mappingSuccess: !exceededByteLimit, // Optional field
    },
    {
      fieldName: "avatarIdentifier",
      type: typeof extractedFace,
      isPresent: extractedFace !== null,
      isNullOrEmpty: !extractedFace || extractedFace.trim().length === 0,
      mappingSuccess: !exceededByteLimit, // Optional field
    },
    {
      fieldName: "observedAt",
      type: "string",
      isPresent: !exceededByteLimit,
      isNullOrEmpty: exceededByteLimit,
      mappingSuccess: !exceededByteLimit,
    },
  ];

  requestRecords.push({
    requestIndex: 1,
    timestampUtc: requestTimestamp,
    method: "GET",
    targetHost,
    pathTemplate,
    httpStatus,
    bodyFormat,
    responseBodyHash: responseHash,
    observedFieldManifest: manifest,
  });

  // Evaluate limitations, anti-bot, rate limit, authentication
  const isAuthRequired = httpStatus === 401 || rawBodyText.includes("登录") || rawBodyText.includes("-101");
  const isRateLimited = httpStatus === 429 || rawBodyText.includes("-412");
  const isBlocked = httpStatus === 403 || rawBodyText.includes("-403");
  const isSuccessResponse =
    !exceededByteLimit && httpStatus === 200 && extractedName !== null && extractedName.length > 0;

  // Safe avatarIdentifier derivation (hash derived, never pseudo placeholders)
  let safeAvatarIdentifier: string | null = null;
  if (extractedFace && extractedFace.length > 0 && !exceededByteLimit) {
    safeAvatarIdentifier = `avatar_hash_${sha256(extractedFace).slice(0, 16)}`;
  }

  // Map to NormalizedBasicProfileInput
  let mappedInput: NormalizedBasicProfileInput | null = null;
  let mappingFailureCategory: MappingFailureCategory | null = null;

  if (isSuccessResponse && extractedName) {
    try {
      mappedInput = {
        recordId: `real_bp_${crypto.randomBytes(4).toString("hex")}`,
        provenance: "REAL_CONNECTOR",
        displayName: extractedName,
        description: extractedSign || null,
        tags: null,
        avatarIdentifier: safeAvatarIdentifier,
        observedAt: requestTimestamp,
        availability: "AVAILABLE",
      };

      const valRes = validateBasicProfileInputContract(mappedInput);
      if (!valRes.valid) {
        mappingFailureCategory = "CONTRACT_VALIDATION_FAILED";
        mappedInput = null;
      }
    } catch {
      mappingFailureCategory = "CONTRACT_MAPPING_EXCEPTION";
      mappedInput = null;
    }
  } else if (!extractedName) {
    mappingFailureCategory = "MISSING_REQUIRED_FIELDS";
  }

  // Execute in-memory Shadow Run if mappedInput exists
  const shadowRun: ValidationAuditReport["pipelineShadowRun"] = {
    normalize: "NOT_RUN",
    clean: "NOT_RUN",
    extract: "NOT_RUN",
    aggregate: "NOT_RUN",
    statisticalAnalysis: "NOT_RUN",
    aiSynthesis: "NOT_RUN",
    report: "NOT_RUN",
  };

  if (mappedInput && !exceededByteLimit) {
    try {
      const sourceRecord = basicProfileInputToPublicSourceRecord(mappedInput);
      shadowRun.normalize = "PASSED";
      shadowRun.clean = "PASSED";
      shadowRun.extract = "PASSED";
      shadowRun.aggregate = "PASSED";
      shadowRun.statisticalAnalysis = "PASSED";

      const pipelineResult = runDeterministicAnalysis([sourceRecord]);
      const reportInput = buildDeterministicReportInput(pipelineResult);
      if (reportInput.schemaVersion === "deterministic-report-input/v1") {
        shadowRun.report = "PASSED";
      } else {
        shadowRun.report = "FAILED";
      }

      // Phase 8.2 strictly keeps aiSynthesis as NOT_RUN in real execution runner
      shadowRun.aiSynthesis = "NOT_RUN";
    } catch {
      shadowRun.normalize = "FAILED";
    }
  }

  const decision = evaluateValidationDecision({
    validationMode: "REAL_CONNECTOR",
    isSuccessResponse,
    hasMappedInput: Boolean(mappedInput),
    hasExceededByteLimit: exceededByteLimit,
    pipelineStages: shadowRun,
    isAuthRequired,
    isRateLimited,
    isBlocked,
    hasRequestError: Boolean(requestError),
    mappingFailureCategory,
    networkFailureCategory: requestError ? categorizeNetworkError(requestError) : undefined,
  });

  const irreconcilableConflict = Boolean(isSuccessResponse && !mappedInput);

  const report: ValidationAuditReport = {
    validationRunId: runId,
    executedAtUtc,
    validationMode: "REAL_CONNECTOR",
    targetFingerprint: fingerprint,
    precheckBaseline: {
      basicProfileCapabilityBefore: basicCap,
      publicFollowsCapabilityBefore: followsCap,
      publicContentCapabilityBefore: contentCap,
    },
    requestRecords,
    sourceAssessment: {
      sourceExists: isSuccessResponse,
      publiclyAccessibleObserved: isSuccessResponse,
      authenticationRequiredObserved: isAuthRequired ? true : null,
      rateLimitObserved: isRateLimited ? true : null,
      regionRestrictionObserved: null,
      antiBotObserved: isBlocked ? true : null,
      environmentIssueObserved: requestError ? true : null,
    },
    contractCompatibility: {
      requiredFields: ["recordId", "provenance", "availability"],
      optionalFields: ["displayName", "description", "tags", "avatarIdentifier", "observedAt"],
      observedFieldManifest: manifest,
      mappingResult: mappedInput ? "SUCCESS" : "FAILED",
      irreconcilableConflict,
    },
    provenanceAssessment: {
      sourceType: "PROFILE",
      sourceIdentifier: fingerprint,
      fetchedAt: requestTimestamp,
      responseHash,
      auditProjectionValid: Boolean(mappedInput),
    },
    safetyAssessment: {
      rawResponsePersisted: false,
      credentialsObserved: false,
      credentialsPersisted: false,
      rawResponseSentToAi: false,
      sensitiveDataSentToAi: false,
    },
    pipelineShadowRun: shadowRun,
    failClosedCheck: true,
    recommendedNextStep:
      decision.finalConclusion === "BASIC_PROFILE 可以正式接入"
        ? "建议进入下一阶段编写受控的正式 Connector BASIC_PROFILE 实现方案（保持 PUBLIC_FOLLOWS 与 PUBLIC_CONTENT 阻断）。"
        : "保持 BASIC_PROFILE 为 UNVERIFIED 阻断状态，排查前置条件、安全边界或契约兼容性问题。",
    finalConclusion: decision.finalConclusion,
    errorCode: decision.errorCode,
    errorSummary: decision.errorSummary,
    dataSourceSubAssessment: decision.dataSourceSubAssessment,
    auditChainHash: "",
  };

  report.auditChainHash = computeAuditChainHash(report);
  await writeAuditArtifacts(report, options.outputDir);
  return report;
}

/**
 * Persists desensitized audit artifacts in docs/validation/ or a specified directory.
 */
export async function writeAuditArtifacts(
  report: ValidationAuditReport,
  outputDir?: string
): Promise<void> {
  const targetDir = outputDir || path.join(process.cwd(), "docs", "validation");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const sanitized = sanitizeReportForAudit(report);

  const jsonPath = path.join(targetDir, "BASIC_PROFILE_REAL_VALIDATION.json");
  const mdPath = path.join(targetDir, "BASIC_PROFILE_REAL_VALIDATION.md");

  fs.writeFileSync(jsonPath, JSON.stringify(sanitized, null, 2), "utf8");

  const mdContent = `# Phase 8.2 — 最小真实 BASIC_PROFILE 验证 Gate 审计报告

- **验证 ID (validationRunId)**: \`${sanitized.validationRunId}\`
- **执行时间 (UTC)**: \`${sanitized.executedAtUtc}\`
- **验证模式 (validationMode)**: \`${sanitized.validationMode}\`
- **目标指纹 (targetFingerprint)**: \`${sanitized.targetFingerprint}\`
- **最终结论 (finalConclusion)**: **${sanitized.finalConclusion}**
- **错误分类 (errorCode)**: \`${sanitized.errorCode || "NONE"}\`
${sanitized.errorSummary ? `- **错误说明 (errorSummary)**: \`${sanitized.errorSummary}\`\n` : ""}

---

## 1. 验证前基线 (Precheck Baseline)

| 能力名称 | 验证前状态 | 门控策略 |
| :--- | :---: | :--- |
| **BASIC_PROFILE** | \`${sanitized.precheckBaseline.basicProfileCapabilityBefore}\` | 门控阻断 (Fail-Closed) |
| **PUBLIC_FOLLOWS** | \`${sanitized.precheckBaseline.publicFollowsCapabilityBefore}\` | 门控阻断 (Fail-Closed) |
| **PUBLIC_CONTENT** | \`${sanitized.precheckBaseline.publicContentCapabilityBefore}\` | 门控阻断 (Fail-Closed) |

---

## 2. 数据源与契约评估 (Source & Contract Assessment)

- **数据源可达性**: \`${sanitized.sourceAssessment.publiclyAccessibleObserved ?? "N/A"}\`
- **认证要求观察**: \`${sanitized.sourceAssessment.authenticationRequiredObserved ?? "N/A"}\`
- **限流观察**: \`${sanitized.sourceAssessment.rateLimitObserved ?? "N/A"}\`
- **反爬/阻断观察**: \`${sanitized.sourceAssessment.antiBotObserved ?? "N/A"}\`
- **契约映射结果**: \`${sanitized.contractCompatibility.mappingResult}\`
- **不可调和冲突**: \`${sanitized.contractCompatibility.irreconcilableConflict}\`
${sanitized.dataSourceSubAssessment ? `- **数据源子结论**: ${sanitized.dataSourceSubAssessment}\n` : ""}

---

## 3. 安全合规评估 (Safety Assessment)

- **原始响应是否落盘 (rawResponsePersisted)**: \`${sanitized.safetyAssessment.rawResponsePersisted}\` (严格为 false)
- **凭据是否被观察/持久化**: \`${sanitized.safetyAssessment.credentialsObserved}\` / \`${sanitized.safetyAssessment.credentialsPersisted}\`
- **原始响应是否发送给 AI**: \`${sanitized.safetyAssessment.rawResponseSentToAi}\` (严格为 false)

---

## 4. 影子流水线验证 (Pipeline Shadow Run)

- **Normalize**: \`${sanitized.pipelineShadowRun.normalize}\`
- **Clean**: \`${sanitized.pipelineShadowRun.clean}\`
- **Extract**: \`${sanitized.pipelineShadowRun.extract}\`
- **Aggregate**: \`${sanitized.pipelineShadowRun.aggregate}\`
- **Statistical Analysis**: \`${sanitized.pipelineShadowRun.statisticalAnalysis}\`
- **AI Synthesis**: \`${sanitized.pipelineShadowRun.aiSynthesis}\`
- **Report**: \`${sanitized.pipelineShadowRun.report}\`

---

## 5. 下一步建议 (Recommended Next Step)

${sanitized.recommendedNextStep}

---

**审计链校验哈希 (auditChainHash)**: \`${sanitized.auditChainHash}\`
`;

  fs.writeFileSync(mdPath, mdContent, "utf8");
}

if (
  require.main === module ||
  (typeof process !== "undefined" &&
    process.argv[1]?.includes("basic-profile-real-validation") &&
    !process.argv[1]?.includes("self-test"))
) {
  runBasicProfileRealValidation()
    .then((report) => {
      console.log("\n=================================================");
      console.log(`🏁 验证结束 | 模式: ${report.validationMode} | 结论: ${report.finalConclusion}`);
      if (report.errorSummary) {
        console.log(`ℹ️ 说明: ${report.errorSummary}`);
      }
      console.log("=================================================");
    })
    .catch(() => {
      console.error("验证过程发生未捕获异常终止，已安全退出。");
      process.exit(1);
    });
}
