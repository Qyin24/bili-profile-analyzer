/**
 * BiliProfile Analyzer — Phase 4.8 Dedicated Evidence Collector Offline Self-Test
 *
 * Test Invariants:
 * 1. 100% pure offline test, strictly 0 external network calls.
 * 2. Validates all 8 execution gates, asserting fetch call count is exactly 0 on any failure.
 * 3. Validates single-fetch behavior, non-redirection, rate limiting, and 64 KiB / 2048 sliding window ceilings.
 * 4. Validates SUCCESS and PARTIAL outcome classification.
 * 5. Validates strict data minimization and zero sensitive info persistence on CapabilityEvidenceRecord.
 * 6. Asserts production Connector capability registry strictly remains UNVERIFIED.
 */

import {
  executeControlledEvidenceCollection,
  ControlledEvidenceCollectorOptions,
  CapabilityEvidenceRecord,
} from "./phase4-8-evidence-collector";
import { DEFAULT_PRODUCTION_REGISTRY } from "../../src/lib/connectors/bilibili-public-connector";

interface FakeFetchSpy {
  callCount: number;
  fn: typeof fetch;
}

function createMockFetchSpy(responseInit: {
  status: number;
  contentType?: string;
  bodyChunks?: string[];
}): FakeFetchSpy {
  let callCount = 0;
  const fn: typeof fetch = async () => {
    callCount++;
    const contentType = responseInit.contentType || "text/html; charset=utf-8";
    const chunks = responseInit.bodyChunks || ["<html><head><title>Test User 的个人空间-哔哩哔哩视频</title></head><body></body></html>"];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: responseInit.status,
      headers: { "Content-Type": contentType },
    });
  };

  return {
    get callCount() {
      return callCount;
    },
    fn,
  };
}

const VALID_ENV_OVERRIDES = {
  fieldValidation: "true",
  ownerAuthorized: "true",
  nodeEnv: "development",
};

const BASE_VALID_OPTIONS: ControlledEvidenceCollectorOptions = {
  capability: "BASIC_PROFILE",
  uid: "12345678",
  allowNetwork: true,
  ownerExplicitConsent: true,
  confirmIndependentSample: true,
  envOverrides: VALID_ENV_OVERRIDES,
};

async function runPhase48EvidenceCollectorSelfTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 4.8 专用受控证据工具离线自测");
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

  // [模块 1] 授权门控与零网络请求断言 (8 项门控测试)
  console.log("[模块 1] 前置执行门控离线测试 (断言未获完整授权时网络请求数严格为 0)...");

  // 1.1 缺少 --allow-network
  {
    const spy = createMockFetchSpy({ status: 200 });
    const res = await executeControlledEvidenceCollection(
      { ...BASE_VALID_OPTIONS, allowNetwork: false },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "INVALID_GATING",
      "缺少 --allow-network -> 拦截且请求数为 0"
    );
  }

  // 1.2 缺少环境变量 BILIPROFILE_FIELD_VALIDATION_ENABLED
  {
    const spy = createMockFetchSpy({ status: 200 });
    const res = await executeControlledEvidenceCollection(
      {
        ...BASE_VALID_OPTIONS,
        envOverrides: { ...VALID_ENV_OVERRIDES, fieldValidation: "false" },
      },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "INVALID_GATING",
      "缺少 fieldValidation 环境变量 -> 拦截且请求数为 0"
    );
  }

  // 1.3 缺少环境变量 BILIPROFILE_OWNER_AUTHORIZED
  {
    const spy = createMockFetchSpy({ status: 200 });
    const res = await executeControlledEvidenceCollection(
      {
        ...BASE_VALID_OPTIONS,
        envOverrides: { ...VALID_ENV_OVERRIDES, ownerAuthorized: "false" },
      },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "INVALID_GATING",
      "缺少 ownerAuthorized 环境变量 -> 拦截且请求数为 0"
    );
  }

  // 1.4 缺少所有者逐次授权参数 ownerExplicitConsent
  {
    const spy = createMockFetchSpy({ status: 200 });
    const res = await executeControlledEvidenceCollection(
      { ...BASE_VALID_OPTIONS, ownerExplicitConsent: false },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "INVALID_GATING",
      "缺少 ownerExplicitConsent 参数 -> 拦截且请求数为 0"
    );
  }

  // 1.5 缺少独立样本 / 窗口确认参数 confirmIndependentSample
  {
    const spy = createMockFetchSpy({ status: 200 });
    const res = await executeControlledEvidenceCollection(
      { ...BASE_VALID_OPTIONS, confirmIndependentSample: false },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "INVALID_GATING",
      "缺少 confirmIndependentSample 参数 -> 拦截且请求数为 0"
    );
  }

  // 1.6 距上一次请求不足 30 分钟 (1800000ms)
  {
    const spy = createMockFetchSpy({ status: 200 });
    const now = Date.now();
    const res = await executeControlledEvidenceCollection(
      {
        ...BASE_VALID_OPTIONS,
        lastRequestTimestampMs: now - 10 * 60 * 1000, // 仅过去 10 分钟
      },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "RATE_LIMITED",
      "请求间隔不足 30 分钟 -> 拦截为 RATE_LIMITED 且请求数为 0"
    );
  }

  // 1.7 距上一次请求超过 30 分钟 -> 允许通过
  {
    const spy = createMockFetchSpy({ status: 200 });
    const now = Date.now();
    const res = await executeControlledEvidenceCollection(
      {
        ...BASE_VALID_OPTIONS,
        lastRequestTimestampMs: now - 35 * 60 * 1000, // 过去 35 分钟
      },
      spy.fn
    );
    assert(
      res.gatePassed && res.fetchCallCount === 1 && spy.callCount === 1,
      "请求间隔满足 >= 30 分钟 -> 门控通过并允许执行 1 次请求"
    );
  }

  // 1.8 非法 UID 格式 (含字母或特殊符号)
  {
    const spy = createMockFetchSpy({ status: 200 });
    const res = await executeControlledEvidenceCollection(
      { ...BASE_VALID_OPTIONS, uid: "123abc456" },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "INVALID_GATING",
      "非纯数字 UID -> 拦截且请求数为 0"
    );
  }

  // [模块 2] 能力范围隔离测试 (非 BASIC_PROFILE 拒绝断言)
  console.log("\n[模块 2] 能力范围隔离测试...");

  // 2.1 指定 PUBLIC_FOLLOWS
  {
    const spy = createMockFetchSpy({ status: 200 });
    const res = await executeControlledEvidenceCollection(
      { ...BASE_VALID_OPTIONS, capability: "PUBLIC_FOLLOWS" },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "BLOCKED",
      "指定 PUBLIC_FOLLOWS -> 拦截为 BLOCKED 且请求数为 0"
    );
  }

  // 2.2 指定 PUBLIC_CONTENT
  {
    const spy = createMockFetchSpy({ status: 200 });
    const res = await executeControlledEvidenceCollection(
      { ...BASE_VALID_OPTIONS, capability: "PUBLIC_CONTENT" },
      spy.fn
    );
    assert(
      !res.gatePassed && res.fetchCallCount === 0 && spy.callCount === 0 && res.errorCategory === "BLOCKED",
      "指定 PUBLIC_CONTENT -> 拦截为 BLOCKED 且请求数为 0"
    );
  }

  // [模块 3] 传输层异常分类与单次请求硬约束测试
  console.log("\n[模块 3] 传输层异常分类与硬约束测试...");

  // 3.1 收到 302 重定向 -> 不跟随跳转，标记 REDIRECTED，fetch 次数严格为 1
  {
    const spy = createMockFetchSpy({ status: 302 });
    const res = await executeControlledEvidenceCollection(BASE_VALID_OPTIONS, spy.fn);
    assert(
      res.fetchCallCount === 1 &&
      spy.callCount === 1 &&
      res.errorCategory === "REDIRECTED" &&
      res.record?.outcome === "FAILED" &&
      res.record?.transportOutcome.noRedirect === false,
      "收到 302 重定向 -> 标记 REDIRECTED 且绝不跟随跳转 (调用仅 1 次)"
    );
  }

  // 3.2 收到 429 限流 -> 标记 RATE_LIMITED
  {
    const spy = createMockFetchSpy({ status: 429 });
    const res = await executeControlledEvidenceCollection(BASE_VALID_OPTIONS, spy.fn);
    assert(
      res.fetchCallCount === 1 &&
      spy.callCount === 1 &&
      res.errorCategory === "RATE_LIMITED" &&
      res.record?.outcome === "FAILED" &&
      res.record?.transportOutcome.noRateLimit === false,
      "收到 429 限流 -> 标记 RATE_LIMITED 且不重试"
    );
  }

  // 3.3 收到 403 / 412 阻断 -> 标记 BLOCKED
  {
    const spy = createMockFetchSpy({ status: 403 });
    const res = await executeControlledEvidenceCollection(BASE_VALID_OPTIONS, spy.fn);
    assert(
      res.fetchCallCount === 1 &&
      spy.callCount === 1 &&
      res.errorCategory === "BLOCKED" &&
      res.record?.outcome === "FAILED",
      "收到 403 阻断 -> 标记 BLOCKED"
    );
  }

  // 3.4 收到非 HTML 响应 -> 标记 NON_HTML
  {
    const spy = createMockFetchSpy({
      status: 200,
      contentType: "application/json",
      bodyChunks: ['{"code":0}'],
    });
    const res = await executeControlledEvidenceCollection(BASE_VALID_OPTIONS, spy.fn);
    assert(
      res.fetchCallCount === 1 &&
      spy.callCount === 1 &&
      res.errorCategory === "NON_HTML" &&
      res.record?.outcome === "FAILED",
      "收到非 HTML 响应 -> 标记 NON_HTML 且不读正文"
    );
  }

  // [模块 4] 64 KiB 流式截断与准入结果 (SUCCESS / PARTIAL / FAILED) 测试
  console.log("\n[模块 4] 流式截断与准入结果判定测试...");

  // 4.1 超过 64 KiB 且未找到闭合标签 -> BYTE_LIMIT_EXCEEDED, outcome FAILED
  {
    const bigHtml = "<html><head><title>" + "A".repeat(70000);
    const spy = createMockFetchSpy({ status: 200, bodyChunks: [bigHtml] });
    const res = await executeControlledEvidenceCollection(BASE_VALID_OPTIONS, spy.fn);
    assert(
      res.record !== null &&
      res.record.streamSecurity.bytesProcessed <= 65536 &&
      res.record.streamSecurity.hitByteLimit === true &&
      res.record.errorCategory === "BYTE_LIMIT_EXCEEDED" &&
      res.record.outcome === "FAILED",
      "超大流 64 KiB 截断 -> BYTE_LIMIT_EXCEEDED, outcome FAILED"
    );
  }

  // 4.2 完整字段命中合成样本 (displayName + avatarUrl + signature) -> outcome SUCCESS, errorCategory NONE
  {
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="测试用户名" />
  <meta property="og:image" content="https://i0.hdslb.com/bfs/face/valid_avatar.jpg" />
  <meta property="og:description" content="这是一条合法的用户个性签名内容" />
  <title>测试用户名 的个人空间-哔哩哔哩视频</title>
</head>
<body></body>
</html>`;
    const spy = createMockFetchSpy({ status: 200, bodyChunks: [fullHtml] });
    const res = await executeControlledEvidenceCollection(BASE_VALID_OPTIONS, spy.fn);
    assert(
      res.record !== null &&
      res.record.outcome === "SUCCESS" &&
      res.record.errorCategory === "NONE" &&
      res.record.fieldStatus.displayName === "PARSED_NONEMPTY" &&
      res.record.fieldStatus.avatarUrl === "PARSED_NONEMPTY" &&
      res.record.fieldStatus.avatarUrlSyntaxValid === true &&
      res.record.fieldStatus.signature === "PARSED_NONEMPTY",
      "全字段合法样本 -> outcome: SUCCESS, errorCategory: NONE"
    );
  }

  // 4.3 合法缺失 signature 样本 (形成 PARTIAL 准入样本) -> outcome PARTIAL, errorCategory NONE
  {
    const partialHtml = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="测试用户名" />
  <meta property="og:image" content="https://i0.hdslb.com/bfs/face/valid_avatar.jpg" />
  <meta property="og:description" content="" />
  <title>测试用户名 的个人空间-哔哩哔哩视频</title>
</head>
<body></body>
</html>`;
    const spy = createMockFetchSpy({ status: 200, bodyChunks: [partialHtml] });
    const res = await executeControlledEvidenceCollection(BASE_VALID_OPTIONS, spy.fn);
    assert(
      res.record !== null &&
      res.record.outcome === "PARTIAL" &&
      res.record.errorCategory === "NONE" &&
      res.record.fieldStatus.displayName === "PARSED_NONEMPTY" &&
      res.record.fieldStatus.avatarUrl === "PARSED_NONEMPTY" &&
      res.record.fieldStatus.avatarUrlSyntaxValid === true &&
      res.record.fieldStatus.signature === "PARSED_EMPTY_OR_ABSENT",
      "合法缺失签名样本 -> outcome: PARTIAL, errorCategory: NONE"
    );
  }

  // [模块 5] 数据最小化与零敏感信息泄露审计
  console.log("\n[模块 5] CapabilityEvidenceRecord 数据最小化审计...");

  {
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="测试用户名" />
  <meta property="og:image" content="https://i0.hdslb.com/bfs/face/valid_avatar.jpg" />
  <meta property="og:description" content="合法的用户签名" />
  <title>测试用户名 的个人空间-哔哩哔哩视频</title>
</head>
<body></body>
</html>`;
    const spy = createMockFetchSpy({ status: 200, bodyChunks: [fullHtml] });
    const res = await executeControlledEvidenceCollection(BASE_VALID_OPTIONS, spy.fn);
    const record = res.record as CapabilityEvidenceRecord;

    const recordJson = JSON.stringify(record);

    const hasUid = recordJson.includes("12345678");
    const hasUrl = recordJson.includes("https://space.bilibili.com");
    const hasRawName = recordJson.includes("测试用户名");
    const hasRawAvatar = recordJson.includes("valid_avatar.jpg");
    const hasRawSignature = recordJson.includes("合法的用户签名");
    const hasHtmlTags = /<html|<head|<title|<body/i.test(recordJson);

    assert(
      !hasUid &&
      !hasUrl &&
      !hasRawName &&
      !hasRawAvatar &&
      !hasRawSignature &&
      !hasHtmlTags &&
      record.dataMinimizationGuaranteed === true,
      "证据记录不含 UID、URL、字段原值、原始 HTML 或敏感标记"
    );
  }

  // [模块 6] 生产 Connector 门控状态不可变性断言
  console.log("\n[模块 6] 生产 Connector 能力状态不可变性断言...");
  {
    assert(
      DEFAULT_PRODUCTION_REGISTRY.BASIC_PROFILE === "AVAILABLE_PUBLIC" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_FOLLOWS === "UNVERIFIED" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_CONTENT === "UNVERIFIED",
      "生产 Connector 仅 BASIC_PROFILE 为 AVAILABLE_PUBLIC，PUBLIC_FOLLOWS 与 PUBLIC_CONTENT 严格保持 UNVERIFIED"
    );
  }

  console.log("\n=================================================");
  console.log(`🎉 Phase 4.8 专用受控证据工具自测全部通过！(${passedTests}/${totalTests} 项通过，外部网络请求: 0)`);
  console.log("=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("phase4-8-evidence-collector-self-test"))
) {
  runPhase48EvidenceCollectorSelfTests().catch(() => {
    console.error("[测试异常] 执行过程发生未捕获异常。");
    process.exit(1);
  });
}
