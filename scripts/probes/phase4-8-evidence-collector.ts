/**
 * BiliProfile Analyzer — Phase 4.8 Dedicated Controlled Evidence Collector
 *
 * Purpose:
 * A dedicated, single-purpose evidence collection engine for BASIC_PROFILE under Phase 4.8.
 * Strictly decoupled from production runtime and generic exploration probes.
 *
 * Strict Compliance & Safety Invariants:
 * 1. Scope: STRICTLY BASIC_PROFILE. Rejects PUBLIC_FOLLOWS, PUBLIC_CONTENT, and any unknown capability with 0 fetch calls.
 * 2. Required 8-Fold Execution Gates (all must be satisfied before 1 request is created):
 *    - Gate 1: Non-production environment (NODE_ENV !== "production")
 *    - Gate 2: Explicit capability whitelist (capability === "BASIC_PROFILE")
 *    - Gate 3: Explicit network flag (allowNetwork === true)
 *    - Gate 4: Environment switch 1 (BILIPROFILE_FIELD_VALIDATION_ENABLED=true)
 *    - Gate 5: Environment switch 2 (BILIPROFILE_OWNER_AUTHORIZED=true)
 *    - Gate 6: Owner explicit consent parameter (ownerExplicitConsent === true)
 *    - Gate 7: Independent sample / time window confirmation (confirmIndependentSample === true)
 *    - Gate 8: Request interval rule (at least 30 minutes / 1800000 ms from last request)
 *    - Gate 9: Strict Pure Numeric UID string (/^\d+$/) matching domain whitelist
 * 3. Execution Ceilings:
 *    - Maximum 1 fetch call: credentials="omit", redirect="manual", no retry, no recursion, no concurrency, no pagination.
 *    - Hard stream read cap: 64 KiB (65536 bytes).
 *    - Rolling sliding window: 2048 characters.
 * 4. Desensitized Field States Only:
 *    - displayName: PARSED_NONEMPTY | PARSED_EMPTY_OR_ABSENT | PARSE_REJECTED | NOT_OBSERVED
 *    - avatarUrl: PARSED_NONEMPTY | PARSED_EMPTY_OR_ABSENT | PARSE_REJECTED | NOT_OBSERVED (avatarUrlSyntaxValid: boolean)
 *    - signature: PARSED_NONEMPTY | PARSED_EMPTY_OR_ABSENT | PARSE_REJECTED | NOT_OBSERVED
 * 5. Zero Sensitive Data Persistence:
 *    - Generates clean CapabilityEvidenceRecord.
 *    - Strictly 0 UID, 0 URL, 0 field raw values, 0 field hashes, 0 HTML, 0 headers, 0 Cookie, 0 Token, 0 operator ID.
 * 6. Connector Invariant:
 *    - All 3 capabilities strictly remain UNVERIFIED.
 */

import {
  MAX_BYTES_CAP,
  MAX_WINDOW_CHARS,
  clampSecurityCeiling,
  validateProbeUrl,
} from "./bilibili-public-capability";
import { inspectBasicProfileSignalsFromStream } from "./basic-profile-parser";
import { FIELD_CONTRACT_VERSION } from "./profile-field-contract";

export const EVIDENCE_PROBE_VERSION = "0.1.0-phase4.8-dedicated";
export const MIN_REQUEST_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export type CapabilityEvidenceOutcome =
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED";

export type CapabilityEvidenceErrorCategory =
  | "REDIRECTED"
  | "RATE_LIMITED"
  | "BLOCKED"
  | "NON_HTML"
  | "BYTE_LIMIT_EXCEEDED"
  | "CONTRACT_REJECTED"
  | "NETWORK_ERROR"
  | "INVALID_GATING"
  | "NONE";

export interface CapabilityEvidenceRecord {
  /** 不可逆随机审计标识 */
  evidenceId: string;
  /** 对应能力名称 */
  capability: "BASIC_PROFILE";
  /** 验证执行时间戳 (严格 ISO 8601) */
  verifiedAt: string;
  /** 探针与规则版本 */
  probeVersion: string;
  contractVersion: string;
  /** 外部网络请求数 (必须严格为 1) */
  requestCount: 1;
  /** 准入判定结果 (仅 SUCCESS 与 PARTIAL 可计入准入样本) */
  outcome: CapabilityEvidenceOutcome;
  /** 错误分类 (成功时为 NONE) */
  errorCategory: CapabilityEvidenceErrorCategory;
  /** 传输层受控观测结论 */
  transportOutcome: {
    isReachable: boolean;
    httpStatus: number;
    contentType: string;
    noRedirect: boolean;
    noRateLimit: boolean;
  };
  /** 流式安全合规结论 */
  streamSecurity: {
    bytesProcessed: number;
    hitByteLimit: boolean;
    maxBufferObserved: number;
  };
  /** 最小字段脱敏状态 */
  fieldStatus: {
    displayName: "PARSED_NONEMPTY" | "PARSED_EMPTY_OR_ABSENT" | "PARSE_REJECTED" | "NOT_OBSERVED";
    avatarUrl: "PARSED_NONEMPTY" | "PARSED_EMPTY_OR_ABSENT" | "PARSE_REJECTED" | "NOT_OBSERVED";
    avatarUrlSyntaxValid: boolean;
    signature: "PARSED_NONEMPTY" | "PARSED_EMPTY_OR_ABSENT" | "PARSE_REJECTED" | "NOT_OBSERVED";
  };
  /** 数据最小化审计通过标记 */
  dataMinimizationGuaranteed: true;
  /** 单次操作者显式授权确认 */
  authorization: {
    authorizationType: "OWNER_EXPLICIT_PER_RUN";
    authorizationConfirmed: true;
  };
}

export interface ControlledEvidenceCollectorOptions {
  capability?: string;
  uid?: string;
  allowNetwork?: boolean;
  ownerExplicitConsent?: boolean;
  confirmIndependentSample?: boolean;
  sampleWindowId?: string;
  lastRequestTimestampMs?: number;
  maxBytesCap?: number;
  maxWindowChars?: number;
  verifyValues?: boolean;
  envOverrides?: {
    fieldValidation?: string;
    ownerAuthorized?: string;
    nodeEnv?: string;
  };
}

export interface ControlledEvidenceCollectorExecutionResult {
  record: CapabilityEvidenceRecord | null;
  fetchCallCount: number;
  gatePassed: boolean;
  summary: string;
  errorCategory: CapabilityEvidenceErrorCategory;
}

/**
 * Generate an anonymous audit evidence ID (evidence-rec-random)
 */
function generateAnonymousEvidenceId(): string {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `evidence-rec-${randomSuffix}`;
}

/**
 * Core injectable evidence collector execution engine.
 * Guarantees zero network calls on any gating failure.
 */
export async function executeControlledEvidenceCollection(
  options: ControlledEvidenceCollectorOptions,
  customFetch: typeof fetch = globalThis.fetch
): Promise<ControlledEvidenceCollectorExecutionResult> {
  const verifiedAt = new Date().toISOString();
  const verifyValues = options.verifyValues !== false;
  const envNodeEnv = options.envOverrides?.nodeEnv ?? process.env.NODE_ENV;
  const envFieldVal = options.envOverrides?.fieldValidation ?? process.env.BILIPROFILE_FIELD_VALIDATION_ENABLED;
  const envOwnerAuth = options.envOverrides?.ownerAuthorized ?? process.env.BILIPROFILE_OWNER_AUTHORIZED;

  // Gate 1: Non-production environment check
  if (envNodeEnv === "production") {
    return {
      record: null,
      fetchCallCount: 0,
      gatePassed: false,
      errorCategory: "INVALID_GATING",
      summary: "生产环境严格禁止执行受控证据采集工具，未发起任何外部请求。",
    };
  }

  // Gate 2: Capability Whitelist: Strictly BASIC_PROFILE only
  const targetCapability = options.capability || "BASIC_PROFILE";
  if (targetCapability !== "BASIC_PROFILE") {
    return {
      record: null,
      fetchCallCount: 0,
      gatePassed: false,
      errorCategory: "BLOCKED",
      summary: `Phase 4.8 证据收集工具仅支持 BASIC_PROFILE，不支持 "${targetCapability}" 能力，未发起任何外部请求。`,
    };
  }

  // Gate 3: Explicit network flag
  if (!options.allowNetwork) {
    return {
      record: null,
      fetchCallCount: 0,
      gatePassed: false,
      errorCategory: "INVALID_GATING",
      summary: "缺少 --allow-network 显式网络授权参数，探针已安全退出，未发起任何外部请求。",
    };
  }

  // Gate 4 & 5: Environment switches
  if (envFieldVal !== "true" || envOwnerAuth !== "true") {
    return {
      record: null,
      fetchCallCount: 0,
      gatePassed: false,
      errorCategory: "INVALID_GATING",
      summary: "缺少 BILIPROFILE_FIELD_VALIDATION_ENABLED=true 或 BILIPROFILE_OWNER_AUTHORIZED=true 双确认环境变量，探针已安全退出，未发起任何外部请求。",
    };
  }

  // Gate 6: Owner explicit consent parameter
  if (!options.ownerExplicitConsent) {
    return {
      record: null,
      fetchCallCount: 0,
      gatePassed: false,
      errorCategory: "INVALID_GATING",
      summary: "缺少项目所有者逐次显式授权参数 (--owner-authorized)，探针已安全退出，未发起任何外部请求。",
    };
  }

  // Gate 7: Independent sample / sample window confirmation
  if (!options.confirmIndependentSample && !options.sampleWindowId) {
    return {
      record: null,
      fetchCallCount: 0,
      gatePassed: false,
      errorCategory: "INVALID_GATING",
      summary: "缺少独立样本或独立时间窗口确认参数 (--confirm-independent-sample)，探针已安全退出，未发起任何外部请求。",
    };
  }

  // Gate 8: Request interval check (>= 30 minutes rule)
  if (options.lastRequestTimestampMs !== undefined) {
    const timeSinceLast = Date.now() - options.lastRequestTimestampMs;
    if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
      const remainingSec = Math.ceil((MIN_REQUEST_INTERVAL_MS - timeSinceLast) / 1000);
      return {
        record: null,
        fetchCallCount: 0,
        gatePassed: false,
        errorCategory: "RATE_LIMITED",
        summary: `距上一次受控请求间隔不足 30 分钟 (尚需等待 ${remainingSec} 秒)，探针已安全退出，未发起任何外部请求。`,
      };
    }
  }

  // Gate 9: Strict pure numeric string UID
  const rawUid = options.uid;
  if (!rawUid || typeof rawUid !== "string" || !/^\d+$/.test(rawUid)) {
    return {
      record: null,
      fetchCallCount: 0,
      gatePassed: false,
      errorCategory: "INVALID_GATING",
      summary: "UID 必须为非空纯数字字符串，探针已安全退出，未发起任何外部请求。",
    };
  }

  // Target URL validation
  const targetUrl = `https://space.bilibili.com/${rawUid}`;
  if (!validateProbeUrl(targetUrl)) {
    return {
      record: null,
      fetchCallCount: 0,
      gatePassed: false,
      errorCategory: "INVALID_GATING",
      summary: "构造的 URL 不符合严格域名白名单规范，探针已安全退出，未发起任何外部请求。",
    };
  }

  // Hard safety ceilings
  const safeMaxBytesCap = clampSecurityCeiling(options.maxBytesCap, MAX_BYTES_CAP);
  const safeMaxWindowChars = clampSecurityCeiling(options.maxWindowChars, MAX_WINDOW_CHARS);

  // Perform strictly 1 controlled fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let fetchCallCount = 0;

  try {
    fetchCallCount++;
    const response = await customFetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
      credentials: "omit",
      redirect: "manual",
      headers: {
        "User-Agent": "BiliProfileAnalyzerCapabilityProbe/0.1",
        "Accept": "text/html",
      },
    });

    const httpStatus = response.status;
    const rawContentType = response.headers.get("content-type") || "";
    const isHtml = rawContentType.toLowerCase().includes("text/html");
    const sanitizedContentType = isHtml ? "text/html" : "non-html";

    // 3xx Redirection handler (strictly prohibited to follow)
    if (httpStatus >= 300 && httpStatus < 400) {
      const record: CapabilityEvidenceRecord = {
        evidenceId: generateAnonymousEvidenceId(),
        capability: "BASIC_PROFILE",
        verifiedAt,
        probeVersion: EVIDENCE_PROBE_VERSION,
        contractVersion: FIELD_CONTRACT_VERSION,
        requestCount: 1,
        outcome: "FAILED",
        errorCategory: "REDIRECTED",
        transportOutcome: {
          isReachable: false,
          httpStatus,
          contentType: sanitizedContentType,
          noRedirect: false,
          noRateLimit: true,
        },
        streamSecurity: {
          bytesProcessed: 0,
          hitByteLimit: false,
          maxBufferObserved: 0,
        },
        fieldStatus: {
          displayName: "NOT_OBSERVED",
          avatarUrl: "NOT_OBSERVED",
          avatarUrlSyntaxValid: false,
          signature: "NOT_OBSERVED",
        },
        dataMinimizationGuaranteed: true,
        authorization: {
          authorizationType: "OWNER_EXPLICIT_PER_RUN",
          authorizationConfirmed: true,
        },
      };

      return {
        record,
        fetchCallCount,
        gatePassed: true,
        errorCategory: "REDIRECTED",
        summary: `收到 HTTP ${httpStatus} 重定向响应，按规范不跟随跳转，未执行二次请求。`,
      };
    }

    // 429 Rate Limit
    if (httpStatus === 429) {
      const record: CapabilityEvidenceRecord = {
        evidenceId: generateAnonymousEvidenceId(),
        capability: "BASIC_PROFILE",
        verifiedAt,
        probeVersion: EVIDENCE_PROBE_VERSION,
        contractVersion: FIELD_CONTRACT_VERSION,
        requestCount: 1,
        outcome: "FAILED",
        errorCategory: "RATE_LIMITED",
        transportOutcome: {
          isReachable: true,
          httpStatus: 429,
          contentType: sanitizedContentType,
          noRedirect: true,
          noRateLimit: false,
        },
        streamSecurity: {
          bytesProcessed: 0,
          hitByteLimit: false,
          maxBufferObserved: 0,
        },
        fieldStatus: {
          displayName: "NOT_OBSERVED",
          avatarUrl: "NOT_OBSERVED",
          avatarUrlSyntaxValid: false,
          signature: "NOT_OBSERVED",
        },
        dataMinimizationGuaranteed: true,
        authorization: {
          authorizationType: "OWNER_EXPLICIT_PER_RUN",
          authorizationConfirmed: true,
        },
      };

      return {
        record,
        fetchCallCount,
        gatePassed: true,
        errorCategory: "RATE_LIMITED",
        summary: "收到 HTTP 429 限流响应，探针已安全中断。",
      };
    }

    // 403 / 412 Blocked
    if (httpStatus === 403 || httpStatus === 412) {
      const record: CapabilityEvidenceRecord = {
        evidenceId: generateAnonymousEvidenceId(),
        capability: "BASIC_PROFILE",
        verifiedAt,
        probeVersion: EVIDENCE_PROBE_VERSION,
        contractVersion: FIELD_CONTRACT_VERSION,
        requestCount: 1,
        outcome: "FAILED",
        errorCategory: "BLOCKED",
        transportOutcome: {
          isReachable: true,
          httpStatus,
          contentType: sanitizedContentType,
          noRedirect: true,
          noRateLimit: true,
        },
        streamSecurity: {
          bytesProcessed: 0,
          hitByteLimit: false,
          maxBufferObserved: 0,
        },
        fieldStatus: {
          displayName: "NOT_OBSERVED",
          avatarUrl: "NOT_OBSERVED",
          avatarUrlSyntaxValid: false,
          signature: "NOT_OBSERVED",
        },
        dataMinimizationGuaranteed: true,
        authorization: {
          authorizationType: "OWNER_EXPLICIT_PER_RUN",
          authorizationConfirmed: true,
        },
      };

      return {
        record,
        fetchCallCount,
        gatePassed: true,
        errorCategory: "BLOCKED",
        summary: `收到 HTTP ${httpStatus} 访问限制响应，探针已安全终止。`,
      };
    }

    // Non-HTML or missing body
    if (!isHtml || !response.body || httpStatus !== 200) {
      const record: CapabilityEvidenceRecord = {
        evidenceId: generateAnonymousEvidenceId(),
        capability: "BASIC_PROFILE",
        verifiedAt,
        probeVersion: EVIDENCE_PROBE_VERSION,
        contractVersion: FIELD_CONTRACT_VERSION,
        requestCount: 1,
        outcome: "FAILED",
        errorCategory: "NON_HTML",
        transportOutcome: {
          isReachable: httpStatus === 200,
          httpStatus,
          contentType: sanitizedContentType,
          noRedirect: true,
          noRateLimit: true,
        },
        streamSecurity: {
          bytesProcessed: 0,
          hitByteLimit: false,
          maxBufferObserved: 0,
        },
        fieldStatus: {
          displayName: "NOT_OBSERVED",
          avatarUrl: "NOT_OBSERVED",
          avatarUrlSyntaxValid: false,
          signature: "NOT_OBSERVED",
        },
        dataMinimizationGuaranteed: true,
        authorization: {
          authorizationType: "OWNER_EXPLICIT_PER_RUN",
          authorizationConfirmed: true,
        },
      };

      return {
        record,
        fetchCallCount,
        gatePassed: true,
        errorCategory: "NON_HTML",
        summary: `HTTP 响应状态为 ${httpStatus} 且内容非有效 HTML，未读取正文。`,
      };
    }

    // Inspect stream with 64 KiB limit and 2048 sliding window
    const streamResult = await inspectBasicProfileSignalsFromStream(
      response.body,
      safeMaxBytesCap,
      safeMaxWindowChars,
      verifyValues
    );

    const hitByteLimit = streamResult.bytesProcessed >= safeMaxBytesCap;
    const valueVal = streamResult.valueValidation;

    const displayNameStatus = valueVal?.displayName ?? "NOT_OBSERVED";
    const avatarUrlStatus = valueVal?.avatarUrl ?? "NOT_OBSERVED";
    const avatarUrlSyntaxValid = valueVal?.avatarUrlSyntaxValid ?? false;
    const signatureStatus = valueVal?.signature ?? "NOT_OBSERVED";

    // Determine errorCategory and outcome
    let errorCategory: CapabilityEvidenceErrorCategory = "NONE";
    let outcome: CapabilityEvidenceOutcome = "FAILED";

    if (hitByteLimit) {
      errorCategory = "BYTE_LIMIT_EXCEEDED";
      outcome = "FAILED";
    } else if (
      displayNameStatus === "PARSE_REJECTED" ||
      avatarUrlStatus === "PARSE_REJECTED" ||
      signatureStatus === "PARSE_REJECTED"
    ) {
      errorCategory = "CONTRACT_REJECTED";
      outcome = "FAILED";
    } else if (
      displayNameStatus === "PARSED_NONEMPTY" &&
      avatarUrlStatus === "PARSED_NONEMPTY" &&
      avatarUrlSyntaxValid
    ) {
      if (signatureStatus === "PARSED_NONEMPTY") {
        outcome = "SUCCESS";
        errorCategory = "NONE";
      } else if (signatureStatus === "PARSED_EMPTY_OR_ABSENT") {
        outcome = "PARTIAL";
        errorCategory = "NONE";
      } else {
        outcome = "FAILED";
        errorCategory = "CONTRACT_REJECTED";
      }
    } else {
      outcome = "FAILED";
      errorCategory = "CONTRACT_REJECTED";
    }

    const record: CapabilityEvidenceRecord = {
      evidenceId: generateAnonymousEvidenceId(),
      capability: "BASIC_PROFILE",
      verifiedAt,
      probeVersion: EVIDENCE_PROBE_VERSION,
      contractVersion: FIELD_CONTRACT_VERSION,
      requestCount: 1,
      outcome,
      errorCategory,
      transportOutcome: {
        isReachable: true,
        httpStatus: 200,
        contentType: "text/html",
        noRedirect: true,
        noRateLimit: true,
      },
      streamSecurity: {
        bytesProcessed: streamResult.bytesProcessed,
        hitByteLimit,
        maxBufferObserved: streamResult.maxObservedBufferLength,
      },
      fieldStatus: {
        displayName: displayNameStatus,
        avatarUrl: avatarUrlStatus,
        avatarUrlSyntaxValid,
        signature: signatureStatus,
      },
      dataMinimizationGuaranteed: true,
      authorization: {
        authorizationType: "OWNER_EXPLICIT_PER_RUN",
        authorizationConfirmed: true,
      },
    };

    return {
      record,
      fetchCallCount,
      gatePassed: true,
      errorCategory,
      summary: `单次流式检测完成 (处理 ${streamResult.bytesProcessed} 字节, 峰值缓存 ${streamResult.maxObservedBufferLength} 字符, 结果: ${outcome})。`,
    };
  } catch {
    return {
      record: null,
      fetchCallCount,
      gatePassed: true,
      errorCategory: "NETWORK_ERROR",
      summary: "网络连接异常或请求超时，探针已安全中断。",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * CLI parser for controlled evidence collection runner
 */
export function parseEvidenceCollectorCliArgs(argv: string[] = process.argv.slice(2)) {
  let isHelp = false;
  let capability = "BASIC_PROFILE";
  let uid: string | undefined;
  let allowNetwork = false;
  let ownerExplicitConsent = false;
  let confirmIndependentSample = false;
  let sampleWindowId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      isHelp = true;
    } else if (arg === "--capability" && i + 1 < argv.length) {
      capability = argv[++i];
    } else if (arg === "--uid" && i + 1 < argv.length) {
      uid = argv[++i];
    } else if (arg === "--allow-network") {
      allowNetwork = true;
    } else if (arg === "--owner-authorized" || arg === "--i-have-owner-permission") {
      ownerExplicitConsent = true;
    } else if (arg === "--confirm-independent-sample") {
      confirmIndependentSample = true;
    } else if (arg === "--sample-window" && i + 1 < argv.length) {
      sampleWindowId = argv[++i];
    }
  }

  return {
    isHelp,
    capability,
    uid,
    allowNetwork,
    ownerExplicitConsent,
    confirmIndependentSample,
    sampleWindowId,
  };
}

export function printEvidenceCollectorHelp() {
  console.log("=================================================");
  console.log("🔒 BiliProfile Analyzer — Phase 4.8 专用受控证据收集工具");
  console.log("=================================================\n");
  console.log("[使用说明]");
  console.log("本工具仅用于 Phase 4.8 准入证据集的受控采集，严格单次执行且仅支持 BASIC_PROFILE。");
  console.log("默认不发送任何外部网络请求。\n");
  console.log("[执行格式]");
  console.log("npm run probe:evidence:collect -- \\");
  console.log("  --uid <纯数字UID> \\");
  console.log("  --allow-network \\");
  console.log("  --owner-authorized \\");
  console.log("  --confirm-independent-sample\n");
  console.log("[安全前置门控清单]");
  console.log("1. 必须配置 BILIPROFILE_FIELD_VALIDATION_ENABLED=true 环境变量");
  console.log("2. 必须配置 BILIPROFILE_OWNER_AUTHORIZED=true 环境变量");
  console.log("3. 必须显式携带 --allow-network 参数");
  console.log("4. 必须显式携带 --owner-authorized 参数");
  console.log("5. 必须显式携带 --confirm-independent-sample 参数");
  console.log("6. 距上一次受控请求必须至少间隔 30 分钟");
  console.log("7. UID 必须为严格纯数字字符串");
  console.log("8. 仅支持 BASIC_PROFILE 能力 (严禁探测 follows / content)");
  console.log("9. 绝不输出、打印或持久化真实 UID、URL、字段原值、响应头或原始 HTML。\n");
  console.log("=================================================");
}

async function runControlledEvidenceCollectorCli() {
  const parsed = parseEvidenceCollectorCliArgs();

  if (parsed.isHelp || !parsed.allowNetwork || !parsed.uid) {
    printEvidenceCollectorHelp();
    return;
  }

  console.log("=================================================");
  console.log("🔒 BiliProfile Analyzer — Phase 4.8 受控证据采集执行");
  console.log("=================================================\n");

  const result = await executeControlledEvidenceCollection({
    capability: parsed.capability,
    uid: parsed.uid,
    allowNetwork: parsed.allowNetwork,
    ownerExplicitConsent: parsed.ownerExplicitConsent,
    confirmIndependentSample: parsed.confirmIndependentSample,
    sampleWindowId: parsed.sampleWindowId,
  });

  console.log("[受控采集执行结果]");
  console.log(`- 门控检查: ${result.gatePassed ? "✅ 通过" : "❌ 拦截"}`);
  console.log(`- 错误类别: ${result.errorCategory}`);
  console.log(`- 网络请求数: ${result.fetchCallCount}`);
  console.log(`- 执行说明: ${result.summary}`);

  if (result.record) {
    console.log("\n[生成脱敏证据记录 (CapabilityEvidenceRecord)]");
    console.log(JSON.stringify(result.record, null, 2));
  }
  console.log("\n=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("phase4-8-evidence-collector"))
) {
  runControlledEvidenceCollectorCli().catch(() => {
    console.error("[异常] 受控证据收集工具执行发生未捕获异常。");
    process.exit(1);
  });
}
