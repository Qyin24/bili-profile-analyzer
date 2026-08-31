/**
 * BiliProfile Analyzer — Controlled Live Basic Profile Probe (Phase 4.4e / 4.6 / 4.7 Hardened)
 *
 * Strict Execution Gates & Invariants:
 * 1. Requires explicit --allow-network flag AND valid pure-digit UID string.
 * 2. Refuses execution in production environment (NODE_ENV === "production").
 * 3. Standalone dev probe under scripts/probes; NEVER imported by application runtime.
 * 4. UID is handled strictly as string, NEVER converted to JS number.
 * 5. Maximum 1 fetch call: credentials="omit", redirect="manual", no retry, no recursion.
 * 6. Non-HTML, 3xx redirects, 403, 412, 429, timeouts are safely halted with desensitized status.
 * 7. Max stream read 64 KiB, sliding window max 2048 chars, clamped to safe ceilings.
 * 8. In-memory validation of candidate fields (displayName, avatarUrl, signature).
 * 9. Never outputs or persists: UID, full URL, body text, image URLs, response headers, Cookie.
 * 10. Results do NOT change Connector capability UNVERIFIED status.
 */

import {
  ObservationSource,
  ControlledProbeOutcome,
  ControlledProbeResult,
} from "../../src/types/connector";
import {
  MAX_BYTES_CAP,
  MAX_WINDOW_CHARS,
  clampSecurityCeiling,
  validateProbeUrl,
} from "./bilibili-public-capability";
import { inspectBasicProfileSignalsFromStream } from "./basic-profile-parser";

export const PROBE_VERSION = "0.2.1-phase4.7-hardened";

export interface ControlledLiveProbeOptions {
  allowNetwork?: boolean;
  uid?: string;
  maxBytesCap?: number;
  maxWindowChars?: number;
  verifyValues?: boolean;
}

export interface ControlledLiveProbeExecutionResult extends ControlledProbeResult {
  fetchCallCount: number;
  elapsedMs?: number;
}

/**
 * Pure, injectable controlled probe execution engine.
 * Guarantees zero network calls on any gate failure.
 */
export async function executeControlledLiveProbe(
  options: ControlledLiveProbeOptions,
  customFetch: typeof fetch = globalThis.fetch
): Promise<ControlledLiveProbeExecutionResult> {
  const observedAt = new Date().toISOString();
  const verifyValues = options.verifyValues !== false; // default true

  // 0. Gate 0: Refuse execution in production environment
  if (process.env.NODE_ENV === "production") {
    return {
      probeVersion: PROBE_VERSION,
      observationSource: "SYNTHETIC_OFFLINE_TEST",
      observedAt,
      outcome: "INVALID_INPUT",
      isReachable: false,
      signals: {
        displayName: "NOT_ATTEMPTED",
        avatarUrl: "NOT_ATTEMPTED",
        signature: "NOT_ATTEMPTED",
      },
      bytesProcessed: 0,
      hitByteLimit: false,
      summary: "生产环境严格禁止执行受控探测脚本，未发起任何外部请求。",
      fetchCallCount: 0,
    };
  }

  // 1. Gate 1: Check --allow-network
  if (!options.allowNetwork) {
    return {
      probeVersion: PROBE_VERSION,
      observationSource: "SYNTHETIC_OFFLINE_TEST",
      observedAt,
      outcome: "INVALID_INPUT",
      isReachable: false,
      signals: {
        displayName: "NOT_ATTEMPTED",
        avatarUrl: "NOT_ATTEMPTED",
        signature: "NOT_ATTEMPTED",
      },
      bytesProcessed: 0,
      hitByteLimit: false,
      summary: "缺少 --allow-network 显式网络授权参数，探针已安全终止，未发起任何外部请求。",
      fetchCallCount: 0,
    };
  }

  // 1b. Gate 1b: Check explicit dual-confirmation environment variables
  const isFieldValidationEnabled = process.env.BILIPROFILE_FIELD_VALIDATION_ENABLED === "true";
  const isOwnerAuthorized = process.env.BILIPROFILE_OWNER_AUTHORIZED === "true";
  if (!isFieldValidationEnabled || !isOwnerAuthorized) {
    return {
      probeVersion: PROBE_VERSION,
      observationSource: "SYNTHETIC_OFFLINE_TEST",
      observedAt,
      outcome: "INVALID_INPUT",
      isReachable: false,
      signals: {
        displayName: "NOT_ATTEMPTED",
        avatarUrl: "NOT_ATTEMPTED",
        signature: "NOT_ATTEMPTED",
      },
      bytesProcessed: 0,
      hitByteLimit: false,
      summary: "缺少 BILIPROFILE_FIELD_VALIDATION_ENABLED=true 或 BILIPROFILE_OWNER_AUTHORIZED=true 显式双确认环境变量，探针已安全终止，未发起任何外部请求。",
      fetchCallCount: 0,
    };
  }

  // 2. Gate 2: Check UID (pure string digits only, NO parseInt/Number conversion)
  const rawUid = options.uid;
  if (!rawUid || typeof rawUid !== "string" || !/^\d+$/.test(rawUid)) {
    return {
      probeVersion: PROBE_VERSION,
      observationSource: "SYNTHETIC_OFFLINE_TEST",
      observedAt,
      outcome: "INVALID_INPUT",
      isReachable: false,
      signals: {
        displayName: "NOT_ATTEMPTED",
        avatarUrl: "NOT_ATTEMPTED",
        signature: "NOT_ATTEMPTED",
      },
      bytesProcessed: 0,
      hitByteLimit: false,
      summary: "UID 必须为非空纯数字字符串，探针已安全终止，未发起任何外部请求。",
      fetchCallCount: 0,
    };
  }

  // 3. Construct target URL using whitelist logic
  const targetUrl = `https://space.bilibili.com/${rawUid}`;
  if (!validateProbeUrl(targetUrl)) {
    return {
      probeVersion: PROBE_VERSION,
      observationSource: "SYNTHETIC_OFFLINE_TEST",
      observedAt,
      outcome: "INVALID_INPUT",
      isReachable: false,
      signals: {
        displayName: "NOT_ATTEMPTED",
        avatarUrl: "NOT_ATTEMPTED",
        signature: "NOT_ATTEMPTED",
      },
      bytesProcessed: 0,
      hitByteLimit: false,
      summary: "构造的 URL 不符合严格域名与路径白名单，探针已安全终止，未发起任何外部请求。",
      fetchCallCount: 0,
    };
  }

  const safeMaxBytesCap = clampSecurityCeiling(options.maxBytesCap, MAX_BYTES_CAP);
  const safeMaxWindowChars = clampSecurityCeiling(options.maxWindowChars, MAX_WINDOW_CHARS);

  // 4. Perform strictly 1 controlled fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const startTime = Date.now();
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

    const elapsedMs = Date.now() - startTime;
    const httpStatus = response.status;
    const contentType = response.headers.get("content-type") || "";
    const isHtml = contentType.toLowerCase().includes("text/html");

    // 3xx Redirection handler: strictly forbidden to follow
    if (httpStatus >= 300 && httpStatus < 400) {
      return {
        probeVersion: PROBE_VERSION,
        observationSource: "CONTROLLED_LIVE_PROBE",
        observedAt: new Date().toISOString(),
        outcome: "UNREACHABLE",
        isReachable: false,
        httpStatus,
        signals: {
          displayName: "NOT_ATTEMPTED",
          avatarUrl: "NOT_ATTEMPTED",
          signature: "NOT_ATTEMPTED",
        },
        bytesProcessed: 0,
        hitByteLimit: false,
        summary: `收到重定向响应 (HTTP ${httpStatus})，按规范禁止自动跟随，未执行二次请求。`,
        fetchCallCount,
        elapsedMs,
      };
    }

    if (httpStatus === 200) {
      if (!isHtml || !response.body) {
        return {
          probeVersion: PROBE_VERSION,
          observationSource: "CONTROLLED_LIVE_PROBE",
          observedAt: new Date().toISOString(),
          outcome: "UNREACHABLE",
          isReachable: true,
          httpStatus,
          signals: {
            displayName: "NOT_ATTEMPTED",
            avatarUrl: "NOT_ATTEMPTED",
            signature: "NOT_ATTEMPTED",
          },
          bytesProcessed: 0,
          hitByteLimit: false,
          summary: "响应类型非 HTML 或响应体为空，未读取正文。",
          fetchCallCount,
          elapsedMs,
        };
      }

      const streamResult = await inspectBasicProfileSignalsFromStream(
        response.body,
        safeMaxBytesCap,
        safeMaxWindowChars,
        verifyValues
      );

      const hasObservedSignal =
        streamResult.signals.displayName === "OBSERVED" ||
        streamResult.signals.avatarUrl === "OBSERVED" ||
        streamResult.signals.signature === "OBSERVED";

      const outcome: ControlledProbeOutcome = hasObservedSignal
        ? "SIGNALS_OBSERVED"
        : "SIGNALS_NOT_OBSERVED";

      const hitByteLimit = streamResult.bytesProcessed >= safeMaxBytesCap;

      return {
        probeVersion: PROBE_VERSION,
        observationSource: "CONTROLLED_LIVE_PROBE",
        observedAt: new Date().toISOString(),
        outcome,
        isReachable: true,
        httpStatus,
        signals: streamResult.signals,
        valueValidation: streamResult.valueValidation,
        bytesProcessed: streamResult.bytesProcessed,
        hitByteLimit,
        summary: `公开页面单次响应 HTTP 200，在受限流式窗口内${hasObservedSignal ? "观测到候选字段结构信号并完成内存脱敏校验" : "未观测到结构信号"}（不代表资料可稳定提取或身份已确认）。`,
        fetchCallCount,
        elapsedMs,
      };
    } else if (httpStatus === 403 || httpStatus === 412) {
      return {
        probeVersion: PROBE_VERSION,
        observationSource: "CONTROLLED_LIVE_PROBE",
        observedAt: new Date().toISOString(),
        outcome: "BLOCKED",
        isReachable: false,
        httpStatus,
        signals: {
          displayName: "NOT_ATTEMPTED",
          avatarUrl: "NOT_ATTEMPTED",
          signature: "NOT_ATTEMPTED",
        },
        bytesProcessed: 0,
        hitByteLimit: false,
        summary: `访问受限或遇到平台防护 (HTTP ${httpStatus})，探针已安全停止，未尝试规避。`,
        fetchCallCount,
        elapsedMs,
      };
    } else if (httpStatus === 429) {
      return {
        probeVersion: PROBE_VERSION,
        observationSource: "CONTROLLED_LIVE_PROBE",
        observedAt: new Date().toISOString(),
        outcome: "BLOCKED",
        isReachable: false,
        httpStatus,
        signals: {
          displayName: "NOT_ATTEMPTED",
          avatarUrl: "NOT_ATTEMPTED",
          signature: "NOT_ATTEMPTED",
        },
        bytesProcessed: 0,
        hitByteLimit: false,
        summary: "触发访问频率限制 (HTTP 429)，探针已安全停止。",
        fetchCallCount,
        elapsedMs,
      };
    } else {
      return {
        probeVersion: PROBE_VERSION,
        observationSource: "CONTROLLED_LIVE_PROBE",
        observedAt: new Date().toISOString(),
        outcome: "UNREACHABLE",
        isReachable: false,
        httpStatus,
        signals: {
          displayName: "NOT_ATTEMPTED",
          avatarUrl: "NOT_ATTEMPTED",
          signature: "NOT_ATTEMPTED",
        },
        bytesProcessed: 0,
        hitByteLimit: false,
        summary: `目标页面不可达或状态异常 (HTTP ${httpStatus})。`,
        fetchCallCount,
        elapsedMs,
      };
    }
  } catch {
    const elapsedMs = Date.now() - startTime;
    return {
      probeVersion: PROBE_VERSION,
      observationSource: "CONTROLLED_LIVE_PROBE",
      observedAt: new Date().toISOString(),
      outcome: "UNREACHABLE",
      isReachable: false,
      signals: {
        displayName: "NOT_ATTEMPTED",
        avatarUrl: "NOT_ATTEMPTED",
        signature: "NOT_ATTEMPTED",
      },
      bytesProcessed: 0,
      hitByteLimit: false,
      summary: "网络连接超时或底层连接异常，探针已安全终止。",
      fetchCallCount,
      elapsedMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let allowNetwork = false;
  let uid: string | undefined;
  let verifyValues = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--allow-network") {
      allowNetwork = true;
    } else if (args[i] === "--uid" && args[i + 1]) {
      uid = args[i + 1];
      i++;
    } else if (args[i] === "--verify-values") {
      verifyValues = true;
    }
  }

  return { allowNetwork, uid, verifyValues };
}

async function runControlledProbeCli() {
  const { allowNetwork, uid, verifyValues } = parseCliArgs();

  console.log("=================================================");
  console.log("🔍 BiliProfile Analyzer — BASIC_PROFILE 受控单次探针 (Phase 4.7 安全加固模式)");
  console.log("=================================================\n");

  const result = await executeControlledLiveProbe({
    allowNetwork,
    uid,
    verifyValues,
  });

  console.log("[受控探针结果输出]");
  console.log(`- 探针版本: ${result.probeVersion}`);
  console.log(`- 观测来源: ${result.observationSource}`);
  console.log(`- 判定结果: ${result.outcome}`);
  console.log(`- 是否可达: ${result.isReachable ? "是" : "否"}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}`);
  console.log(`- 是否触及读取上限: ${result.hitByteLimit ? "是" : "否"} (已处理 ${result.bytesProcessed} 字节)`);

  console.log("\n[最小候选字段结构信号判定]");
  console.log(`- displayName: ${result.signals.displayName}`);
  console.log(`- avatarUrl: ${result.signals.avatarUrl}`);
  console.log(`- signature: ${result.signals.signature}`);

  if (result.valueValidation) {
    console.log("\n[最小候选字段值脱敏校验状态 (Phase 4.6/4.7)]");
    console.log(`- displayName: ${result.valueValidation.displayName}`);
    console.log(`- avatarUrl: ${result.valueValidation.avatarUrl} (URL 语法校验: ${result.valueValidation.avatarUrlSyntaxValid ? "通过 (合规 http/https)" : "未通过"})`);
    console.log(`- signature: ${result.valueValidation.signature}`);
  }

  console.log(`\n- 结果摘要: ${result.summary}`);
  console.log("\n⚠️ 提醒：受控探针仅执行内存脱敏校验；全局 Connector 能力状态严格保持 UNVERIFIED。");
  console.log("=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("controlled-basic-profile-probe"))
) {
  runControlledProbeCli().catch(() => {
    console.error("[探针异常] 执行过程发生未捕获异常，已安全退出。");
    process.exit(1);
  });
}
