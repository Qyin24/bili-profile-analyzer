/**
 * BiliProfile Analyzer — Phase 4.2: BASIC_PROFILE Production Capability Admission & Offline Integration Test
 *
 * Guarantees & Verification Invariants:
 * 1. Strictly 100% offline; zero real network requests (verified by global fetch interceptor).
 * 2. Production baseline capability status:
 *    - BASIC_PROFILE: AVAILABLE_PUBLIC (officially admitted)
 *    - PUBLIC_FOLLOWS: UNVERIFIED (fail-closed, 0 fetch)
 *    - PUBLIC_CONTENT: UNVERIFIED (fail-closed, 0 fetch)
 * 3. Default production connector allows BASIC_PROFILE without manual overrides.
 * 4. PUBLIC_FOLLOWS and PUBLIC_CONTENT remain strictly blocked at entrance gate.
 * 5. In-memory HTML/JSON parsing produces strictly compliant Phase 8.1 NormalizedBasicProfileInput (provenance: REAL_CONNECTOR).
 * 6. Zero sensitive data leakage (no raw HTML, cookies, tokens, credentials, or full URLs persisted).
 * 7. Full failure mode coverage (401, 403, 429, stream >64 KiB, network error) with honest degradation.
 * 8. Task execution service integrates DataSourceRun auditing with honest status (SUCCEEDED when available, SKIPPED_UNAVAILABLE when unverified).
 */

import { prisma } from "../../src/lib/prisma";
import {
  DEFAULT_PRODUCTION_REGISTRY,
  BilibiliPublicConnector,
  validateTargetUid,
} from "../../src/lib/connectors/bilibili-public-connector";
import {
  validateBasicProfileInputContract,
  basicProfileInputToPublicSourceRecord,
} from "../../src/lib/processing/basic-profile-input-contract";
import {
  executeTaskPipeline,
} from "../../src/lib/task-execution-service";
import { getDeterministicReportForTask } from "../../src/lib/deterministic-report-service";

// Track any un-mocked real fetch calls
let unmockedFetchCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args: any[]) => {
  unmockedFetchCount++;
  return originalFetch(...(args as [any, any]));
};

const TEST_TARGET_UID_PREFIX = "400188";
const TEST_TARGET_UID_1 = "40018801";
const TEST_TARGET_UID_2 = "40018802";

async function cleanupFixtures() {
  try {
    const targets = await prisma.analysisTarget.findMany({
      where: {
        platformUid: {
          startsWith: TEST_TARGET_UID_PREFIX,
        },
      },
      select: { id: true },
    });

    const targetIds = targets.map((t) => t.id);
    if (targetIds.length > 0) {
      await prisma.analysisTarget.deleteMany({
        where: { id: { in: targetIds } },
      });
    }
  } catch {
    // Ignore cleanup errors
  }
}

function createMockHtmlResponse(
  html: string,
  status: number = 200,
  contentType: string = "text/html; charset=utf-8"
): Response {
  const encoder = new TextEncoder();
  const uint8 = encoder.encode(html);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(uint8);
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: { "content-type": contentType },
  });
}

async function runPhase4ConnectorIntegrationTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 4.2 BASIC_PROFILE 准入离线集成测试");
  console.log("=================================================\n");

  let allPassed = true;
  await cleanupFixtures();

  try {
    // -------------------------------------------------------------------------
    // Test 1: Production Baseline & Gating Isolation
    // -------------------------------------------------------------------------
    console.log("[测试 1] 生产环境基线隔离与 PUBLIC_FOLLOWS / PUBLIC_CONTENT 默认拒绝拦截测试 (0 fetch)...");
    const defaultConnector = new BilibiliPublicConnector();

    const basicCap = defaultConnector.getCapabilityStatus("BASIC_PROFILE");
    const followsCap = defaultConnector.getCapabilityStatus("PUBLIC_FOLLOWS");
    const contentCap = defaultConnector.getCapabilityStatus("PUBLIC_CONTENT");

    const baselineStatuses =
      DEFAULT_PRODUCTION_REGISTRY.BASIC_PROFILE === "AVAILABLE_PUBLIC" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_FOLLOWS === "UNVERIFIED" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_CONTENT === "UNVERIFIED" &&
      basicCap === "AVAILABLE_PUBLIC" &&
      followsCap === "UNVERIFIED" &&
      contentCap === "UNVERIFIED";

    const fetchFollowsDefault = await defaultConnector.fetchPublicFollows("1715629066");
    const fetchContentDefault = await defaultConnector.fetchPublicContent("1715629066");

    const pass1 =
      baselineStatuses &&
      fetchFollowsDefault.success === false &&
      fetchFollowsDefault.status === "UNVERIFIED_BLOCKED" &&
      fetchFollowsDefault.data === null &&
      fetchFollowsDefault.fallbackApplied === true &&
      fetchContentDefault.success === false &&
      fetchContentDefault.status === "UNVERIFIED_BLOCKED" &&
      fetchContentDefault.data === null &&
      fetchContentDefault.fallbackApplied === true &&
      unmockedFetchCount === 0;

    console.log(`  - 生产注册表仅 BASIC_PROFILE 为 AVAILABLE_PUBLIC，其余两项恒为 UNVERIFIED 并严格拦截: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Input Target UID Validation
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 目标 UID 格式校验 (1-16 位纯数字)...");
    const pass2Uid =
      validateTargetUid("1715629066") === true &&
      validateTargetUid("202688") === true &&
      validateTargetUid("0") === true &&
      validateTargetUid("") === false &&
      validateTargetUid("abc") === false &&
      validateTargetUid("12345678901234567") === false && // 17 digits
      validateTargetUid("123 456") === false;

    const fetchInvalidUid = await defaultConnector.fetchBasicProfile("invalid_uid_abc");
    const pass2 = pass2Uid && fetchInvalidUid.status === "FAILED" && unmockedFetchCount === 0;

    console.log(`  - UID 格式严格校验与非法输入直接阻断: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Default Production Connector Extraction & Phase 8.1 Contract Mapping
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 默认生产 Connector 执行与 Phase 8.1 输入契约映射测试...");

    const mockSpaceHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>哔哩科技测评官的个人空间-哔哩哔哩视频</title>
  <meta name="description" content="专注于前沿科技与全栈架构深度评测">
  <meta property="og:image" content="https://i0.hdslb.com/bfs/face/mock_avatar_img_123.jpg">
</head>
<body>
  <div class="h-name">哔哩科技测评官</div>
</body>
</html>`;

    const mockFetchSuccess: typeof fetch = async () => {
      return createMockHtmlResponse(mockSpaceHtml, 200);
    };

    const extractResult = await defaultConnector.fetchBasicProfile("1715629066", {
      customFetch: mockFetchSuccess,
    });

    const pass3Success =
      extractResult.success === true &&
      extractResult.status === "SUCCESS" &&
      extractResult.data?.displayName === "哔哩科技测评官" &&
      extractResult.data?.sign === "专注于前沿科技与全栈架构深度评测" &&
      extractResult.data?.avatarUrl === undefined && // Zero raw URL leakage
      Boolean(extractResult.data?.normalizedInput);

    const normInput = extractResult.data?.normalizedInput;
    const contractVal = normInput ? validateBasicProfileInputContract(normInput) : { valid: false };

    const pass3Contract =
      contractVal.valid === true &&
      normInput?.provenance === "REAL_CONNECTOR" &&
      normInput?.displayName === "哔哩科技测评官" &&
      normInput?.description === "专注于前沿科技与全栈架构深度评测" &&
      normInput?.avatarIdentifier?.startsWith("avatar_hash_") &&
      normInput?.availability === "AVAILABLE" &&
      typeof normInput?.observedAt === "string";

    // Convert to PublicSourceRecord
    const sourceRecord = normInput ? basicProfileInputToPublicSourceRecord(normInput) : null;
    const pass3Adapter =
      sourceRecord !== null &&
      sourceRecord.sourceType === "PROFILE" &&
      sourceRecord.title === "哔哩科技测评官" &&
      sourceRecord.description === "专注于前沿科技与全栈架构深度评测" &&
      sourceRecord.sourceUrl === null;

    const pass3 = pass3Success && pass3Contract && pass3Adapter;
    console.log(`  - 基础资料成功提取、白名单校验通过并映射至 PublicSourceRecord: ${pass3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: Failure Modes & Boundary Handling
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 异常边界与错误分类测试 (401 / 403 / 429 / 流超限 / 网络异常)...");

    // 4.1 Auth required (401)
    const res401 = await defaultConnector.fetchBasicProfile("1715629066", {
      customFetch: async () => createMockHtmlResponse("要求登录", 401),
    });
    const pass401 = res401.status === "FAILED" && res401.reason.includes("认证或登录态");

    // 4.2 Blocked (403)
    const res403 = await defaultConnector.fetchBasicProfile("1715629066", {
      customFetch: async () => createMockHtmlResponse("访问被阻断", 403),
    });
    const pass403 = res403.status === "FAILED" && res403.reason.includes("403");

    // 4.3 Rate limited (429)
    const res429 = await defaultConnector.fetchBasicProfile("1715629066", {
      customFetch: async () => createMockHtmlResponse("请求过于频繁", 429),
    });
    const pass429 = res429.status === "RATE_LIMITED" && res429.reason.includes("429");

    // 4.4 Stream >64 KiB
    const largeHtml = "A".repeat(70 * 1024);
    const resLarge = await defaultConnector.fetchBasicProfile("1715629066", {
      customFetch: async () => createMockHtmlResponse(largeHtml, 200),
    });
    const passLarge = resLarge.status === "FAILED" && resLarge.reason.includes("64 KiB");

    // 4.5 Network exception
    const resNetErr = await defaultConnector.fetchBasicProfile("1715629066", {
      customFetch: async () => {
        throw new Error("getaddrinfo ENOTFOUND space.bilibili.com");
      },
    });
    const passNetErr = resNetErr.status === "FAILED" && resNetErr.reason.includes("网络传输异常");

    const pass4 = pass401 && pass403 && pass429 && passLarge && passNetErr;
    console.log(`  - 5 类异常均安全降级并输出脱敏原因: ${pass4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Task Execution Integration with Default Production Connector
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 任务流水线默认生产 Connector 接入与 DataSourceRun 审计记录测试...");

    const target1 = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_1,
        displayName: "真实接入测试用户 1",
      },
    });

    const task1 = await prisma.analysisTask.create({
      data: {
        targetId: target1.id,
        taskStatus: "PENDING",
        pipelineStage: "COLLECT",
        progress: 0,
      },
    });

    const execResult1 = await executeTaskPipeline(task1.id, {
      customFetch: mockFetchSuccess,
      provider: "MOCK",
    });

    const pass5Exec =
      execResult1.taskStatus === "COMPLETED" &&
      execResult1.pipelineStage === "REPORT" &&
      execResult1.progress === 100;

    // Verify DataSourceRun in DB
    const dataSourceRuns1 = await prisma.dataSourceRun.findMany({
      where: { taskId: task1.id },
    });

    const bpRun1 = dataSourceRuns1.find((r) => r.sourceName === "BASIC_PROFILE");
    const pass5DsRun =
      bpRun1 !== undefined &&
      bpRun1.status === "SUCCEEDED" &&
      bpRun1.recordsCount === 1 &&
      bpRun1.message?.includes("成功通过 BASIC_PROFILE 连接器");

    // Verify deterministic report includes the profile record (totalInput becomes 9 = 1 real profile + 8 fixtures)
    const reportRes1 = await getDeterministicReportForTask(task1.id);
    const pass5Report =
      reportRes1.success &&
      reportRes1.data.report.observations.length > 0 &&
      reportRes1.data.report.diagnosticsSummary.totalInput === 9;

    const pass5 = pass5Exec && pass5DsRun && pass5Report;
    console.log(`  - 默认生产执行 DataSourceRun 正确记录 SUCCEEDED (总样本 9 条): ${pass5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Task Execution when overridden to UNVERIFIED (诚实降级)
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] 降级保护测试 (UNVERIFIED -> SKIPPED_UNAVAILABLE 诚实降级)...");

    const target2 = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_2,
        displayName: "降级保护测试用户 2",
      },
    });

    const task2 = await prisma.analysisTask.create({
      data: {
        targetId: target2.id,
        taskStatus: "PENDING",
        pipelineStage: "COLLECT",
        progress: 0,
      },
    });

    const unverifiedConnector = new BilibiliPublicConnector({
      BASIC_PROFILE: "UNVERIFIED",
    });

    const execResult2 = await executeTaskPipeline(task2.id, {
      connector: unverifiedConnector,
      provider: "MOCK",
    });

    const pass6Exec =
      execResult2.taskStatus === "COMPLETED" &&
      execResult2.currentStageMessage.includes("Fixture");

    // Verify DataSourceRun in DB is SKIPPED_UNAVAILABLE
    const dataSourceRuns2 = await prisma.dataSourceRun.findMany({
      where: { taskId: task2.id },
    });

    const bpRun2 = dataSourceRuns2.find((r) => r.sourceName === "BASIC_PROFILE");
    const pass6DsRun =
      bpRun2 !== undefined &&
      bpRun2.status === "SKIPPED_UNAVAILABLE" &&
      bpRun2.recordsCount === 0 &&
      bpRun2.message?.includes("UNVERIFIED");

    const pass6 = pass6Exec && pass6DsRun && unmockedFetchCount === 0;
    console.log(`  - 降级保护写入 SKIPPED_UNAVAILABLE 审计并诚实降级为受控 Fixture: ${pass6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Zero Unintended Network Calls Assertion
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] 零未受控真实网络请求断言...");
    console.log(`  - 未被受控 Mock 的真实 fetch 请求数: ${unmockedFetchCount}`);
    const pass7 = unmockedFetchCount === 0;
    if (!pass7) allPassed = false;

  } finally {
    await cleanupFixtures();
    globalThis.fetch = originalFetch;
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 Phase 4.2 BASIC_PROFILE 准入离线集成测试全部通过！");
  } else {
    console.log("❌ 部分自测未通过，请检查上方日志。");
  }
  console.log("=================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase4ConnectorIntegrationTests().catch((err) => {
  console.error("测试执行异常终止:", err);
  process.exit(1);
});
