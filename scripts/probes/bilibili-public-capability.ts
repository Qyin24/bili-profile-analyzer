/**
 * BiliProfile Analyzer — Bilibili Public Capability Probe (Phase 4.3.1)
 * 
 * Safety & Compliance Rules:
 * 1. Default mode (`npm run probe:bilibili`): Only validates page reachability, NEVER reads response body.
 * 2. Field mode (`npm run probe:bilibili:field`): Requires BOTH BILIPROFILE_PROBE_URL and BILIPROFILE_FIELD_VALIDATION_ENABLED=true.
 * 3. Strictly validates target URL format: https://space.bilibili.com/<纯数字UID>.
 * 4. Uses redirect: "manual". Never follows redirects automatically; records REDIRECTED_NOT_FOLLOWED on 3xx.
 * 5. Uses honest User-Agent: "BiliProfileAnalyzerCapabilityProbe/0.1". Never spoofs browser UA.
 * 6. Hardened streaming reader with unbreakable upper ceilings:
 *    - Strict MAX_BYTES_CAP = 64 * 1024 (65536 bytes). Slices any chunk exceeding remaining bytes before decoding.
 *    - Strict MAX_WINDOW_CHARS = 2048 sliding window rolling buffer processed incrementally.
 *    - Unbreakable security clamp: parameters can ONLY be smaller, NEVER larger than defaults.
 *    - Cancels reader reliably in finally block.
 *    - ClearTimeout reliably in finally block.
 * 7. NEVER stores, logs, extracts, or returns actual title text string or page body.
 * 8. BASIC_PROFILE, PUBLIC_FOLLOWS, PUBLIC_CONTENT capability remain UNVERIFIED.
 */

import { ProbeResult, CapabilityStatus, FieldSignalStatus } from "../../src/types/connector";

export const MAX_BYTES_CAP = 64 * 1024; // 64 KiB strict hard ceiling
export const MAX_WINDOW_CHARS = 2048; // 2048 chars strict hard ceiling

export function validateProbeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);

    // Protocol must be https:
    if (parsed.protocol !== "https:") return false;

    // Hostname must strictly equal space.bilibili.com
    if (parsed.hostname !== "space.bilibili.com") return false;

    // No credentials or custom ports
    if (parsed.username || parsed.password || parsed.port) return false;

    // No query parameters or hash fragments
    if (parsed.search || parsed.hash) return false;

    // Pathname must strictly match /<digits>
    if (!/^\/[0-9]+$/.test(parsed.pathname)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Strictly clamps any parameter to at most defaultAndMax ceiling.
 * Illegal, zero, NaN, negative or oversized values securely fall back to defaultAndMax.
 * Callers can only request smaller bounds, never relax bounds.
 */
export function clampSecurityCeiling(val: unknown, defaultAndMax: number): number {
  if (typeof val !== "number" || isNaN(val) || !isFinite(val) || val <= 0) {
    return defaultAndMax;
  }
  const integerVal = Math.floor(val);
  return integerVal > defaultAndMax ? defaultAndMax : integerVal;
}

/**
 * Minimal streaming inspector for title tag closure signal.
 * - Strictly respects maxBytesCap clamped to MAX_BYTES_CAP (64 KiB).
 * - Maintains a fixed-size sliding window clamped to MAX_WINDOW_CHARS (2048).
 * - Slices chunks before decoding to guarantee byte-level limits.
 * - Immediately cancels reader when title closure is detected or byte cap reached.
 * - Never returns, stores, or logs the actual text inside the title tag.
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
  // Enforce unrelaxable security ceilings
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

      // Strictly process only up to remainingBytes
      const bytesToProcess = Math.min(value.byteLength, remainingBytes);
      const chunkSlice = value.byteLength === bytesToProcess ? value : value.subarray(0, bytesToProcess);

      // Process chunk in incremental steps of at most safeMaxWindowChars
      const stepSize = Math.max(256, Math.floor(safeMaxWindowChars / 2));
      for (let offset = 0; offset < chunkSlice.byteLength; offset += stepSize) {
        const subSlice = chunkSlice.subarray(offset, Math.min(offset + stepSize, chunkSlice.byteLength));
        bytesProcessed += subSlice.byteLength;

        const decodedSub = decoder.decode(subSlice, { stream: true });
        rollingBuffer += decodedSub;

        // Maintain sliding window buffer
        if (rollingBuffer.length > safeMaxWindowChars) {
          rollingBuffer = rollingBuffer.slice(-safeMaxWindowChars);
        }

        if (rollingBuffer.length > maxObservedBufferLength) {
          maxObservedBufferLength = rollingBuffer.length;
        }

        // Check if <title>...</title> closure pattern is detected
        if (/<title[^>]*>[\s\S]*?<\/title>/i.test(rollingBuffer)) {
          titleFound = true;
          break;
        }
      }

      if (titleFound) break;

      // If chunk exceeded remaining bytes, we hit cap
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

async function runPublicCapabilityProbe() {
  const isFieldMode = process.argv.includes("--field");
  const rawProbeUrl = process.env.BILIPROFILE_PROBE_URL?.trim();
  const isFieldValidationEnabled = process.env.BILIPROFILE_FIELD_VALIDATION_ENABLED === "true";

  console.log("=================================================");
  console.log(`🔍 BiliProfile Analyzer — 公开能力验证探针 (${isFieldMode ? "Phase 4.2.1 最小字段信号模式" : "Phase 4.0/4.1 可达性模式"})`);
  console.log("=================================================\n");

  // 1. Safety Check: Dual-guard for Field Mode, Single-guard for Reachability Mode
  if (isFieldMode) {
    if (!rawProbeUrl || !isFieldValidationEnabled) {
      const skippedResult: ProbeResult = {
        timestamp: new Date().toISOString(),
        capability: "BASIC_PROFILE",
        status: "SKIPPED_NOT_CONFIGURED",
        fieldSignal: "NOT_ATTEMPTED",
        message: "未同时配置 BILIPROFILE_PROBE_URL 与 BILIPROFILE_FIELD_VALIDATION_ENABLED=true，字段验证已安全跳过，未发送任何外部网络请求。",
      };

      console.log(`[安全检查] 双重环境变量配置: 未就绪`);
      console.log(`- BILIPROFILE_PROBE_URL: ${rawProbeUrl ? "已配置" : "未配置 (留空)"}`);
      console.log(`- BILIPROFILE_FIELD_VALIDATION_ENABLED: ${isFieldValidationEnabled ? "true" : "false/未配置"}`);
      console.log(`[探针结果] 能力验证状态: ${skippedResult.status}`);
      console.log(`[字段信号] ${skippedResult.fieldSignal}`);
      console.log(`[执行说明] ${skippedResult.message}\n`);
      console.log("=================================================");
      return;
    }
  } else {
    if (!rawProbeUrl) {
      const skippedResult: ProbeResult = {
        timestamp: new Date().toISOString(),
        capability: "BASIC_PROFILE",
        status: "SKIPPED_NOT_CONFIGURED",
        fieldSignal: "NOT_ATTEMPTED",
        message: "未配置 BILIPROFILE_PROBE_URL 环境变量，探针已安全跳过，未发送任何外部网络请求。",
      };

      console.log(`[安全检查] BILIPROFILE_PROBE_URL: 未配置 (留空)`);
      console.log(`[探针结果] 能力验证状态: ${skippedResult.status}`);
      console.log(`[执行说明] ${skippedResult.message}\n`);
      console.log("=================================================");
      return;
    }
  }

  // 2. Strict URL Validation: Only accept https://space.bilibili.com/<digits>
  if (!validateProbeUrl(rawProbeUrl)) {
    const invalidResult: ProbeResult = {
      timestamp: new Date().toISOString(),
      capability: "BASIC_PROFILE",
      status: "SKIPPED_INVALID_CONFIGURATION",
      fieldSignal: "NOT_ATTEMPTED",
      message: "URL 格式不符合受控安全规范（仅接受严格格式: https://space.bilibili.com/<纯数字UID>，且不允许附加查询参数或哈希），探针已安全跳过，未发送任何外部网络请求。",
    };

    console.log(`[安全检查] URL 校验未通过: 格式不符合严格受控规范`);
    console.log(`[探针结果] 能力验证状态: ${invalidResult.status}`);
    console.log(`[执行说明] ${invalidResult.message}`);
    console.log(`[规范说明] 仅允许格式: https://space.bilibili.com/<纯数字UID>\n`);
    console.log("=================================================");
    return;
  }

  console.log(`[探针配置] 目标格式校验通过，进入单次受控公开验证 (${isFieldMode ? "最小字段信号检测" : "纯可达性检测"})`);
  console.log(`[执行时间] ${new Date().toISOString()}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    // 3. Single minimal controlled request (Timeout: 5000ms, redirect: "manual", honest User-Agent)
    const response = await fetch(rawProbeUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "BiliProfileAnalyzerCapabilityProbe/0.1",
        "Accept": "text/html",
      },
      redirect: "manual",
    });

    const httpStatus = response.status;
    let status: CapabilityStatus = "UNVERIFIED";
    let fieldSignal: FieldSignalStatus = "NOT_ATTEMPTED";
    let message = "";

    // 4. Status Classification
    if (httpStatus === 200) {
      status = "PAGE_REACHABLE";

      // 5. Hardened Streaming Title Signal Reading (Only in Field Mode upon HTTP 200)
      if (isFieldMode && response.body) {
        const streamResult = await inspectStreamForTitleSignal(response.body);
        fieldSignal = streamResult.fieldSignal;
        message = fieldSignal === "TITLE_SIGNAL_OBSERVED"
          ? "公开页面单次请求返回 HTTP 200。仅短暂检查有限字节内是否存在 title 标签闭合信号；不提取、不保留、不输出 title 内容；资料字段能力仍为 UNVERIFIED。"
          : "公开页面单次请求返回 HTTP 200。在 64 KiB 阈值内未检测到闭合 <title> 信号；资料字段能力仍为 UNVERIFIED。";
      } else {
        message = "公开页面单次请求返回 HTTP 200，仅代表页面网络可达，不代表已验证具体数据字段可读取。";
      }
    } else if (httpStatus >= 300 && httpStatus < 400) {
      status = "REDIRECTED_NOT_FOLLOWED";
      message = `收到重定向响应 (HTTP ${httpStatus})，探针按规范不予跟随，未执行二次请求。`;
    } else if (httpStatus === 403 || httpStatus === 412) {
      status = "BLOCKED";
      message = `访问受限或触发安全防护 (HTTP ${httpStatus})，探针已安全停止，绝不尝试规避。`;
    } else if (httpStatus === 404) {
      status = "UNAVAILABLE_UNKNOWN";
      message = `目标页面不存在或状态未知 (HTTP ${httpStatus})。`;
    } else if (httpStatus === 429) {
      status = "RATE_LIMITED";
      message = "触发访问频率限制 (HTTP 429)，探针立即终止。";
    } else {
      status = "UNSUPPORTED";
      message = `响应状态异常 (HTTP ${httpStatus})。`;
    }

    const result: ProbeResult = {
      timestamp: new Date().toISOString(),
      capability: "BASIC_PROFILE",
      status,
      httpStatus,
      fieldSignal,
      message,
    };

    console.log("\n[探针结果输出]");
    console.log(`- 验证时间: ${result.timestamp}`);
    console.log(`- 能力类型: ${result.capability}`);
    console.log(`- 页面状态: ${result.status}`);
    console.log(`- HTTP 状态: ${result.httpStatus}`);
    if (isFieldMode) {
      console.log(`- 字段信号: ${result.fieldSignal === "TITLE_SIGNAL_OBSERVED" ? "发现最小 title 信号" : "未发现最小 title 信号"}`);
    }
    console.log(`- 验证说明: ${result.message}`);
    console.log("\n=================================================");
  } catch {
    const failureResult: ProbeResult = {
      timestamp: new Date().toISOString(),
      capability: "BASIC_PROFILE",
      status: "NETWORK_ERROR",
      fieldSignal: "NOT_ATTEMPTED",
      message: "网络连接异常或请求超时，探针已安全终止。",
    };

    console.log("\n[探针异常终止]");
    console.log(`- 状态: ${failureResult.status}`);
    console.log(`- 说明: ${failureResult.message}`);
    console.log("\n=================================================");
  } finally {
    clearTimeout(timer);
  }
}

// Only execute runner if invoked directly via CLI (not imported)
if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.includes("bilibili-public-capability"))) {
  runPublicCapabilityProbe().catch(() => {
    console.error("[探针异常] 执行过程发生未捕获异常，已安全退出。");
    process.exit(1);
  });
}
