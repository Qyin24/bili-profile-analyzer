/**
 * BiliProfile Analyzer — Bilibili Basic Profile Signal Probe (Phase 4.2 / Phase 4.3.1 Hardened)
 *
 * Safety & Compliance Rules:
 * 1. Strictly reads URL from BILIPROFILE_PROBE_URL or CLI argument.
 * 2. URL Whitelist: Strictly accepts ONLY https://space.bilibili.com/<纯数字UID> (optional trailing slash).
 *    Rejects query strings, hashes, ports, credentials, subpaths, non-numeric UIDs.
 * 3. If unconfigured or missing -> outputs SKIPPED_NOT_CONFIGURED, exactly 0 network calls.
 * 4. If invalid URL -> outputs SKIPPED_INVALID_CONFIGURATION, exactly 0 network calls.
 * 5. Uses redirect: "manual" and credentials: "omit". Never follows redirects or reads Location header.
 * 6. Uses honest User-Agent: "BiliProfileAnalyzerCapabilityProbe/0.1".
 * 7. Single request with 5000ms timeout. Never retries.
 * 8. Hardened streaming reader with unbreakable upper ceilings:
 *    - Strict MAX_BYTES_CAP = 64 * 1024 (65536 bytes). Slices any chunk exceeding remaining bytes before decoding.
 *    - Unbreakable security clamp: parameters can ONLY be smaller, NEVER larger than defaults.
 *    - bytesProcessed is guaranteed to NEVER exceed MAX_BYTES_CAP (65536).
 * 9. Evaluates 3 transient boolean signals:
 *    - hasCanonicalOrSpaceSignal: boolean
 *    - hasNonEmptyTitleSignal: boolean
 *    - hasAvatarRefSignal: boolean
 * 10. Immediately discards buffer after inspection. NEVER outputs, returns, logs, or saves any UID, URL, body, title text, avatar links, or headers.
 * 11. BASIC_PROFILE capability strictly remains UNVERIFIED.
 */

import {
  BasicProfileSignalStatus,
  CapabilityStatus,
} from "../../src/types/connector";

export const MAX_BYTES_CAP = 64 * 1024; // 64 KiB strict hard ceiling

export function validateProbeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "space.bilibili.com") return false;
    if (parsed.username || parsed.password || parsed.port) return false;
    if (parsed.search || parsed.hash) return false;
    if (!/^\/[0-9]+\/?$/.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Strictly clamps any parameter to at most defaultAndMax ceiling.
 * Illegal, NaN, non-finite, or integer value < 1 (e.g. 0.5, 0, negative) securely fall back to defaultAndMax.
 * Values > defaultAndMax securely fall back to defaultAndMax.
 * Callers can ONLY request smaller positive integer bounds [1, defaultAndMax], NEVER relax bounds.
 */
export function clampSecurityCeiling(val: unknown, defaultAndMax: number): number {
  if (typeof val !== "number" || isNaN(val) || !isFinite(val)) {
    return defaultAndMax;
  }
  const integerVal = Math.floor(val);
  if (integerVal < 1 || integerVal > defaultAndMax) {
    return defaultAndMax;
  }
  return integerVal;
}

export interface ProfileSignalCheckResult {
  hasCanonicalOrSpaceSignal: boolean;
  hasNonEmptyTitleSignal: boolean;
  hasAvatarRefSignal: boolean;
  overallSignal: BasicProfileSignalStatus;
  bytesProcessed: number;
}

export async function inspectStreamForBasicProfileSignals(
  body: ReadableStream<Uint8Array>,
  maxBytesCap: number = MAX_BYTES_CAP
): Promise<ProfileSignalCheckResult> {
  const safeMaxBytesCap = clampSecurityCeiling(maxBytesCap, MAX_BYTES_CAP);
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");

  let bytesProcessed = 0;
  let accumulatedText = "";

  try {
    while (bytesProcessed < safeMaxBytesCap) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remainingBytes = safeMaxBytesCap - bytesProcessed;
      if (remainingBytes <= 0) break;

      const bytesToProcess = Math.min(value.byteLength, remainingBytes);
      const chunkSlice = value.byteLength === bytesToProcess ? value : value.subarray(0, bytesToProcess);
      bytesProcessed += chunkSlice.byteLength;

      accumulatedText += decoder.decode(chunkSlice, { stream: true });

      if (value.byteLength > remainingBytes) {
        break;
      }
    }
  } finally {
    try {
      await reader.cancel("Basic profile signal inspection finished.");
    } catch {
      // Reader may already be closed or cancelled
    }
  }

  // Transient in-memory boolean evaluation only
  const hasCanonicalOrSpaceSignal =
    /space\.bilibili\.com/i.test(accumulatedText) ||
    /canonical/i.test(accumulatedText) ||
    /的个人空间/i.test(accumulatedText);

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(accumulatedText);
  const hasNonEmptyTitleSignal = Boolean(titleMatch && titleMatch[1]?.trim().length > 0);

  const hasAvatarRefSignal =
    /hdslb\.com/i.test(accumulatedText) ||
    /face/i.test(accumulatedText) ||
    /avatar/i.test(accumulatedText) ||
    /bfs\/face/i.test(accumulatedText);

  const overallSignal: BasicProfileSignalStatus =
    hasCanonicalOrSpaceSignal && hasNonEmptyTitleSignal && hasAvatarRefSignal
      ? "FIELD_SIGNALS_PRESENT"
      : "FIELD_SIGNALS_NOT_DETECTED";

  // Explicitly dereference and drop accumulated text immediately
  accumulatedText = "";

  return {
    hasCanonicalOrSpaceSignal,
    hasNonEmptyTitleSignal,
    hasAvatarRefSignal,
    overallSignal,
    bytesProcessed,
  };
}

export interface BasicProfileProbeResult {
  capability: "BASIC_PROFILE";
  outcome: CapabilityStatus;
  statusCode?: number;
  contentType?: string;
  elapsedMs?: number;
  observedAt: string;
  fetchCallCount: number;
  bodyRead: boolean;
  signalResult?: {
    hasCanonicalOrSpaceSignal: boolean;
    hasNonEmptyTitleSignal: boolean;
    hasAvatarRefSignal: boolean;
    overallSignal: BasicProfileSignalStatus;
    bytesProcessed: number;
  };
  note: string;
}

export async function executeBasicProfileSignalProbe(
  rawUrl?: string,
  customFetch: typeof fetch = globalThis.fetch
): Promise<BasicProfileProbeResult> {
  const targetUrl = (rawUrl || process.env.BILIPROFILE_PROBE_URL || "").trim();

  // 1. Check if configured
  if (!targetUrl) {
    return {
      capability: "BASIC_PROFILE",
      observedAt: new Date().toISOString(),
      outcome: "SKIPPED_NOT_CONFIGURED",
      note: "未配置 BILIPROFILE_PROBE_URL 环境变量，探针已安全跳过，未发送任何外部网络请求。",
      fetchCallCount: 0,
      bodyRead: false,
    };
  }

  // 2. Validate URL strictly
  if (!validateProbeUrl(targetUrl)) {
    return {
      capability: "BASIC_PROFILE",
      observedAt: new Date().toISOString(),
      outcome: "SKIPPED_INVALID_CONFIGURATION",
      note: "URL 不符合严格受控规范（仅接受 https://space.bilibili.com/<纯数字UID>），探针已安全跳过，未发送任何外部网络请求。",
      fetchCallCount: 0,
      bodyRead: false,
    };
  }

  // 3. Single controlled fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const startTime = Date.now();
  let fetchCallCount = 0;
  let bodyRead = false;

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
    const contentType = response.headers.get("content-type") || "unknown";
    const isHtml = contentType.toLowerCase().includes("text/html");

    let outcome: CapabilityStatus = "UNVERIFIED";
    let note = "";

    if (httpStatus === 200) {
      outcome = "PAGE_REACHABLE";
      if (isHtml && response.body) {
        bodyRead = true;
        const signalCheck = await inspectStreamForBasicProfileSignals(response.body);
        note =
          signalCheck.overallSignal === "FIELD_SIGNALS_PRESENT"
            ? "在单次受控流式采样（≤64 KiB）中检测到公开基础资料的必要结构信号（地址、标题、头像引用）；未保存、未输出任何具体内容；BASIC_PROFILE 字段能力仍为 UNVERIFIED。"
            : "在单次受控流式采样（≤64 KiB）中未检测到完整的结构信号；这属于样本不确定，不代表页面私密或不可用；BASIC_PROFILE 字段能力仍为 UNVERIFIED。";

        return {
          capability: "BASIC_PROFILE",
          statusCode: httpStatus,
          contentType,
          elapsedMs,
          observedAt: new Date().toISOString(),
          outcome,
          fetchCallCount,
          bodyRead,
          signalResult: signalCheck,
          note,
        };
      } else {
        bodyRead = false;
        note = "公开页面单次请求返回 HTTP 200，但非 HTML 或缺少正文，未读取响应体。";
      }
    } else if (httpStatus >= 300 && httpStatus < 400) {
      outcome = "REDIRECTED_NOT_FOLLOWED";
      note = `收到重定向响应 (HTTP ${httpStatus})，探针按规范不予跟随，未执行二次请求。`;
    } else if (httpStatus === 403 || httpStatus === 412) {
      outcome = "BLOCKED";
      note = `访问受限或触发安全防护 (HTTP ${httpStatus})，探针已安全停止，绝不尝试规避。`;
    } else if (httpStatus === 404) {
      outcome = "UNAVAILABLE_UNKNOWN";
      note = `目标页面不存在或状态未知 (HTTP ${httpStatus})。`;
    } else if (httpStatus === 429) {
      outcome = "RATE_LIMITED";
      note = "触发访问频率限制 (HTTP 429)，探针立即终止。";
    } else {
      outcome = "UNSUPPORTED";
      note = `响应状态异常 (HTTP ${httpStatus})。`;
    }

    return {
      capability: "BASIC_PROFILE",
      statusCode: httpStatus,
      contentType,
      elapsedMs,
      observedAt: new Date().toISOString(),
      outcome,
      fetchCallCount,
      bodyRead,
      note,
    };
  } catch {
    const elapsedMs = Date.now() - startTime;
    return {
      capability: "BASIC_PROFILE",
      elapsedMs,
      observedAt: new Date().toISOString(),
      outcome: "NETWORK_ERROR",
      note: "网络连接异常或请求超时，探针已安全终止。",
      fetchCallCount,
      bodyRead,
    };
  } finally {
    clearTimeout(timer);
  }
}

function loadLocalEnv() {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore env loading error
  }
}

async function runCli() {
  loadLocalEnv();

  console.log("=================================================");
  console.log("🔍 BiliProfile Analyzer — 最小公开资料信号探针 (Phase 4.2)");
  console.log("=================================================\n");

  const result = await executeBasicProfileSignalProbe();

  console.log("[探针结果输出]");
  console.log(`- 验证能力: ${result.capability}`);
  console.log(`- 判定结果: ${result.outcome}`);
  if (result.statusCode !== undefined) {
    console.log(`- HTTP 状态码: ${result.statusCode}`);
  }
  if (result.contentType !== undefined) {
    console.log(`- Content-Type: ${result.contentType}`);
  }
  if (result.elapsedMs !== undefined) {
    console.log(`- 请求耗时: ${result.elapsedMs} ms`);
  }
  if (result.signalResult) {
    console.log("\n[有限内存结构信号检测结果]");
    console.log(`- 目标主页规范地址信号: ${result.signalResult.hasCanonicalOrSpaceSignal ? "存在" : "未发现"}`);
    console.log(`- 非空页面标题信号: ${result.signalResult.hasNonEmptyTitleSignal ? "存在" : "未发现"}`);
    console.log(`- 公开头像资源引用信号: ${result.signalResult.hasAvatarRefSignal ? "存在" : "未发现"}`);
    console.log(`- 采样处理字节数: ${result.signalResult.bytesProcessed} 字节 (上限 64 KiB)`);
    console.log(`- 综合信号判定: ${result.signalResult.overallSignal}`);
  }
  console.log(`\n- 执行说明: ${result.note}`);
  console.log("\n⚠️ 提醒：本探针仅确认样本中是否存在继续研究的结构信号，不代表昵称/头像字段可读取，BASIC_PROFILE 严格保持 UNVERIFIED。");
  console.log("=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("bilibili-basic-profile-signal"))
) {
  runCli().catch(() => {
    console.error("[探针异常] 执行过程发生未捕获异常，已安全退出。");
    process.exit(1);
  });
}
