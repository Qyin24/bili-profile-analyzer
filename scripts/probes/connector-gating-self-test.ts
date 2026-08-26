/**
 * BiliProfile Analyzer — Connector Capability Gating Offline Self-Test (Phase 4.3.1)
 * 
 * Offline Verification Suite:
 * 1. UNVERIFIED capability calls (BASIC_PROFILE, PUBLIC_FOLLOWS, PUBLIC_CONTENT) return structured skipped results (UNVERIFIED_BLOCKED, data: null).
 * 2. Fake/Spied fetch call count is strictly 0.
 * 3. PAGE_REACHABLE state CANNOT unlock field gate (UNVERIFIED_BLOCKED, data: null).
 * 4. AVAILABLE_PUBLIC state strictly returns IMPLEMENTATION_NOT_AVAILABLE with data: null and zero network calls.
 * 5. Defensive parameter sanitization on inspectStreamForTitleSignal handles invalid and oversized inputs safely.
 */

import { BilibiliPublicConnector } from "../../src/lib/connectors/bilibili-public-connector";
import { inspectStreamForTitleSignal, MAX_BYTES_CAP, MAX_WINDOW_CHARS } from "./bilibili-public-capability";

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

async function runConnectorGatingSelfTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — 能力门控 Connector 离线自检 (Phase 4.3.1)");
  console.log("=================================================\n");

  let allPassed = true;
  let fakeFetchCallCount = 0;

  // Install fake fetch spy
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((...args: unknown[]) => {
    fakeFetchCallCount++;
    throw new Error("UNAUTHORIZED NETWORK CALL IN TEST: " + String(args[0]));
  }) as typeof globalThis.fetch;

  try {
    const testUid = "202688";

    // --- Test 1: Default UNVERIFIED capabilities are strictly blocked with data: null ---
    {
      const connector = new BilibiliPublicConnector();

      const profileRes = await connector.fetchBasicProfile(testUid);
      const followsRes = await connector.fetchPublicFollows(testUid);
      const contentRes = await connector.fetchPublicContent(testUid);

      const passed =
        !profileRes.success &&
        profileRes.status === "UNVERIFIED_BLOCKED" &&
        profileRes.data === null &&
        !followsRes.success &&
        followsRes.status === "UNVERIFIED_BLOCKED" &&
        followsRes.data === null &&
        !contentRes.success &&
        contentRes.status === "UNVERIFIED_BLOCKED" &&
        contentRes.data === null;

      console.log(`[测试 1] 默认 UNVERIFIED 状态全部拦截 (data 为 null): ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - BASIC_PROFILE: ${profileRes.status} (data: ${profileRes.data})`);
      console.log(`  - PUBLIC_FOLLOWS: ${followsRes.status} (data: ${followsRes.data})`);
      console.log(`  - PUBLIC_CONTENT: ${contentRes.status} (data: ${contentRes.data})`);
      if (!passed) allPassed = false;
    }

    // --- Test 2: Verify zero network calls were attempted ---
    {
      const passed = fakeFetchCallCount === 0;
      console.log(`[测试 2] 零网络请求保证 (Fake fetch 调用次数为 0): ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 实际发起的网络调用次数: ${fakeFetchCallCount}`);
      if (!passed) allPassed = false;
    }

    // --- Test 3: PAGE_REACHABLE state CANNOT unlock field gate ---
    {
      const reachableConnector = new BilibiliPublicConnector({
        BASIC_PROFILE: "PAGE_REACHABLE",
        PUBLIC_FOLLOWS: "UNVERIFIED",
        PUBLIC_CONTENT: "UNVERIFIED",
      });

      const profileRes = await reachableConnector.fetchBasicProfile(testUid);
      const passed =
        !profileRes.success &&
        profileRes.status === "UNVERIFIED_BLOCKED" &&
        profileRes.data === null;

      console.log(`[测试 3] PAGE_REACHABLE 状态绝不放行字段门控 (data 为 null): ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 门控判定: ${profileRes.status}, data: ${profileRes.data}`);
      if (!passed) allPassed = false;
    }

    // --- Test 4: AVAILABLE_PUBLIC strictly returns IMPLEMENTATION_NOT_AVAILABLE with data: null ---
    {
      const availableConnector = new BilibiliPublicConnector({
        BASIC_PROFILE: "AVAILABLE_PUBLIC",
        PUBLIC_FOLLOWS: "AVAILABLE_PUBLIC",
        PUBLIC_CONTENT: "AVAILABLE_PUBLIC",
      });

      const profileRes = await availableConnector.fetchBasicProfile(testUid);
      const followsRes = await availableConnector.fetchPublicFollows(testUid);
      const contentRes = await availableConnector.fetchPublicContent(testUid);

      const passed =
        !profileRes.success &&
        profileRes.status === "IMPLEMENTATION_NOT_AVAILABLE" &&
        profileRes.data === null &&
        profileRes.fallbackApplied === true &&
        !followsRes.success &&
        followsRes.status === "IMPLEMENTATION_NOT_AVAILABLE" &&
        followsRes.data === null &&
        followsRes.fallbackApplied === true &&
        !contentRes.success &&
        contentRes.status === "IMPLEMENTATION_NOT_AVAILABLE" &&
        contentRes.data === null &&
        contentRes.fallbackApplied === true &&
        fakeFetchCallCount === 0;

      console.log(`[测试 4] AVAILABLE_PUBLIC 绝不伪造成功数据 (返回 IMPLEMENTATION_NOT_AVAILABLE, data 为 null, 零网络调用): ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - BASIC_PROFILE 结果: success=${profileRes.success}, status=${profileRes.status}, data=${profileRes.data}`);
      console.log(`  - PUBLIC_FOLLOWS 结果: success=${followsRes.success}, status=${followsRes.status}, data=${followsRes.data}`);
      console.log(`  - PUBLIC_CONTENT 结果: success=${contentRes.success}, status=${contentRes.status}, data=${contentRes.data}`);
      if (!passed) allPassed = false;
    }

    // --- Test 5: Defensive parameter sanitization on inspectStreamForTitleSignal ---
    {
      const chunk = stringToUint8Array("<!DOCTYPE html><html><head><title>Test</title></head></html>");

      // Pass invalid negative, NaN, zero parameters
      const resNegative = await inspectStreamForTitleSignal(createMockStream([chunk]), -100 as unknown as number, 0 as unknown as number);
      const resNaN = await inspectStreamForTitleSignal(createMockStream([chunk]), NaN as unknown as number, NaN as unknown as number);
      const resOversized = await inspectStreamForTitleSignal(createMockStream([chunk]), 10 * 1024 * 1024, 100000);

      const passed =
        resNegative.fieldSignal === "TITLE_SIGNAL_OBSERVED" &&
        resNaN.fieldSignal === "TITLE_SIGNAL_OBSERVED" &&
        resOversized.fieldSignal === "TITLE_SIGNAL_OBSERVED" &&
        resOversized.bytesProcessed <= MAX_BYTES_CAP &&
        resOversized.maxObservedBufferLength <= MAX_WINDOW_CHARS;

      console.log(`[测试 5] 流式探针参数防御性回退 (非法/超大参数强钳至安全上限): ${passed ? "✅ 通过" : "❌ 失败"}`);
      console.log(`  - 负数参数降级执行结果: ${resNegative.fieldSignal}`);
      console.log(`  - NaN 参数降级执行结果: ${resNaN.fieldSignal}`);
      console.log(`  - 超大参数执行结果: ${resOversized.fieldSignal} (bytes <= ${MAX_BYTES_CAP}, buffer <= ${MAX_WINDOW_CHARS})`);
      if (!passed) allPassed = false;
    }

    console.log("\n=================================================");
    if (allPassed && fakeFetchCallCount === 0) {
      console.log("🎉 所有 5 项能力门控与离线安全自检全部通过！(网络调用总数: 0)");
      console.log("=================================================\n");
    } else {
      console.error("❌ 部分自检项目未通过，请检查门控逻辑。");
      console.log("=================================================\n");
      process.exit(1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runConnectorGatingSelfTests().catch((err) => {
  console.error("能力门控自检脚本执行异常:", err);
  process.exit(1);
});
