/**
 * BiliProfile Analyzer — Bilibili Public Capability Probe (Phase 4.4.1 & 4.3.1)
 *
 * Safety & Compliance Rules:
 * 1. Default mode (`npm run probe:bilibili`): Only validates page reachability, NEVER reads response body.
 * 2. Field mode (`npm run probe:bilibili:field`):
 *    - Scoped strictly to BASIC_PROFILE capability (rejects non-BASIC_PROFILE with UNSUPPORTED and 0 network calls)
 *    - Requires `BILIPROFILE_FIELD_VALIDATION_ENABLED=true` env var
 *    - Requires valid `https://space.bilibili.com/<digits>` URL
 *    - Requires explicit `--confirm-public-only` CLI flag
 * 3. Profile-label mode (`npm run probe:bilibili:profile-label`):
 *    - Scoped strictly to BASIC_PROFILE capability (rejects non-BASIC_PROFILE with UNSUPPORTED and 0 network calls)
 *    - Strictly reads URL ONLY from `BILIPROFILE_PROBE_URL` in env (does NOT accept CLI --url override)
 *    - Requires `BILIPROFILE_PROFILE_LABEL_VALIDATION_ENABLED=true` env var
 * 4. Strict URL Whitelist: ONLY `https://space.bilibili.com/<纯数字UID>` (optional trailing slash).
 *    Rejects root domain, API subdomain, short links, queries, hashes, ports, credentials, subpaths.
 * 5. Uses `redirect: "manual"` and `credentials: "omit"`. Never sends Cookie/Token/Authorization.
 * 6. Uses honest User-Agent: "BiliProfileAnalyzerCapabilityProbe/0.1". Never spoofs browser UA.
 * 7. Hardened streaming reader with unbreakable upper ceilings:
 *    - Strict MAX_BYTES_CAP = 64 * 1024 (65536 bytes). Slices any chunk exceeding remaining bytes before decoding.
 *    - Strict MAX_WINDOW_CHARS = 2048 sliding window rolling buffer processed incrementally.
 *    - Unbreakable security clamp: parameters can ONLY be smaller, NEVER larger than defaults.
 * 8. Profile label inspection accepts ONLY recognized space profile title structure:
 *    Non-empty name part + "的个人空间" structure (e.g. /^(.+?)的个人空间/i).
 *    Ordinary titles, empty titles, or titles without a name part return PROFILE_LABEL_SIGNAL_NOT_OBSERVED.
 * 9. NEVER returns, outputs, or persists actual title text string or page body.
 * 10. All capabilities remain UNVERIFIED.
 * 11. Phase 4.8 边界明确：此通用 Probe 仅用于 Phase 4.0–4.4 的安全回归与最小信号检查，不能用于生成 Phase 4.8 准入证据；Phase 4.8 只能使用具备逐次明确授权、单请求、完整审计字段与独立样本规则的专用受控工具（生成 CapabilityEvidenceRecord）。
 */

import {
  ConnectorCapabilityType,
  CapabilityStatus,
  FieldSignalStatus,
  ProfileLabelSignalStatus,
  BasicProfileFieldSignals,
  ProbeTransportResult,
} from "../../src/types/connector";
import { inspectBasicProfileSignalsFromStream } from "./basic-profile-parser";

export const MAX_BYTES_CAP = 64 * 1024; // 64 KiB strict hard ceiling
export const MAX_WINDOW_CHARS = 2048; // 2048 chars strict hard ceiling

export const VALID_CAPABILITY_NAMES: readonly ConnectorCapabilityType[] = [
  "BASIC_PROFILE",
  "PUBLIC_FOLLOWS",
  "PUBLIC_CONTENT",
] as const;

/**
 * Strict URL Whitelist Validator:
 * Accepts ONLY: https://space.bilibili.com/<纯数字UID> or https://space.bilibili.com/<纯数字UID>/
 * Rejects:
 * - Non-https protocols
 * - Root domain bilibili.com, api.bilibili.com, b23.tv, or any other subdomain
 * - Query strings, hash fragments, credentials, custom ports
 * - Subpaths like /<uid>/dynamic, /<uid>/favlist, etc.
 * - Non-numeric UIDs
 */
export function validateProbeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  try {
    const parsed = new URL(rawUrl);

    // Protocol must strictly be https:
    if (parsed.protocol !== "https:") return false;

    // Hostname must strictly equal space.bilibili.com
    if (parsed.hostname !== "space.bilibili.com") return false;

    // No credentials or custom ports
    if (parsed.username || parsed.password || parsed.port) return false;

    // No query parameters or hash fragments
    if (parsed.search || parsed.hash) return false;

    // Pathname must strictly match /<digits> or /<digits>/
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

/**
 * Minimal streaming inspector for title tag closure signal.
 */
export async function inspectStreamForTitleSignal(
  body: ReadableStream<Uint8Array>,
  maxBytesCap: number = MAX_BYTES_CAP,
  maxWindowChars: number = MAX_WINDOW_CHARS
): Promise<{
  fieldSignal: FieldSignalStatus;
  bytesProcessed: number;
  maxObservedBufferLength: number;
}> {
  const safeMaxBytesCap = clampSecurityCeiling(maxBytesCap, MAX_BYTES_CAP);
  const safeMaxWindowChars = clampSecurityCeiling(maxWindowChars, MAX_WINDOW_CHARS);

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");

  let bytesProcessed = 0;
  let rollingBuffer = "";
  let titleFound = false;
  let maxObservedBufferLength = 0;

  try {
    while (bytesProcessed < safeMaxBytesCap) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remainingBytes = safeMaxBytesCap - bytesProcessed;
      if (remainingBytes <= 0) break;

      const bytesToProcess = Math.min(value.byteLength, remainingBytes);
      const chunkSlice = value.byteLength === bytesToProcess ? value : value.subarray(0, bytesToProcess);

      const stepSize = Math.max(1, Math.min(256, safeMaxWindowChars));
      for (let offset = 0; offset < chunkSlice.byteLength; offset += stepSize) {
        const subSlice = chunkSlice.subarray(offset, Math.min(offset + stepSize, chunkSlice.byteLength));
        bytesProcessed += subSlice.byteLength;

        const decodedSub = decoder.decode(subSlice, { stream: true });

        if (decodedSub.length >= safeMaxWindowChars) {
          rollingBuffer = decodedSub.slice(-safeMaxWindowChars);
        } else {
          const maxOldLength = safeMaxWindowChars - decodedSub.length;
          if (rollingBuffer.length > maxOldLength) {
            rollingBuffer = rollingBuffer.slice(-maxOldLength);
          }
          rollingBuffer += decodedSub;
        }

        if (rollingBuffer.length > maxObservedBufferLength) {
          maxObservedBufferLength = rollingBuffer.length;
        }

        if (/<title[^>]*>[\s\S]*?<\/title>/i.test(rollingBuffer)) {
          titleFound = true;
          break;
        }
      }

      if (titleFound) break;

      if (value.byteLength > remainingBytes) {
        break;
      }
    }
  } finally {
    try {
      await reader.cancel("Streaming title signal inspection finished.");
    } catch {
      // Reader may already be closed or cancelled
    }
  }

  return {
    fieldSignal: titleFound ? "TITLE_SIGNAL_OBSERVED" : "TITLE_SIGNAL_NOT_OBSERVED",
    bytesProcessed,
    maxObservedBufferLength,
  };
}

/**
 * Minimal streaming inspector for space profile label signal in <title> (Phase 4.4 / 4.4.1).
 * Accepts ONLY recognized space profile title structure:
 * Non-empty name part + "的个人空间" structure (e.g. /^(.+?)的个人空间/i where match[1].trim().length > 0).
 * Ordinary titles, empty titles, or titles with only "的个人空间" without a name part return PROFILE_LABEL_SIGNAL_NOT_OBSERVED.
 * NEVER returns, logs, writes, or persists the extracted title string!
 */
export async function inspectStreamForProfileLabel(
  body: ReadableStream<Uint8Array>,
  maxBytesCap: number = MAX_BYTES_CAP,
  maxWindowChars: number = MAX_WINDOW_CHARS
): Promise<{
  profileLabelSignal: ProfileLabelSignalStatus;
  bytesProcessed: number;
  maxObservedBufferLength: number;
}> {
  const safeMaxBytesCap = clampSecurityCeiling(maxBytesCap, MAX_BYTES_CAP);
  const safeMaxWindowChars = clampSecurityCeiling(maxWindowChars, MAX_WINDOW_CHARS);

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");

  let bytesProcessed = 0;
  let rollingBuffer = "";
  let labelSignal: ProfileLabelSignalStatus = "PROFILE_LABEL_SIGNAL_NOT_OBSERVED";
  let maxObservedBufferLength = 0;

  try {
    while (bytesProcessed < safeMaxBytesCap) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remainingBytes = safeMaxBytesCap - bytesProcessed;
      if (remainingBytes <= 0) break;

      const bytesToProcess = Math.min(value.byteLength, remainingBytes);
      const chunkSlice = value.byteLength === bytesToProcess ? value : value.subarray(0, bytesToProcess);

      const stepSize = Math.max(1, Math.min(256, safeMaxWindowChars));
      for (let offset = 0; offset < chunkSlice.byteLength; offset += stepSize) {
        const subSlice = chunkSlice.subarray(offset, Math.min(offset + stepSize, chunkSlice.byteLength));
        bytesProcessed += subSlice.byteLength;

        const decodedSub = decoder.decode(subSlice, { stream: true });

        if (decodedSub.length >= safeMaxWindowChars) {
          rollingBuffer = decodedSub.slice(-safeMaxWindowChars);
        } else {
          const maxOldLength = safeMaxWindowChars - decodedSub.length;
          if (rollingBuffer.length > maxOldLength) {
            rollingBuffer = rollingBuffer.slice(-maxOldLength);
          }
          rollingBuffer += decodedSub;
        }

        if (rollingBuffer.length > maxObservedBufferLength) {
          maxObservedBufferLength = rollingBuffer.length;
        }

        const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rollingBuffer);
        if (titleMatch) {
          const rawTitle = titleMatch[1]?.trim() || "";
          const spacePattern = /^(.+?)的个人空间/i;
          const match = spacePattern.exec(rawTitle);
          if (match && match[1].trim().length > 0) {
            labelSignal = "PROFILE_LABEL_SIGNAL_OBSERVED";
          } else {
            labelSignal = "PROFILE_LABEL_SIGNAL_NOT_OBSERVED";
          }
          break;
        }
      }

      if (labelSignal === "PROFILE_LABEL_SIGNAL_OBSERVED") break;

      if (value.byteLength > remainingBytes) {
        break;
      }
    }
  } finally {
    try {
      await reader.cancel("Streaming profile label signal inspection finished.");
    } catch {
      // Reader may already be closed or cancelled
    }
  }

  return {
    profileLabelSignal: labelSignal,
    bytesProcessed,
    maxObservedBufferLength,
  };
}

export interface ProbeExecutionOptions {
  capability?: string;
  url?: string;
  confirmPublicOnly?: boolean;
  isFieldMode?: boolean;
  isProfileLabelMode?: boolean;
  fieldValidationEnv?: string;
  profileLabelValidationEnv?: string;
  probeUrlEnv?: string;
}

export interface ProbeExecutionResult extends ProbeTransportResult {
  fetchCallCount: number;
  bodyRead: boolean;
  fieldSignal?: FieldSignalStatus;
  profileLabelSignal?: ProfileLabelSignalStatus;
  basicProfileSignals?: BasicProfileFieldSignals;
}

/**
 * Pure, injectable probe execution engine.
 * Guarantees zero network calls on any validation or gate failure.
 */
export async function executeProbe(
  options: ProbeExecutionOptions,
  customFetch: typeof fetch = globalThis.fetch
): Promise<ProbeExecutionResult> {
  const targetCapability = (options.capability || "BASIC_PROFILE") as ConnectorCapabilityType;

  // 1. Profile-Label Mode Gate Check (Phase 4.4 / 4.4.1)
  // Scoped strictly to BASIC_PROFILE and BILIPROFILE_PROBE_URL in env (does NOT accept CLI --url override)
  if (options.isProfileLabelMode) {
    if (options.capability && options.capability !== "BASIC_PROFILE") {
      return {
        capability: options.capability as ConnectorCapabilityType,
        observedAt: new Date().toISOString(),
        outcome: "UNSUPPORTED",
        note: `profile-label 模式仅支持 BASIC_PROFILE，不支持 "${options.capability}" 能力探测。`,
        fetchCallCount: 0,
        bodyRead: false,
        profileLabelSignal: "NOT_ATTEMPTED",
      };
    }

    const profileLabelUrl = options.probeUrlEnv?.trim() || "";
    if (options.profileLabelValidationEnv !== "true" || !profileLabelUrl || !validateProbeUrl(profileLabelUrl)) {
      return {
        capability: "BASIC_PROFILE",
        observedAt: new Date().toISOString(),
        outcome: "SKIPPED_NOT_CONFIGURED",
        note: "未配置 BILIPROFILE_PROFILE_LABEL_VALIDATION_ENABLED=true 或 BILIPROFILE_PROBE_URL 不合规，展示名称信号验证已安全跳过，未发送任何外部网络请求。",
        fetchCallCount: 0,
        bodyRead: false,
        profileLabelSignal: "NOT_ATTEMPTED",
      };
    }

    // Set target URL strictly from environment for profile-label mode
    return executeControlledRequest(
      "BASIC_PROFILE",
      profileLabelUrl,
      true, // isProfileLabelMode
      false, // isFieldMode
      customFetch
    );
  }

  // 2. Field Mode Gate Check (Phase 4.2.1 / 4.3.1)
  if (options.isFieldMode) {
    // Field mode strictly allows ONLY BASIC_PROFILE
    if (targetCapability !== "BASIC_PROFILE") {
      return {
        capability: targetCapability,
        observedAt: new Date().toISOString(),
        outcome: "UNSUPPORTED",
        note: `field 模式仅支持 BASIC_PROFILE，不支持 "${targetCapability}" 能力探测。`,
        fetchCallCount: 0,
        bodyRead: false,
        fieldSignal: "NOT_ATTEMPTED",
      };
    }

    if (!options.confirmPublicOnly) {
      return {
        capability: "BASIC_PROFILE",
        observedAt: new Date().toISOString(),
        outcome: "SKIPPED_NOT_CONFIGURED",
        note: "缺少 --confirm-public-only 确认参数，探针已安全跳过，未发送任何外部网络请求。",
        fetchCallCount: 0,
        bodyRead: false,
        fieldSignal: "NOT_ATTEMPTED",
      };
    }

    const targetUrl = options.url || options.probeUrlEnv?.trim() || "";
    if (!targetUrl || !validateProbeUrl(targetUrl)) {
      return {
        capability: "BASIC_PROFILE",
        observedAt: new Date().toISOString(),
        outcome: "SKIPPED_INVALID_CONFIGURATION",
        note: "URL 不符合严格受控规范（仅接受 https://space.bilibili.com/<纯数字UID>），探针已安全跳过，未发送任何外部网络请求。",
        fetchCallCount: 0,
        bodyRead: false,
        fieldSignal: "NOT_ATTEMPTED",
      };
    }

    if (options.fieldValidationEnv !== "true") {
      return {
        capability: "BASIC_PROFILE",
        observedAt: new Date().toISOString(),
        outcome: "SKIPPED_NOT_CONFIGURED",
        note: "未配置 BILIPROFILE_FIELD_VALIDATION_ENABLED=true 环境变量，字段验证已安全跳过，未发送任何外部网络请求。",
        fetchCallCount: 0,
        bodyRead: false,
        fieldSignal: "NOT_ATTEMPTED",
      };
    }

    return executeControlledRequest(
      "BASIC_PROFILE",
      targetUrl,
      false, // isProfileLabelMode
      true, // isFieldMode
      customFetch
    );
  }

  // 3. Standard Reachability Mode Gate Check
  if (options.capability && !VALID_CAPABILITY_NAMES.includes(options.capability as ConnectorCapabilityType)) {
    return {
      capability: options.capability as ConnectorCapabilityType,
      observedAt: new Date().toISOString(),
      outcome: "UNSUPPORTED",
      note: `非法的能力名称: "${options.capability}"，探针已安全跳过，未发送任何外部网络请求。`,
      fetchCallCount: 0,
      bodyRead: false,
      fieldSignal: "NOT_ATTEMPTED",
      profileLabelSignal: "NOT_ATTEMPTED",
    };
  }

  // Capability Attribution Isolation (Phase 4.7.5 Hardened):
  // Standard mode ONLY allows BASIC_PROFILE.
  // PUBLIC_FOLLOWS and PUBLIC_CONTENT must NOT attribute personal space reachability to follows/content.
  if (targetCapability === "PUBLIC_FOLLOWS" || targetCapability === "PUBLIC_CONTENT") {
    return {
      capability: targetCapability,
      observedAt: new Date().toISOString(),
      outcome: "SKIPPED_NOT_CONFIGURED",
      note: `当前没有经单独审核的 [${targetCapability}] 能力候选来源；不得将个人主页 URL 的结果归属为关注或内容能力，探针已安全跳过，未发送任何外部网络请求。`,
      fetchCallCount: 0,
      bodyRead: false,
      fieldSignal: "NOT_ATTEMPTED",
      profileLabelSignal: "NOT_ATTEMPTED",
    };
  }

  if (!options.confirmPublicOnly) {
    return {
      capability: targetCapability,
      observedAt: new Date().toISOString(),
      outcome: "SKIPPED_NOT_CONFIGURED",
      note: "缺少 --confirm-public-only 确认参数，探针已安全跳过，未发送任何外部网络请求。",
      fetchCallCount: 0,
      bodyRead: false,
      fieldSignal: "NOT_ATTEMPTED",
      profileLabelSignal: "NOT_ATTEMPTED",
    };
  }

  const standardUrl = options.url || options.probeUrlEnv?.trim() || "";
  if (!standardUrl || !validateProbeUrl(standardUrl)) {
    return {
      capability: targetCapability,
      observedAt: new Date().toISOString(),
      outcome: "SKIPPED_INVALID_CONFIGURATION",
      note: "URL 不符合严格受控规范（仅接受 https://space.bilibili.com/<纯数字UID>），探针已安全跳过，未发送任何外部网络请求。",
      fetchCallCount: 0,
      bodyRead: false,
      fieldSignal: "NOT_ATTEMPTED",
      profileLabelSignal: "NOT_ATTEMPTED",
    };
  }

  return executeControlledRequest(
    "BASIC_PROFILE",
    standardUrl,
    false,
    false,
    customFetch
  );
}

/**
 * Helper to perform exactly 1 minimal controlled request after all gates passed.
 */
async function executeControlledRequest(
  capability: ConnectorCapabilityType,
  targetUrl: string,
  isProfileLabelMode: boolean,
  isFieldMode: boolean,
  customFetch: typeof fetch
): Promise<ProbeExecutionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const startTime = Date.now();
  let fetchCallCount = 0;
  let bodyRead = false;
  let fieldSignal: FieldSignalStatus = "NOT_ATTEMPTED";
  let profileLabelSignal: ProfileLabelSignalStatus = "NOT_ATTEMPTED";

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
    const contentLengthHeader = response.headers.get("content-length");
    const responseSizeBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

    let outcome: CapabilityStatus = "UNVERIFIED";
    let note = "";

    if (httpStatus === 200) {
      outcome = "PAGE_REACHABLE";
      if (isProfileLabelMode && isHtml && response.body) {
        bodyRead = true;
        const inspectRes = await inspectStreamForProfileLabel(response.body);
        profileLabelSignal = inspectRes.profileLabelSignal;
        note = "已在授权受控模式下完成单次最小展示名称标签信号探测；不提取、不打印、不持久化具体内容文本；基础资料能力继续保持 UNVERIFIED。";
        return {
          capability: "BASIC_PROFILE",
          statusCode: httpStatus,
          contentType,
          responseSizeBytes,
          elapsedMs,
          observedAt: new Date().toISOString(),
          outcome,
          note,
          fetchCallCount,
          bodyRead,
          profileLabelSignal,
        };
      } else if (isFieldMode && isHtml && response.body) {
        bodyRead = true;
        const basicProfileResult = await inspectBasicProfileSignalsFromStream(response.body);
        const titleFound = basicProfileResult.signals.displayName === "OBSERVED";
        fieldSignal = titleFound ? "TITLE_SIGNAL_OBSERVED" : "TITLE_SIGNAL_NOT_OBSERVED";
        note =
          "公开页面单次请求返回 HTTP 200。在安全阈值（≤64 KiB）与滑动窗口（≤2048 字符）内完成最小字段结构信号检测；不提取、不输出、不持久化具体内容；资料字段能力仍为 UNVERIFIED。";
        return {
          capability: "BASIC_PROFILE",
          statusCode: httpStatus,
          contentType,
          responseSizeBytes,
          elapsedMs,
          observedAt: new Date().toISOString(),
          outcome,
          note,
          fetchCallCount,
          bodyRead,
          fieldSignal,
          basicProfileSignals: basicProfileResult.signals,
        };
      } else {
        bodyRead = false;
        note = "公开页面单次请求返回 HTTP 200，仅代表页面网络可达，不代表已验证具体数据字段可读取。";
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
      capability,
      statusCode: httpStatus,
      contentType,
      responseSizeBytes,
      elapsedMs,
      observedAt: new Date().toISOString(),
      outcome,
      note,
      fetchCallCount,
      bodyRead,
      fieldSignal,
      profileLabelSignal,
    };
  } catch {
    const elapsedMs = Date.now() - startTime;
    return {
      capability,
      elapsedMs,
      observedAt: new Date().toISOString(),
      outcome: "NETWORK_ERROR",
      note: "网络连接异常或请求超时，探针已安全终止。",
      fetchCallCount,
      bodyRead,
      fieldSignal: "NOT_ATTEMPTED",
      profileLabelSignal: "NOT_ATTEMPTED",
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let isHelp = false;
  let capability: string | undefined;
  let url: string | undefined;
  let confirmPublicOnly = false;
  let isFieldMode = false;
  let isProfileLabelMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      isHelp = true;
    } else if (arg === "--capability" && i + 1 < args.length) {
      capability = args[++i];
    } else if (arg === "--url" && i + 1 < args.length) {
      url = args[++i];
    } else if (arg === "--uid" && i + 1 < args.length) {
      const uidArg = args[++i];
      url = `https://space.bilibili.com/${uidArg}`;
    } else if (arg === "--confirm-public-only" || arg === "--i-have-permission") {
      confirmPublicOnly = true;
    } else if (arg === "--field") {
      isFieldMode = true;
    } else if (arg === "--profile-label") {
      isProfileLabelMode = true;
    }
  }

  return { isHelp, capability, url, confirmPublicOnly, isFieldMode, isProfileLabelMode };
}

function printHelp() {
  console.log("=================================================");
  console.log("🔍 BiliProfile Analyzer — 公开数据能力验证探针 (Phase 4.0/4.3.1/4.4.1)");
  console.log("=================================================\n");
  console.log("[使用说明]");
  console.log("本探针用于对 Bilibili 公开数据能力进行单次、受控、手动的可达性与传输层状态检测。");
  console.log("默认不发送任何网络请求。\n");
  console.log("[执行格式]");
  console.log('npm run probe:bilibili -- --uid <纯数字UID> --i-have-permission');
  console.log('npm run probe:bilibili -- --capability <能力名> --url "https://space.bilibili.com/<UID>" --confirm-public-only');
  console.log('npm run probe:bilibili:profile-label (仅读取 .env 中的 BILIPROFILE_PROBE_URL，不接受 CLI --url 覆盖)\n');
  console.log("[合法能力名]");
  console.log("- BASIC_PROFILE   : 公开基础展示信息");
  console.log("- PUBLIC_FOLLOWS  : 公开关注列表");
  console.log("- PUBLIC_CONTENT  : 公开动态或投稿内容\n");
  console.log("[安全约束]");
  console.log("- URL 必须严格等于 https://space.bilibili.com/<纯数字UID>");
  console.log("- 必须显式携带 --confirm-public-only 确认参数 (或 profile-label 环境变量双确认)");
  console.log("- profile-label 模式严格固定使用 BILIPROFILE_PROBE_URL，不接受 CLI --url 覆盖");
  console.log("- 每次运行最多执行一次请求，不自动跟随重定向 (redirect: manual)");
  console.log("- 不携带 Cookie、Token、Authorization、credentials: omit");
  console.log("- 默认模式绝不读取响应正文；仅在多重门控下执行有限流式检测，绝不提取或保存正文");
  console.log("- 一次 HTTP 成功仅说明该 URL 可访问，不等同于该类数据能力已验证。\n");
  console.log("=================================================");
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
    // Ignore env file reading errors
  }
}

async function runPublicCapabilityProbe() {
  loadLocalEnv();
  const { isHelp, capability, url, confirmPublicOnly, isFieldMode, isProfileLabelMode } = parseCliArgs();

  // 1. Help mode or empty invocation -> Safe exit without network requests
  if (
    isHelp ||
    (!isProfileLabelMode && !capability && !url && !process.env.BILIPROFILE_PROBE_URL)
  ) {
    printHelp();
    return;
  }

  console.log("=================================================");
  console.log(`🔍 BiliProfile Analyzer — 公开能力验证探针 (${
    isProfileLabelMode
      ? "Phase 4.4 展示名称最小信号模式"
      : isFieldMode
      ? "Phase 4.2.1 最小字段信号模式"
      : "Phase 4.0/4.1 可达性模式"
  })`);
  console.log("=================================================\n");

  const result = await executeProbe({
    capability: isProfileLabelMode ? (capability || "BASIC_PROFILE") : capability,
    url,
    confirmPublicOnly,
    isFieldMode,
    isProfileLabelMode,
    fieldValidationEnv: process.env.BILIPROFILE_FIELD_VALIDATION_ENABLED,
    profileLabelValidationEnv: process.env.BILIPROFILE_PROFILE_LABEL_VALIDATION_ENABLED,
    probeUrlEnv: process.env.BILIPROFILE_PROBE_URL,
  });

  console.log("[探针结果输出]");
  console.log(`- 验证能力: ${result.capability}`);
  console.log(`- 判定结果: ${result.outcome}`);
  if (result.statusCode !== undefined) {
    console.log(`- HTTP 状态码: ${result.statusCode}`);
  }
  if (result.contentType !== undefined) {
    console.log(`- Content-Type: ${result.contentType}`);
  }
  if (result.responseSizeBytes !== undefined) {
    console.log(`- 响应大小: ${result.responseSizeBytes} 字节`);
  }
  if (result.elapsedMs !== undefined) {
    console.log(`- 请求耗时: ${result.elapsedMs} ms`);
  }
  if (result.fieldSignal !== undefined && result.fieldSignal !== "NOT_ATTEMPTED") {
    console.log(`- 字段信号: ${result.fieldSignal === "TITLE_SIGNAL_OBSERVED" ? "发现最小 title 信号" : "未发现最小 title 信号"}`);
  }
  if (result.profileLabelSignal !== undefined && result.profileLabelSignal !== "NOT_ATTEMPTED") {
    console.log(`- 最小展示名称信号: ${result.profileLabelSignal}`);
  }
  if (result.basicProfileSignals) {
    console.log("\n[最小候选字段结构信号判定]");
    console.log(`- displayName: ${result.basicProfileSignals.displayName}`);
    console.log(`- avatarUrl: ${result.basicProfileSignals.avatarUrl}`);
    console.log(`- signature: ${result.basicProfileSignals.signature}`);
  }
  console.log(`- 执行说明: ${result.note}`);
  console.log("\n⚠️ 提醒：一次 HTTP 成功仅说明该 URL 可访问，不等同于该类数据能力已验证。");
  console.log("=================================================");
}

// Only execute runner if invoked directly via CLI (not imported)
if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("bilibili-public-capability"))
) {
  runPublicCapabilityProbe().catch(() => {
    console.error("[探针异常] 执行过程发生未捕获异常，已安全退出。");
    process.exit(1);
  });
}
