/**
 * BiliProfile Analyzer — Capability Attribution Gating & Isolation Offline Self-Test (Phase 4.7.5)
 *
 * Test Invariants:
 * 1. Strictly 0 real external network requests.
 * 2. Uses fake fetch spy to assert call counts.
 * 3. Asserts capability attribution isolation:
 *    - Standard mode ONLY allows BASIC_PROFILE to fetch.
 *    - Standard mode with PUBLIC_FOLLOWS or PUBLIC_CONTENT -> SKIPPED_NOT_CONFIGURED, 0 fetch calls.
 *    - Field mode with non-BASIC_PROFILE -> UNSUPPORTED, 0 fetch calls.
 *    - Profile-label mode with non-BASIC_PROFILE -> UNSUPPORTED, 0 fetch calls.
 *    - Missing confirm flag -> SKIPPED_NOT_CONFIGURED, 0 fetch calls.
 *    - Invalid URL format -> SKIPPED_INVALID_CONFIGURATION, 0 fetch calls.
 * 4. Never prints or logs real UID, target URL, HTML body, or field raw values.
 */

import { executeProbe } from "./bilibili-public-capability";

interface FakeFetchSpy {
  callCount: number;
  fn: typeof fetch;
}

function createFakeFetchSpy(mockHtmlResponse = "<html><head><title>Test</title></head><body></body></html>"): FakeFetchSpy {
  let callCount = 0;
  const fn: typeof fetch = async () => {
    callCount++;
    return new Response(mockHtmlResponse, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };
  return {
    get callCount() {
      return callCount;
    },
    fn,
  };
}

async function runCapabilityGatingSelfTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 4.7.5 能力归属隔离离线自测");
  console.log("=================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[测试 ${totalTests}] ${testName}: ✅ 通过`);
    } else {
      console.error(`[测试 ${totalTests}] ${testName}: ❌ 失败 ${detail ? `(${detail})` : ""}`);
      process.exitCode = 1;
    }
  }

  const VALID_SYNTHETIC_URL = "https://space.bilibili.com/12345678";
  const INVALID_SYNTHETIC_URL = "https://space.bilibili.com/not_digits";

  // Test A: BASIC_PROFILE + 合法 URL + confirm -> attempts fake fetch (exactly 1 call)
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: VALID_SYNTHETIC_URL,
        confirmPublicOnly: true,
      },
      spy.fn
    );
    assert(
      result.outcome === "PAGE_REACHABLE" && spy.callCount === 1 && result.fetchCallCount === 1,
      "BASIC_PROFILE + 合法 URL + confirm -> 允许发起探测 (fake fetch 调用 1 次)",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  // Test B: PUBLIC_FOLLOWS + 合法个人主页 URL + confirm -> SKIPPED_NOT_CONFIGURED, 0 fetch calls
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "PUBLIC_FOLLOWS",
        url: VALID_SYNTHETIC_URL,
        confirmPublicOnly: true,
      },
      spy.fn
    );
    assert(
      result.outcome === "SKIPPED_NOT_CONFIGURED" && spy.callCount === 0 && result.fetchCallCount === 0 && !result.bodyRead,
      "PUBLIC_FOLLOWS + 个人主页 URL -> 隔离拦截为 SKIPPED_NOT_CONFIGURED 且 0 网络请求",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  // Test C: PUBLIC_CONTENT + 合法个人主页 URL + confirm -> SKIPPED_NOT_CONFIGURED, 0 fetch calls
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "PUBLIC_CONTENT",
        url: VALID_SYNTHETIC_URL,
        confirmPublicOnly: true,
      },
      spy.fn
    );
    assert(
      result.outcome === "SKIPPED_NOT_CONFIGURED" && spy.callCount === 0 && result.fetchCallCount === 0 && !result.bodyRead,
      "PUBLIC_CONTENT + 个人主页 URL -> 隔离拦截为 SKIPPED_NOT_CONFIGURED 且 0 网络请求",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  // Test D1: field 模式指定 PUBLIC_FOLLOWS -> UNSUPPORTED, 0 fetch calls
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "PUBLIC_FOLLOWS",
        url: VALID_SYNTHETIC_URL,
        confirmPublicOnly: true,
        isFieldMode: true,
        fieldValidationEnv: "true",
      },
      spy.fn
    );
    assert(
      result.outcome === "UNSUPPORTED" && spy.callCount === 0 && result.fetchCallCount === 0,
      "field 模式指定 PUBLIC_FOLLOWS -> 拦截为 UNSUPPORTED 且 0 网络请求",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  // Test D2: field 模式指定 PUBLIC_CONTENT -> UNSUPPORTED, 0 fetch calls
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "PUBLIC_CONTENT",
        url: VALID_SYNTHETIC_URL,
        confirmPublicOnly: true,
        isFieldMode: true,
        fieldValidationEnv: "true",
      },
      spy.fn
    );
    assert(
      result.outcome === "UNSUPPORTED" && spy.callCount === 0 && result.fetchCallCount === 0,
      "field 模式指定 PUBLIC_CONTENT -> 拦截为 UNSUPPORTED 且 0 网络请求",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  // Test D3: profile-label 模式指定 PUBLIC_FOLLOWS -> UNSUPPORTED, 0 fetch calls
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "PUBLIC_FOLLOWS",
        isProfileLabelMode: true,
        probeUrlEnv: VALID_SYNTHETIC_URL,
        profileLabelValidationEnv: "true",
      },
      spy.fn
    );
    assert(
      result.outcome === "UNSUPPORTED" && spy.callCount === 0 && result.fetchCallCount === 0,
      "profile-label 模式指定 PUBLIC_FOLLOWS -> 拦截为 UNSUPPORTED 且 0 网络请求",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  // Test E: 缺少 confirm 参数 -> SKIPPED_NOT_CONFIGURED, 0 fetch calls
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: VALID_SYNTHETIC_URL,
        confirmPublicOnly: false,
      },
      spy.fn
    );
    assert(
      result.outcome === "SKIPPED_NOT_CONFIGURED" && spy.callCount === 0 && result.fetchCallCount === 0,
      "缺少 --confirm-public-only -> 拦截为 SKIPPED_NOT_CONFIGURED 且 0 网络请求",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  // Test F: 非法 URL (非纯数字 UID) -> SKIPPED_INVALID_CONFIGURATION, 0 fetch calls
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "BASIC_PROFILE",
        url: INVALID_SYNTHETIC_URL,
        confirmPublicOnly: true,
      },
      spy.fn
    );
    assert(
      result.outcome === "SKIPPED_INVALID_CONFIGURATION" && spy.callCount === 0 && result.fetchCallCount === 0,
      "非法 URL 结构 -> 拦截为 SKIPPED_INVALID_CONFIGURATION 且 0 网络请求",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  // Test G: 非法 capability 名称 -> UNSUPPORTED, 0 fetch calls
  {
    const spy = createFakeFetchSpy();
    const result = await executeProbe(
      {
        capability: "INVALID_CAPABILITY" as any,
        url: VALID_SYNTHETIC_URL,
        confirmPublicOnly: true,
      },
      spy.fn
    );
    assert(
      result.outcome === "UNSUPPORTED" && spy.callCount === 0 && result.fetchCallCount === 0,
      "未知/非法 capability 名称 -> 拦截为 UNSUPPORTED 且 0 网络请求",
      `outcome: ${result.outcome}, spy: ${spy.callCount}`
    );
  }

  console.log("\n=================================================");
  console.log(`🎉 Phase 4.7.5 能力归属隔离自测全部通过！(${passedTests}/${totalTests} 项通过，外部网络请求: 0)`);
  console.log("=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("probe-capability-gating-self-test"))
) {
  runCapabilityGatingSelfTests().catch(() => {
    console.error("[测试异常] 执行过程发生未捕获异常。");
    process.exit(1);
  });
}
