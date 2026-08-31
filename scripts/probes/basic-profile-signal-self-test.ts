/**
 * BiliProfile Analyzer — Basic Profile Minimal Field Signal & Value Offline Self-Test (Phase 4.7 Hardened)
 *
 * Tests:
 * 1. All 3 signals absent in synthetic chunk -> all NOT_OBSERVED.
 * 2. Individual single signal observed -> exactly 1 OBSERVED, other 2 NOT_OBSERVED.
 * 3. Multi-signal synthetic fixture -> all 3 OBSERVED.
 * 4. Signal split across stream chunks is recognized accurately.
 * 5. Signals beyond byte limit are NOT read (byte cap enforced).
 * 6. Hard window constraints: maxObservedBufferLength <= safeMaxWindowChars.
 * 7. Controlled probe network gates & environment protection (Phase 4.4e / 4.7):
 *    - 7.1 Missing --allow-network -> INVALID_INPUT, fetch calls = 0
 *    - 7.2 Invalid UID (non-digit, empty) -> INVALID_INPUT, fetch calls = 0
 *    - 7.3 Production environment refusal (NODE_ENV=production) -> INVALID_INPUT, fetch calls = 0
 *    - 7.4 Valid synthetic probe -> CONTROLLED_LIVE_PROBE, mock fetch calls = 1
 *    - 7.5 Redirection response (302/301) -> UNREACHABLE, no redirect follow
 *    - 7.6 Non-HTML / Empty body response -> UNREACHABLE, no body read
 *    - 7.7 Zero data leakage in results and logs
 * 8. Minimal Field Value Desensitized Validation (Phase 4.6 / 4.7):
 *    - 8.1 Unit validation for displayName (PARSED_NONEMPTY, PARSED_EMPTY_OR_ABSENT, PARSE_REJECTED, NOT_OBSERVED)
 *    - 8.2 Unit validation for avatarUrl (http/https URL syntax check, protocol-relative check, rejection of unsafe schemes like javascript/ftp/data)
 *    - 8.3 Unit validation for signature (PARSED_NONEMPTY, PARSED_EMPTY_OR_ABSENT, PARSE_REJECTED)
 *    - 8.4 Streaming value validation on synthetic fixtures with cap cutoff
 * 9. Connector status remains UNVERIFIED and zero network calls (fake fetch count = 0).
 *
 * Safety:
 * - Operates 100% offline with synthetic mock fixtures.
 * - Zero network calls, zero external API requests.
 */

import {
  inspectBasicProfileSignalsFromHtmlChunk,
  inspectBasicProfileSignalsFromStream,
  validateParsedDisplayName,
  validateParsedAvatarUrl,
  validateParsedSignature,
  PARSER_RULE_VERSION,
} from "./basic-profile-parser";
import { executeControlledLiveProbe } from "./controlled-basic-profile-probe";
import { BilibiliPublicConnector } from "../../src/lib/connectors/bilibili-public-connector";
import { MAX_BYTES_CAP, MAX_WINDOW_CHARS } from "./bilibili-public-capability";

function createMockStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function runBasicProfileSignalSelfTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — BASIC_PROFILE 最小字段信号与值校验离线自检 (Phase 4.7)");
  console.log("=================================================\n");

  let allPassed = true;
  let fakeFetchCallCount = 0;

  // Install spy on globalThis.fetch to guarantee 0 network calls
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((...args: unknown[]) => {
    fakeFetchCallCount++;
    throw new Error("UNAUTHORIZED NETWORK CALL: " + String(args[0]));
  }) as typeof globalThis.fetch;

  try {
    // --- Test 1: All 3 signals absent ---
    {
      const syntheticNoSignals = "<!DOCTYPE html><html><body><main><p>Generic page content</p></main></body></html>";
      const signals = inspectBasicProfileSignalsFromHtmlChunk(syntheticNoSignals);

      const passed =
        signals.displayName === "NOT_OBSERVED" &&
        signals.avatarUrl === "NOT_OBSERVED" &&
        signals.signature === "NOT_OBSERVED";

      console.log(`[测试 1] 三项字段信号均未出现: ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - displayName: ${signals.displayName}`);
      console.log(`  - avatarUrl: ${signals.avatarUrl}`);
      console.log(`  - signature: ${signals.signature}`);
      if (!passed) allPassed = false;
    }

    // --- Test 2: Single field signals in synthetic chunks ---
    {
      // 2.1 Only Display Name
      const syntheticNameOnly = '<!DOCTYPE html><html><head><meta property="og:title" content="Synthetic User" /></head></html>';
      const nameRes = inspectBasicProfileSignalsFromHtmlChunk(syntheticNameOnly);
      const pass2_1 =
        nameRes.displayName === "OBSERVED" &&
        nameRes.avatarUrl === "NOT_OBSERVED" &&
        nameRes.signature === "NOT_OBSERVED";

      // 2.2 Only Avatar URL
      const syntheticAvatarOnly = '<!DOCTYPE html><html><body><img class="h-avatar" src="https://example.com/synth-avatar.jpg" /></body></html>';
      const avatarRes = inspectBasicProfileSignalsFromHtmlChunk(syntheticAvatarOnly);
      const pass2_2 =
        avatarRes.displayName === "NOT_OBSERVED" &&
        avatarRes.avatarUrl === "OBSERVED" &&
        avatarRes.signature === "NOT_OBSERVED";

      // 2.3 Only Signature
      const syntheticSignOnly = '<!DOCTYPE html><html><head><meta name="description" content="Synthetic bio statement" /></head></html>';
      const signRes = inspectBasicProfileSignalsFromHtmlChunk(syntheticSignOnly);
      const pass2_3 =
        signRes.displayName === "NOT_OBSERVED" &&
        signRes.avatarUrl === "NOT_OBSERVED" &&
        signRes.signature === "OBSERVED";

      const passed = pass2_1 && pass2_2 && pass2_3;
      console.log(`[测试 2] 单项字段信号独立识别: ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 仅名称信号: ${pass2_1 ? "✅ 唯独 displayName 为 OBSERVED" : "❌ 失败"}`);
      console.log(`  - 仅头像信号: ${pass2_2 ? "✅ 唯独 avatarUrl 为 OBSERVED" : "❌ 失败"}`);
      console.log(`  - 仅签名信号: ${pass2_3 ? "✅ 唯独 signature 为 OBSERVED" : "❌ 失败"}`);
      if (!passed) allPassed = false;
    }

    // --- Test 3: Signals split across stream chunks ---
    {
      const chunks = [
        stringToUint8Array('<!DOCTYPE html><html><head><meta property="og:tit'),
        stringToUint8Array('le" content="Split User" /><img class="h-ava'),
        stringToUint8Array('tar" src="https://example.com/pic.jpg" /><h4 class="h-si'),
        stringToUint8Array('gn">Bio text</h4></head></html>'),
      ];

      const stream = createMockStream(chunks);
      const result = await inspectBasicProfileSignalsFromStream(stream);

      const passed =
        result.ruleVersion === PARSER_RULE_VERSION &&
        result.signals.displayName === "OBSERVED" &&
        result.signals.avatarUrl === "OBSERVED" &&
        result.signals.signature === "OBSERVED";

      console.log(`[测试 3] 跨 Chunk 边界的字段信号合成识别: ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 解析规则版本: ${result.ruleVersion}`);
      console.log(`  - displayName: ${result.signals.displayName}`);
      console.log(`  - avatarUrl: ${result.signals.avatarUrl}`);
      console.log(`  - signature: ${result.signals.signature}`);
      console.log(`  - 处理字节数: ${result.bytesProcessed}`);
      if (!passed) allPassed = false;
    }

    // --- Test 4: Signals placed after byte cap are ignored ---
    {
      const padding = "A".repeat(5000);
      const lateAvatarSignal = '<img class="h-avatar" src="https://example.com/pic.jpg" />';
      const streamContent = padding + lateAvatarSignal;

      // Restrict byte cap to 2048 bytes (signal at > 5000 bytes)
      const stream = createMockStream([stringToUint8Array(streamContent)]);
      const result = await inspectBasicProfileSignalsFromStream(stream, 2048, 512);

      const passed =
        result.bytesProcessed === 2048 &&
        result.signals.avatarUrl === "NOT_OBSERVED";

      console.log(`[测试 4] 超出字节上限后停止解析 (cap 2048): ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 实际处理字节数: ${result.bytesProcessed} / 2048`);
      console.log(`  - avatarUrl 判定: ${result.signals.avatarUrl} (超限信号未被读取)`);
      if (!passed) allPassed = false;
    }

    // --- Test 5: Sliding window buffer memory invariant ---
    {
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < 10; i++) {
        chunks.push(stringToUint8Array("M".repeat(500)));
      }

      const stream = createMockStream(chunks);
      const result = await inspectBasicProfileSignalsFromStream(stream, MAX_BYTES_CAP, 128);

      const passed = result.maxObservedBufferLength <= 128;
      console.log(`[测试 5] 滑动窗口严格内存约束 (≤ 128 字符): ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 峰值缓冲区长度: ${result.maxObservedBufferLength} / 上限 128`);
      if (!passed) allPassed = false;
    }

    // --- Test 6: Controlled probe execution gates & environment protection (Phase 4.7) ---
    {
      // 6.1 Missing --allow-network
      const res6_1 = await executeControlledLiveProbe({ allowNetwork: false, uid: "1715629066" });
      const pass6_1 = res6_1.outcome === "INVALID_INPUT" && res6_1.fetchCallCount === 0;

      // 6.1b Missing dual confirmation env vars
      delete process.env.BILIPROFILE_FIELD_VALIDATION_ENABLED;
      delete process.env.BILIPROFILE_OWNER_AUTHORIZED;
      const res6_1b = await executeControlledLiveProbe({ allowNetwork: true, uid: "1715629066" });
      const pass6_1b = res6_1b.outcome === "INVALID_INPUT" && res6_1b.fetchCallCount === 0;

      // Setup dual confirmation env vars for remaining tests
      process.env.BILIPROFILE_FIELD_VALIDATION_ENABLED = "true";
      process.env.BILIPROFILE_OWNER_AUTHORIZED = "true";

      // 6.2 Invalid UID
      const res6_2 = await executeControlledLiveProbe({ allowNetwork: true, uid: "invalid_uid_abc" });
      const pass6_2 = res6_2.outcome === "INVALID_INPUT" && res6_2.fetchCallCount === 0;

      // 6.3 Production environment refusal
      const envObj = process.env as Record<string, string | undefined>;
      const originalNodeEnv = envObj.NODE_ENV;
      envObj.NODE_ENV = "production";
      const res6_3 = await executeControlledLiveProbe({ allowNetwork: true, uid: "1715629066" });
      envObj.NODE_ENV = originalNodeEnv;
      const pass6_3 = res6_3.outcome === "INVALID_INPUT" && res6_3.fetchCallCount === 0;

      // 6.4 Synthetic live probe execution with mock fetch (HTTP 200 HTML)
      let mockFetchCalls = 0;
      const mockFetch = (async (url: string) => {
        mockFetchCalls++;
        const syntheticHtml = '<!DOCTYPE html><html><head><meta property="og:title" content="User" /><img class="h-avatar" src="https://example.com/a.jpg" /><h4 class="h-sign">Bio</h4></head></html>';
        return new Response(createMockStream([stringToUint8Array(syntheticHtml)]), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }) as unknown as typeof fetch;

      const res6_4 = await executeControlledLiveProbe(
        { allowNetwork: true, uid: "1715629066" },
        mockFetch
      );
      const pass6_4 =
        res6_4.outcome === "SIGNALS_OBSERVED" &&
        res6_4.observationSource === "CONTROLLED_LIVE_PROBE" &&
        res6_4.signals.displayName === "OBSERVED" &&
        res6_4.signals.avatarUrl === "OBSERVED" &&
        res6_4.signals.signature === "OBSERVED" &&
        res6_4.valueValidation?.displayName === "PARSED_NONEMPTY" &&
        res6_4.valueValidation?.avatarUrl === "PARSED_NONEMPTY" &&
        res6_4.valueValidation?.avatarUrlSyntaxValid === true &&
        res6_4.valueValidation?.signature === "PARSED_NONEMPTY" &&
        mockFetchCalls === 1 &&
        res6_4.fetchCallCount === 1;

      // 6.5 Redirection response (HTTP 302 -> UNREACHABLE, no redirect followed)
      const mockRedirectFetch = (async () => {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://passport.bilibili.com/login" },
        });
      }) as unknown as typeof fetch;
      const res6_5 = await executeControlledLiveProbe(
        { allowNetwork: true, uid: "1715629066" },
        mockRedirectFetch
      );
      const pass6_5 = res6_5.outcome === "UNREACHABLE" && res6_5.httpStatus === 302 && res6_5.fetchCallCount === 1;

      // 6.6 Non-HTML / Empty body response (HTTP 200 JSON -> UNREACHABLE without reading body)
      const mockJsonFetch = (async () => {
        return new Response(JSON.stringify({ code: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;
      const res6_6 = await executeControlledLiveProbe(
        { allowNetwork: true, uid: "1715629066" },
        mockJsonFetch
      );
      const pass6_6 = res6_6.outcome === "UNREACHABLE" && res6_6.fetchCallCount === 1;

      // 6.7 Zero data leakage check: ensure summary does not leak UID or URL
      const pass6_7 =
        !res6_4.summary.includes("1715629066") &&
        !res6_4.summary.includes("https://") &&
        !res6_4.summary.includes("User");

      // Clean up test env vars
      delete process.env.BILIPROFILE_FIELD_VALIDATION_ENABLED;
      delete process.env.BILIPROFILE_OWNER_AUTHORIZED;

      const passed6 = pass6_1 && pass6_1b && pass6_2 && pass6_3 && pass6_4 && pass6_5 && pass6_6 && pass6_7;
      console.log(`[测试 6] 受控探针显式执行门控与环境加固 (Phase 4.7): ${passed6 ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 缺少 --allow-network 时 fetch 拦截: ${pass6_1 ? "✅ 拦截成功 (调用数 0)" : "❌ 失败"}`);
      console.log(`  - 缺少双确认环境变量时 fetch 拦截: ${pass6_1b ? "✅ 拦截成功 (调用数 0)" : "❌ 失败"}`);
      console.log(`  - 非法 UID 时 fetch 拦截: ${pass6_2 ? "✅ 拦截成功 (调用数 0)" : "❌ 失败"}`);
      console.log(`  - 生产环境 (NODE_ENV=production) 拒绝执行: ${pass6_3 ? "✅ 拦截成功 (调用数 0)" : "❌ 失败"}`);
      console.log(`  - 合法参数时 mock fetch: ${pass6_4 ? "✅ 恰好调用 1 次且来源为 CONTROLLED_LIVE_PROBE" : "❌ 失败"}`);
      console.log(`  - HTTP 3xx 重定向响应按规范不予跟随: ${pass6_5 ? "✅ 通过 (UNREACHABLE)" : "❌ 失败"}`);
      console.log(`  - 非 HTML 响应安全判定且不读正文: ${pass6_6 ? "✅ 通过 (UNREACHABLE)" : "❌ 失败"}`);
      console.log(`  - 结果脱敏无泄漏: ${pass6_7 ? "✅ 摘要不含 UID/URL/字段文本" : "❌ 失败"}`);
      if (!passed6) allPassed = false;
    }

    // --- Test 7: Minimal Field Value Validation Unit & Streaming Tests (Phase 4.6 / 4.7) ---
    {
      // 7.1 displayName validation
      const pass7_1 =
        validateParsedDisplayName("Valid Name") === "PARSED_NONEMPTY" &&
        validateParsedDisplayName("   ") === "PARSED_EMPTY_OR_ABSENT" &&
        validateParsedDisplayName("Bad\u0000Name") === "PARSE_REJECTED" &&
        validateParsedDisplayName(null) === "NOT_OBSERVED";

      // 7.2 avatarUrl validation (http/https allowed, ftp/javascript/data rejected, protocol-relative normalized)
      const avatar1 = validateParsedAvatarUrl("https://example.com/pic.jpg");
      const avatar2 = validateParsedAvatarUrl("//i0.hdslb.com/bfs/face/xxx.jpg");
      const avatar3 = validateParsedAvatarUrl("javascript:alert(1)");
      const avatar4 = validateParsedAvatarUrl("ftp://example.com/pic.jpg");
      const avatar5 = validateParsedAvatarUrl("data:image/png;base64,xxx");
      const avatar6 = validateParsedAvatarUrl("   ");
      const avatar7 = validateParsedAvatarUrl(null);
      const pass7_2 =
        avatar1.status === "PARSED_NONEMPTY" && avatar1.isValidHttpUrl === true &&
        avatar2.status === "PARSED_NONEMPTY" && avatar2.isValidHttpUrl === true &&
        avatar3.status === "PARSE_REJECTED" && avatar3.isValidHttpUrl === false &&
        avatar4.status === "PARSE_REJECTED" && avatar4.isValidHttpUrl === false &&
        avatar5.status === "PARSE_REJECTED" && avatar5.isValidHttpUrl === false &&
        avatar6.status === "PARSED_EMPTY_OR_ABSENT" && avatar6.isValidHttpUrl === false &&
        avatar7.status === "NOT_OBSERVED" && avatar7.isValidHttpUrl === false;

      // 7.3 signature validation
      const pass7_3 =
        validateParsedSignature("Valid signature text") === "PARSED_NONEMPTY" &&
        validateParsedSignature("   ") === "PARSED_EMPTY_OR_ABSENT" &&
        validateParsedSignature("Corrupted\u0001text") === "PARSE_REJECTED" &&
        validateParsedSignature(null) === "NOT_OBSERVED";

      // 7.4 Streaming validation with empty bio and invalid avatar scheme
      const synthStreamHtml = '<!DOCTYPE html><html><head><meta property="og:title" content="Tester" /><img class="h-avatar" src="data:image/png;base64,xxx" /><h4 class="h-sign">   </h4></head></html>';
      const streamRes = await inspectBasicProfileSignalsFromStream(
        createMockStream([stringToUint8Array(synthStreamHtml)]),
        MAX_BYTES_CAP,
        MAX_WINDOW_CHARS,
        true
      );

      const pass7_4 =
        streamRes.valueValidation?.displayName === "PARSED_NONEMPTY" &&
        streamRes.valueValidation?.avatarUrl === "PARSE_REJECTED" &&
        streamRes.valueValidation?.avatarUrlSyntaxValid === false &&
        streamRes.valueValidation?.signature === "PARSED_EMPTY_OR_ABSENT";

      const passed7 = pass7_1 && pass7_2 && pass7_3 && pass7_4;
      console.log(`[测试 7] 最小字段值脱敏解析与校验单元测试 (Phase 4.7): ${passed7 ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - displayName 纯内存校验: ${pass7_1 ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - avatarUrl 语法与协议合法性校验 (支持 http/https/相对协议，拦截 ftp/js/data): ${pass7_2 ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - signature 纯内存校验: ${pass7_3 ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 流式多状态合成校验 (空签名+非法头像协议): ${pass7_4 ? "✅ 通过" : "❌ 失败"}`);
      if (!passed7) allPassed = false;
    }

    // --- Test 8: Connector immutability & Zero Network ---
    {
      const connector = new BilibiliPublicConnector();
      const status = connector.getCapabilityStatus("BASIC_PROFILE");
      const fetchResult = await connector.fetchBasicProfile("1715629066");

      const passed =
        status === "UNVERIFIED" &&
        !fetchResult.success &&
        fetchResult.status === "UNVERIFIED_BLOCKED" &&
        fetchResult.data === null &&
        fakeFetchCallCount === 0;

      console.log(`[测试 8] Connector 状态保持 UNVERIFIED 且门控严格拦截 (零网络调用): ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - Connector 状态: ${status}`);
      console.log(`  - fetchBasicProfile 结果: status=${fetchResult.status}, data=${fetchResult.data}`);
      console.log(`  - fake fetch 调用总数: ${fakeFetchCallCount}`);
      if (!passed) allPassed = false;
    }

    console.log("\n=================================================");
    if (allPassed && fakeFetchCallCount === 0) {
      console.log("🎉 所有 BASIC_PROFILE 最小字段信号与值校验离线自检全部通过！(外部网络调用: 0)");
      console.log("=================================================\n");
    } else {
      console.error("❌ 部分自检项目未通过。");
      console.log("=================================================\n");
      process.exit(1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runBasicProfileSignalSelfTests().catch((err) => {
  console.error("离线自检异常:", err);
  process.exit(1);
});
