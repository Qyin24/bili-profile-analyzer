/**
 * BiliProfile Analyzer — Probe Streaming Safety, URL & Profile Label Offline Self-Test (Phase 4.4.1 & 4.3.1)
 *
 * Tests:
 * 1. Strict URL Whitelist: Valid space URLs pass; all invalid variants fail.
 * 2. Parameter Clamping: 0.5, 0, negative, NaN, Infinity, oversized all securely fall back to defaultAndMax.
 * 3. Title tag split across multiple chunks is accurately recognized.
 * 4. Oversized single chunk strictly caps processing at 64 KiB (65536 bytes) and ignores title located beyond 64 KiB.
 * 5. Title tag within oversized chunk is recognized early without reading beyond safety cap.
 * 6. Sliding window rolling buffer never exceeds MAX_WINDOW_CHARS (2048 chars).
 * 7. Stream without title tag reaches EOF or cap and safely returns TITLE_SIGNAL_NOT_OBSERVED.
 * 8. Tight window tests: maxWindowChars = 1 and maxWindowChars = 255.
 * 9. Probe offline gating with injectable fake fetch:
 *    - Missing --confirm-public-only -> fetch count 0.
 *    - Invalid URL -> fetch count 0.
 *    - Missing field env flag when --field passed -> fetch count 0.
 *    - Field mode with PUBLIC_FOLLOWS or PUBLIC_CONTENT -> fetch count 0, outcome UNSUPPORTED.
 *    - Default mode -> exactly 1 fake fetch, response.body is NEVER read (bodyRead === false).
 *    - Field mode with valid config -> exactly 1 fake fetch, body is read, recognizes title in stream.
 *    - Non-HTML response in field mode -> exactly 1 fake fetch, body is NOT read (bodyRead === false).
 * 10. Phase 4.4.1 Profile Label mode offline self-tests:
 *    - Valid space title structure (name + 的个人空间) -> PROFILE_LABEL_SIGNAL_OBSERVED.
 *    - Ordinary non-empty title (e.g. 哔哩哔哩干杯) -> PROFILE_LABEL_SIGNAL_NOT_OBSERVED.
 *    - Title with "的个人空间" but empty name part (e.g. <title>的个人空间</title> or <title> 的个人空间</title>) -> PROFILE_LABEL_SIGNAL_NOT_OBSERVED.
 *    - Space profile title located after 64 KiB ceiling -> PROFILE_LABEL_SIGNAL_NOT_OBSERVED.
 *    - Non-BASIC_PROFILE capability (e.g. PUBLIC_FOLLOWS, PUBLIC_CONTENT) -> fetch count 0, outcome UNSUPPORTED.
 *    - CLI --url provided but BILIPROFILE_PROBE_URL missing/invalid -> fetch count 0, SKIPPED_NOT_CONFIGURED (CLI URL cannot bypass env).
 *    - Missing env -> fetch count 0, SKIPPED_NOT_CONFIGURED.
 *    - Invalid URL in env -> fetch count 0, SKIPPED_NOT_CONFIGURED.
 *    - Valid profile label execution -> exactly 1 fetch, body is read, label signal observed.
 * 11. Phase 4.2 Basic Profile Signal Inspector parameter clamping & stream safety tests.
 *
 * Safety:
 * - Operates completely offline with synthetic mock streams and fake fetch.
 * - Zero real external network calls.
 * - Does not return, output, or persist any mock title text.
 */

import {
  inspectStreamForTitleSignal,
  inspectStreamForProfileLabel,
  validateProbeUrl,
  clampSecurityCeiling,
  executeProbe,
  MAX_BYTES_CAP,
  MAX_WINDOW_CHARS,
} from "./bilibili-public-capability";
import {
  inspectStreamForBasicProfileSignals,
  clampSecurityCeiling as clampBasicProfileCeiling,
} from "./bilibili-basic-profile-signal";

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

async function runSelfTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — 探针流式读取、URL 白名单与离线门控自检 (Phase 4.4.1/4.3.1)");
  console.log("=================================================\n");

  let allPassed = true;

  // --- Module 1: Strict URL Whitelist Verification ---
  console.log("[模块 1] 严格 URL 白名单离线测试 (仅接受 https://space.bilibili.com/<纯数字UID>)...");
  {
    const validUrls = [
      "https://space.bilibili.com/202688",
      "https://space.bilibili.com/123456789/",
    ];

    const invalidUrls = [
      "http://space.bilibili.com/202688", // Not HTTPS
      "https://bilibili.com/202688", // Root domain
      "https://api.bilibili.com/x/space/acc/info?mid=202688", // API subdomain
      "https://b23.tv/202688", // Short domain
      "https://space.bilibili.com/", // Empty UID
      "https://space.bilibili.com/abc", // Non-digit UID
      "https://space.bilibili.com/202688/dynamic", // Subpath
      "https://space.bilibili.com/202688/favlist", // Subpath
      "https://space.bilibili.com/202688?from=search", // Query string
      "https://space.bilibili.com/202688#top", // Hash fragment
      "https://user:pass@space.bilibili.com/202688", // Credentials
      "https://space.bilibili.com:8443/202688", // Custom port
      "https://fake.space.bilibili.com/202688", // Multi-subdomain
      "https://space.bilibili.com.evil.com/202688", // Domain spoofing
      "",
    ];

    let validPassed = true;
    for (const u of validUrls) {
      if (!validateProbeUrl(u)) {
        console.error(`  ❌ 合法 URL 被误判为非法: "${u}"`);
        validPassed = false;
      }
    }

    let invalidPassed = true;
    for (const u of invalidUrls) {
      if (validateProbeUrl(u)) {
        console.error(`  ❌ 非法 URL 变体未被拦截: "${u}"`);
        invalidPassed = false;
      }
    }

    const pass1 = validPassed && invalidPassed;
    console.log(`  - 合法 URL 校验 (${validUrls.length} 个): ${validPassed ? "✅ 全部通过" : "❌ 失败"}`);
    console.log(`  - 非法 URL 拦截 (${invalidUrls.length} 个): ${invalidPassed ? "✅ 全部拦截" : "❌ 失败"}`);
    if (!pass1) allPassed = false;
  }

  // --- Module 2: Parameter Clamping & Ceiling Verification ---
  console.log("\n[模块 2] 参数安全钳制与不可突破硬顶离线测试 (clampSecurityCeiling)...");
  {
    const defaultMax = 65536;

    const clampCases: { input: unknown; expected: number; label: string }[] = [
      { input: 0.5, expected: defaultMax, label: "0.5 (floor 后为 0 < 1，必须回退到 defaultAndMax)" },
      { input: 0, expected: defaultMax, label: "0 (< 1，回退到 defaultAndMax)" },
      { input: -10, expected: defaultMax, label: "负数 (< 1，回退到 defaultAndMax)" },
      { input: NaN, expected: defaultMax, label: "NaN (回退到 defaultAndMax)" },
      { input: Infinity, expected: defaultMax, label: "Infinity (回退到 defaultAndMax)" },
      { input: "65536", expected: defaultMax, label: "非数字类型 (回退到 defaultAndMax)" },
      { input: null, expected: defaultMax, label: "null (回退到 defaultAndMax)" },
      { input: 10000000, expected: defaultMax, label: "10,000,000 超大数值 (强钳至 defaultAndMax)" },
      { input: 1024, expected: 1024, label: "1024 合法缩小参数 (允许按需缩紧)" },
      { input: 1, expected: 1, label: "1 合法最小正整数参数" },
    ];

    let clampPassed = true;
    for (const c of clampCases) {
      const actual = clampSecurityCeiling(c.input, defaultMax);
      if (actual !== c.expected) {
        console.error(`  ❌ 钳制失败 [${c.label}]: 输入 ${String(c.input)}, 预期 ${c.expected}, 实际 ${actual}`);
        clampPassed = false;
      }
    }

    console.log(`  - 参数安全回退与钳制 (${clampCases.length} 项测试): ${clampPassed ? "✅ 全部通过" : "❌ 失败"}`);
    if (!clampPassed) allPassed = false;
  }

  // --- Module 3: Synthetic Stream Title Signal Inspections ---
  console.log("\n[模块 3] 纯离线合成流 title 闭合标签检测与 64KiB/2048 字符硬上限测试...");
  {
    // Test 3.1: Title split across multiple chunks
    const chunks1 = [
      stringToUint8Array("<!DOCTYPE html><html><head><tit"),
      stringToUint8Array("le>Sample Space Profile Title</ti"),
      stringToUint8Array("tle></head><body><div>Content</div></body></html>"),
    ];
    const stream1 = createMockStream(chunks1);
    const result1 = await inspectStreamForTitleSignal(stream1);
    const pass3_1 = result1.fieldSignal === "TITLE_SIGNAL_OBSERVED";
    console.log(`  - 跨 Chunk 闭合标签识别: ${pass3_1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3_1) allPassed = false;

    // Test 3.2: Oversized chunk with title located AFTER 64 KiB cap (at byte 70000)
    const padding = "A".repeat(70000);
    const hiddenTitle = "<title>Late Title</title>";
    const largeContent = padding + hiddenTitle + "B".repeat(10000);
    const chunk2 = stringToUint8Array(largeContent);
    const stream2 = createMockStream([chunk2]);
    const result2 = await inspectStreamForTitleSignal(stream2, 65536, 2048);
    const pass3_2 =
      result2.bytesProcessed <= 65536 &&
      result2.fieldSignal === "TITLE_SIGNAL_NOT_OBSERVED";
    console.log(`  - 超大 Chunk 严格 64KiB 截断 (64KiB 外内容不被读取): ${pass3_2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3_2) allPassed = false;

    // Test 3.3: Title in first 100 bytes of oversized chunk
    const earlyTitleContent = "<!DOCTYPE html><head><title>Early</title></head>" + "X".repeat(70000);
    const chunk3 = stringToUint8Array(earlyTitleContent);
    const stream3 = createMockStream([chunk3]);
    const result3 = await inspectStreamForTitleSignal(stream3, 65536, 2048);
    const pass3_3 =
      result3.fieldSignal === "TITLE_SIGNAL_OBSERVED" &&
      result3.bytesProcessed <= 65536;
    console.log(`  - 超大 Chunk 头部信号命中早期熔断 (处理 <= 65536 字节): ${pass3_3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3_3) allPassed = false;

    // Test 3.4: Max observed buffer length never exceeds MAX_WINDOW_CHARS (2048)
    const stream4 = createMockStream([stringToUint8Array("A".repeat(5000) + "<title>T</title>")]);
    const result4 = await inspectStreamForTitleSignal(stream4, 65536, 2048);
    const pass3_4 = result4.maxObservedBufferLength <= 2048;
    console.log(`  - 滑动窗口内存上限约束 (峰值 ${result4.maxObservedBufferLength} <= 2048 字符): ${pass3_4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3_4) allPassed = false;

    // Test 3.5: Stream with NO title tag
    const stream5 = createMockStream([stringToUint8Array("<html><head></head><body>No title here</body></html>")]);
    const result5 = await inspectStreamForTitleSignal(stream5);
    const pass3_5 = result5.fieldSignal === "TITLE_SIGNAL_NOT_OBSERVED";
    console.log(`  - 无 title 标签安全退出 (TITLE_SIGNAL_NOT_OBSERVED): ${pass3_5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3_5) allPassed = false;

    // Test 3.6: maxWindowChars = 1 tight window constraint
    const stream6 = createMockStream([stringToUint8Array("<html><head><title>One</title></head></html>")]);
    const result6 = await inspectStreamForTitleSignal(stream6, 65536, 1);
    const pass3_6 = result6.maxObservedBufferLength <= 1;
    console.log(`  - 极限窗口 maxWindowChars=1 内存严格 <= 1 字符: ${pass3_6 ? "✅ 通过 (峰值: " + result6.maxObservedBufferLength + ")" : "❌ 失败"}`);
    if (!pass3_6) allPassed = false;

    // Test 3.7: maxWindowChars = 255
    const stream7 = createMockStream([stringToUint8Array("<html><head><title>Exact 255 Test Title</title></head><body>" + "Y".repeat(1000) + "</body></html>")]);
    const result7 = await inspectStreamForTitleSignal(stream7, 65536, 255);
    const pass3_7 = result7.maxObservedBufferLength <= 255 && result7.fieldSignal === "TITLE_SIGNAL_OBSERVED";
    console.log(`  - 收紧窗口 maxWindowChars=255 内存严格 <= 255 字符: ${pass3_7 ? "✅ 通过 (峰值: " + result7.maxObservedBufferLength + " / 255, 处理: " + result7.bytesProcessed + " 字节)" : "❌ 失败"}`);
    if (!pass3_7) allPassed = false;
  }

  // --- Module 4: Probe Execution Engine Offline Gating ---
  console.log("\n[模块 4] 探针执行引擎离线门控与零网络/不读 Body 断言 (executeProbe)...");
  {
    let fakeFetchCallCount = 0;
    const createFakeFetch = (status = 200, contentType = "text/html", bodyText = "<html><head><title>Space</title></head></html>") => {
      return async (): Promise<Response> => {
        fakeFetchCallCount++;
        return {
          status,
          headers: new Headers({ "content-type": contentType }),
          body: createMockStream([stringToUint8Array(bodyText)]),
        } as unknown as Response;
      };
    };

    // 4.1: Missing --confirm-public-only -> fetch count 0
    fakeFetchCallCount = 0;
    const res4_1 = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: "https://space.bilibili.com/202688",
        confirmPublicOnly: false,
      },
      createFakeFetch()
    );
    const pass4_1 = res4_1.fetchCallCount === 0 && fakeFetchCallCount === 0 && res4_1.outcome === "SKIPPED_NOT_CONFIGURED";
    console.log(`  - 缺少 --confirm-public-only 时网络请求数为 0: ${pass4_1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4_1) allPassed = false;

    // 4.2: Invalid URL -> fetch count 0
    fakeFetchCallCount = 0;
    const res4_2 = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: "https://api.bilibili.com/202688",
        confirmPublicOnly: true,
      },
      createFakeFetch()
    );
    const pass4_2 = res4_2.fetchCallCount === 0 && fakeFetchCallCount === 0 && res4_2.outcome === "SKIPPED_INVALID_CONFIGURATION";
    console.log(`  - 非法 URL 变体时网络请求数为 0: ${pass4_2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4_2) allPassed = false;

    // 4.3: Missing field env flag when --field passed -> fetch count 0
    fakeFetchCallCount = 0;
    const res4_3 = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: "https://space.bilibili.com/202688",
        confirmPublicOnly: true,
        isFieldMode: true,
        fieldValidationEnv: "false",
      },
      createFakeFetch()
    );
    const pass4_3 = res4_3.fetchCallCount === 0 && fakeFetchCallCount === 0 && res4_3.outcome === "SKIPPED_NOT_CONFIGURED";
    console.log(`  - --field 缺少环境开关时网络请求数为 0: ${pass4_3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4_3) allPassed = false;

    // 4.3b: Field mode with non-BASIC_PROFILE capability (PUBLIC_FOLLOWS) -> fetch count 0, outcome UNSUPPORTED
    fakeFetchCallCount = 0;
    const res4_3b = await executeProbe(
      {
        capability: "PUBLIC_FOLLOWS",
        url: "https://space.bilibili.com/202688",
        confirmPublicOnly: true,
        isFieldMode: true,
        fieldValidationEnv: "true",
      },
      createFakeFetch()
    );
    const pass4_3b =
      res4_3b.fetchCallCount === 0 &&
      fakeFetchCallCount === 0 &&
      res4_3b.outcome === "UNSUPPORTED" &&
      res4_3b.fieldSignal === "NOT_ATTEMPTED";
    console.log(`  - Field 模式指定 PUBLIC_FOLLOWS 拦截为 UNSUPPORTED 且网络请求数为 0: ${pass4_3b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4_3b) allPassed = false;

    // 4.3c: Field mode with non-BASIC_PROFILE capability (PUBLIC_CONTENT) -> fetch count 0, outcome UNSUPPORTED
    fakeFetchCallCount = 0;
    const res4_3c = await executeProbe(
      {
        capability: "PUBLIC_CONTENT",
        url: "https://space.bilibili.com/202688",
        confirmPublicOnly: true,
        isFieldMode: true,
        fieldValidationEnv: "true",
      },
      createFakeFetch()
    );
    const pass4_3c =
      res4_3c.fetchCallCount === 0 &&
      fakeFetchCallCount === 0 &&
      res4_3c.outcome === "UNSUPPORTED" &&
      res4_3c.fieldSignal === "NOT_ATTEMPTED";
    console.log(`  - Field 模式指定 PUBLIC_CONTENT 拦截为 UNSUPPORTED 且网络请求数为 0: ${pass4_3c ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4_3c) allPassed = false;

    // 4.4: Default Mode -> exactly 1 fetch, body is NEVER read
    fakeFetchCallCount = 0;
    let bodyWasRead = false;
    const defaultFakeFetch = async (): Promise<Response> => {
      fakeFetchCallCount++;
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        get body(): any {
          bodyWasRead = true;
          return createMockStream([stringToUint8Array("<title>Mock</title>")]);
        },
      } as unknown as Response;
    };
    const res4_4 = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: "https://space.bilibili.com/202688",
        confirmPublicOnly: true,
        isFieldMode: false,
      },
      defaultFakeFetch
    );
    const pass4_4 =
      res4_4.fetchCallCount === 1 &&
      fakeFetchCallCount === 1 &&
      res4_4.outcome === "PAGE_REACHABLE" &&
      res4_4.bodyRead === false &&
      bodyWasRead === false;
    console.log(`  - 默认可达性模式下仅调用 1 次 fetch 且绝不访问 response.body: ${pass4_4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4_4) allPassed = false;

    // 4.5: Valid Field Mode -> exactly 1 fetch, body is read
    fakeFetchCallCount = 0;
    const res4_5 = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: "https://space.bilibili.com/202688",
        confirmPublicOnly: true,
        isFieldMode: true,
        fieldValidationEnv: "true",
      },
      createFakeFetch(200, "text/html; charset=utf-8", "<!DOCTYPE html><head><title>Space</title></head>")
    );
    const pass4_5 =
      res4_5.fetchCallCount === 1 &&
      fakeFetchCallCount === 1 &&
      res4_5.bodyRead === true &&
      res4_5.fieldSignal === "TITLE_SIGNAL_OBSERVED";
    console.log(`  - 合法 Field 模式下调用 1 次 fetch 且识别合成流中 title 信号: ${pass4_5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4_5) allPassed = false;

    // 4.6: Non-HTML response in Field Mode -> body is NOT read
    fakeFetchCallCount = 0;
    let nonHtmlBodyRead = false;
    const nonHtmlFakeFetch = async (): Promise<Response> => {
      fakeFetchCallCount++;
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        get body(): any {
          nonHtmlBodyRead = true;
          return createMockStream([stringToUint8Array('{"code":0}')]);
        },
      } as unknown as Response;
    };
    const res4_6 = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: "https://space.bilibili.com/202688",
        confirmPublicOnly: true,
        isFieldMode: true,
        fieldValidationEnv: "true",
      },
      nonHtmlFakeFetch
    );
    const pass4_6 =
      res4_6.fetchCallCount === 1 &&
      fakeFetchCallCount === 1 &&
      res4_6.bodyRead === false &&
      nonHtmlBodyRead === false;
    console.log(`  - Field 模式遇到非 HTML 响应 (如 application/json) 绝不读取 body: ${pass4_6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4_6) allPassed = false;
  }

  // --- Module 5: Phase 4.4.1 Profile Label Signal Offline Tests ---
  console.log("\n[模块 5] Phase 4.4.1 个人空间展示名称收紧信号流式检测与能力范围离线自检...");
  {
    // 5.1: inspectStreamForProfileLabel with valid space title structure (name + 的个人空间)
    const validStream1 = createMockStream([
      stringToUint8Array("<!DOCTYPE html><html><head><title>"),
      stringToUint8Array("测试用户的个人空间_哔哩哔哩_bilibili"),
      stringToUint8Array("</title></head><body></body></html>"),
    ]);
    const res5_1 = await inspectStreamForProfileLabel(validStream1);
    const pass5_1 = res5_1.profileLabelSignal === "PROFILE_LABEL_SIGNAL_OBSERVED";
    console.log(`  - [5.1] 有效个人空间标题结构通过 (PROFILE_LABEL_SIGNAL_OBSERVED): ${pass5_1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_1) allPassed = false;

    // 5.2: inspectStreamForProfileLabel with ordinary non-empty title (no "的个人空间") -> NOT_OBSERVED
    const ordinaryStream = createMockStream([
      stringToUint8Array("<!DOCTYPE html><html><head><title>哔哩哔哩 (゜-゜)つロ 干杯~-bilibili</title></head><body></body></html>"),
    ]);
    const res5_2 = await inspectStreamForProfileLabel(ordinaryStream);
    const pass5_2 = res5_2.profileLabelSignal === "PROFILE_LABEL_SIGNAL_NOT_OBSERVED";
    console.log(`  - [5.2] 任意普通非空 title 被拒绝 (PROFILE_LABEL_SIGNAL_NOT_OBSERVED): ${pass5_2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_2) allPassed = false;

    // 5.3: inspectStreamForProfileLabel with "的个人空间" but empty name part -> NOT_OBSERVED
    const emptyNameStream = createMockStream([
      stringToUint8Array("<!DOCTYPE html><html><head><title>的个人空间</title></head></html>"),
    ]);
    const res5_3 = await inspectStreamForProfileLabel(emptyNameStream);
    const pass5_3 = res5_3.profileLabelSignal === "PROFILE_LABEL_SIGNAL_NOT_OBSERVED";
    console.log(`  - [5.3] 无名称前缀的个人空间标题被拒绝 (PROFILE_LABEL_SIGNAL_NOT_OBSERVED): ${pass5_3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_3) allPassed = false;

    // 5.3b: inspectStreamForProfileLabel with only whitespace name part before "的个人空间" -> NOT_OBSERVED
    const whitespaceNameStream = createMockStream([
      stringToUint8Array("<!DOCTYPE html><html><head><title>   的个人空间   </title></head></html>"),
    ]);
    const res5_3b = await inspectStreamForProfileLabel(whitespaceNameStream);
    const pass5_3b = res5_3b.profileLabelSignal === "PROFILE_LABEL_SIGNAL_NOT_OBSERVED";
    console.log(`  - [5.3b] 仅空格名称前缀被拒绝 (PROFILE_LABEL_SIGNAL_NOT_OBSERVED): ${pass5_3b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_3b) allPassed = false;

    // 5.4: Signal located AFTER 64 KiB ceiling -> NOT_OBSERVED
    const padding = "A".repeat(70000);
    const lateSpaceTitle = "<title>延迟用户的个人空间</title>";
    const lateChunk = stringToUint8Array(padding + lateSpaceTitle);
    const lateStream = createMockStream([lateChunk]);
    const res5_4 = await inspectStreamForProfileLabel(lateStream, 65536, 2048);
    const pass5_4 =
      res5_4.bytesProcessed <= 65536 &&
      res5_4.profileLabelSignal === "PROFILE_LABEL_SIGNAL_NOT_OBSERVED";
    console.log(`  - [5.4] 信号在 64 KiB 上限之后时不被识别 (处理 ${res5_4.bytesProcessed} 字节): ${pass5_4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_4) allPassed = false;

    // 5.5: profile-label mode with non-BASIC_PROFILE capability -> UNSUPPORTED, fetch count 0
    let fakeFetchCallCount = 0;
    const fakeFetch = async (): Promise<Response> => {
      fakeFetchCallCount++;
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        body: createMockStream([stringToUint8Array("<title>测试用户的个人空间</title>")]),
      } as unknown as Response;
    };

    const res5_5a = await executeProbe(
      {
        isProfileLabelMode: true,
        capability: "PUBLIC_FOLLOWS",
        profileLabelValidationEnv: "true",
        probeUrlEnv: "https://space.bilibili.com/202688",
      },
      fakeFetch
    );
    const res5_5b = await executeProbe(
      {
        isProfileLabelMode: true,
        capability: "PUBLIC_CONTENT",
        profileLabelValidationEnv: "true",
        probeUrlEnv: "https://space.bilibili.com/202688",
      },
      fakeFetch
    );
    const pass5_5 =
      res5_5a.fetchCallCount === 0 &&
      res5_5a.outcome === "UNSUPPORTED" &&
      res5_5b.fetchCallCount === 0 &&
      res5_5b.outcome === "UNSUPPORTED" &&
      fakeFetchCallCount === 0;
    console.log(`  - [5.5] Profile-label 模式指定非 BASIC_PROFILE 时拦截且网络请求数为 0: ${pass5_5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_5) allPassed = false;

    // 5.6: Profile-label mode missing env -> fetch count 0, SKIPPED_NOT_CONFIGURED
    fakeFetchCallCount = 0;
    const res5_6 = await executeProbe(
      {
        isProfileLabelMode: true,
        profileLabelValidationEnv: "false",
        probeUrlEnv: "https://space.bilibili.com/202688",
      },
      fakeFetch
    );
    const pass5_6 =
      res5_6.fetchCallCount === 0 &&
      fakeFetchCallCount === 0 &&
      res5_6.outcome === "SKIPPED_NOT_CONFIGURED" &&
      res5_6.capability === "BASIC_PROFILE" &&
      res5_6.profileLabelSignal === "NOT_ATTEMPTED";
    console.log(`  - [5.6] Profile-label 模式缺少环境变量时网络请求数为 0: ${pass5_6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_6) allPassed = false;

    // 5.7: Profile-label mode invalid URL in env -> fetch count 0, SKIPPED_NOT_CONFIGURED
    fakeFetchCallCount = 0;
    const res5_7 = await executeProbe(
      {
        isProfileLabelMode: true,
        profileLabelValidationEnv: "true",
        probeUrlEnv: "https://api.bilibili.com/202688",
      },
      fakeFetch
    );
    const pass5_7 =
      res5_7.fetchCallCount === 0 &&
      fakeFetchCallCount === 0 &&
      res5_7.outcome === "SKIPPED_NOT_CONFIGURED" &&
      res5_7.capability === "BASIC_PROFILE" &&
      res5_7.profileLabelSignal === "NOT_ATTEMPTED";
    console.log(`  - [5.7] Profile-label 模式遇到环境变量 URL 非法时网络请求数为 0: ${pass5_7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_7) allPassed = false;

    // 5.7b: Profile-label mode with CLI --url provided but probeUrlEnv empty -> fetch count 0 (CLI URL cannot bypass env)
    fakeFetchCallCount = 0;
    const res5_7b = await executeProbe(
      {
        isProfileLabelMode: true,
        url: "https://space.bilibili.com/99999", // CLI url
        profileLabelValidationEnv: "true",
        probeUrlEnv: "", // Missing env URL
      },
      fakeFetch
    );
    const pass5_7b =
      res5_7b.fetchCallCount === 0 &&
      fakeFetchCallCount === 0 &&
      res5_7b.outcome === "SKIPPED_NOT_CONFIGURED";
    console.log(`  - [5.7b] Profile-label 传入 CLI --url 但缺少环境变量时拦截且请求数为 0: ${pass5_7b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_7b) allPassed = false;

    // 5.8: Profile-label valid execution -> exactly 1 fetch, body is read, label signal observed, capability is BASIC_PROFILE
    fakeFetchCallCount = 0;
    const res5_8 = await executeProbe(
      {
        isProfileLabelMode: true,
        profileLabelValidationEnv: "true",
        probeUrlEnv: "https://space.bilibili.com/202688",
      },
      fakeFetch
    );
    const pass5_8 =
      res5_8.fetchCallCount === 1 &&
      fakeFetchCallCount === 1 &&
      res5_8.bodyRead === true &&
      res5_8.capability === "BASIC_PROFILE" &&
      res5_8.profileLabelSignal === "PROFILE_LABEL_SIGNAL_OBSERVED";
    console.log(`  - [5.8] Profile-label 模式合法配置下调用 1 次 fetch 且识别有效展示名称信号: ${pass5_8 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5_8) allPassed = false;
  }

  // --- Module 6: Phase 4.2 Basic Profile Signal Inspector Parameter Clamping & Safety Tests ---
  console.log("\n[模块 6] Phase 4.2 基础资料信号检查器参数安全钳制与 64KiB 上限测试...");
  {
    const defaultMax = 65536;

    // 6.1: Test clampBasicProfileCeiling on abnormal values
    const abnormalInputs = [
      { input: 10000000, label: "10,000,000" },
      { input: NaN, label: "NaN" },
      { input: Infinity, label: "Infinity" },
      { input: 0, label: "0" },
      { input: -50, label: "-50" },
      { input: 0.5, label: "0.5" },
    ];

    let clampAllPassed = true;
    for (const item of abnormalInputs) {
      const clamped = clampBasicProfileCeiling(item.input, defaultMax);
      if (clamped !== defaultMax) {
        console.error(`  ❌ Basic Profile 参数钳制失败 [${item.label}]: 结果 ${clamped} !== ${defaultMax}`);
        clampAllPassed = false;
      }
    }
    console.log(`  - [6.1] 异常参数 (NaN/Infinity/0/负数/小数/超大) 均安全回退至 64 KiB: ${clampAllPassed ? "✅ 全部通过" : "❌ 失败"}`);
    if (!clampAllPassed) allPassed = false;

    // 6.2: Stream inspection with oversized input and abnormal maxBytesCap
    const largeHtml =
      "<!DOCTYPE html><html><head>" +
      "<link rel=\"canonical\" href=\"https://space.bilibili.com/202688\" />" +
      "<title>测试用户的个人空间</title>" +
      "</head><body><img src=\"https://i0.hdslb.com/bfs/face/avatar.jpg\" />" +
      "Z".repeat(80000) +
      "</body></html>";

    const stream6_2 = createMockStream([stringToUint8Array(largeHtml)]);
    const res6_2 = await inspectStreamForBasicProfileSignals(stream6_2, 999999);
    const pass6_2 =
      res6_2.bytesProcessed <= 65536 &&
      res6_2.hasCanonicalOrSpaceSignal &&
      res6_2.hasNonEmptyTitleSignal &&
      res6_2.hasAvatarRefSignal &&
      res6_2.overallSignal === "FIELD_SIGNALS_PRESENT";
    console.log(`  - [6.2] 超大流在异常参数下字节截断依然严格 <= 65536 (实际: ${res6_2.bytesProcessed}) 且命中信号: ${pass6_2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6_2) allPassed = false;

    // 6.3: Stream missing avatar reference
    const noAvatarHtml =
      "<!DOCTYPE html><html><head>" +
      "<link rel=\"canonical\" href=\"https://space.bilibili.com/202688\" />" +
      "<title>测试用户的个人空间</title>" +
      "</head><body><div>无头像内容</div></body></html>";
    const stream6_3 = createMockStream([stringToUint8Array(noAvatarHtml)]);
    const res6_3 = await inspectStreamForBasicProfileSignals(stream6_3, NaN);
    const pass6_3 =
      res6_3.hasCanonicalOrSpaceSignal &&
      res6_3.hasNonEmptyTitleSignal &&
      !res6_3.hasAvatarRefSignal &&
      res6_3.overallSignal === "FIELD_SIGNALS_NOT_DETECTED";
    console.log(`  - [6.3] 缺失必要信号时安全判定为 FIELD_SIGNALS_NOT_DETECTED: ${pass6_3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6_3) allPassed = false;
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 所有离线流式安全、URL 白名单与探针门控自检全部通过！");
    console.log("=================================================\n");
  } else {
    console.error("❌ 部分自检项目未通过，请检查探针逻辑。");
    console.log("=================================================\n");
    process.exit(1);
  }
}

runSelfTests().catch((err) => {
  console.error("自检脚本执行异常:", err);
  process.exit(1);
});
