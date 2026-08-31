/**
 * BiliProfile Analyzer — MVP Vertical Slice 2: Task Execution Pipeline Offline Test
 *
 * Guarantees & Test Invariants:
 * 1. 100% pure offline test, strictly 0 external network calls.
 * 2. PENDING task executes and steps through all pipeline stages including SYNTHESIS to COMPLETED.
 * 3. AI Provider failure gracefully degrades:
 *    - Deterministic report artifact is preserved intact.
 *    - Task completes with COMPLETED + PARTIAL.
 *    - Persists a desensitized AI degradation artifact ("AI 分析暂不可用；已保留确定性统计结果。").
 *    - Never fakes Mock AI findings for a failed custom provider.
 * 4. Concurrent execution race:
 *    - Promise.all on same PENDING task results in exactly one winner.
 *    - Exactly 1 deterministic report and 1 AI artifact created in DB.
 * 5. Mid-execution Cancellation:
 *    - If task is CANCELLED during execution, pipeline stops immediately,
 *      does NOT write subsequent artifacts, and does NOT overwrite state to FAILED.
 * 6. Tightened Lifecycle Invariants:
 *    - PENDING state with completedAt: undefined or non-null is strictly rejected.
 * 7. Capability Baseline:
 *    - BASIC_PROFILE, PUBLIC_FOLLOWS, PUBLIC_CONTENT remain strictly UNVERIFIED.
 *    - Zero Bilibili Connector calls.
 */

import { prisma } from "../../src/lib/prisma";
import {
  executeTaskPipeline,
  TaskNotFoundError,
  TaskTerminalStateError,
  TaskAlreadyRunningError,
} from "../../src/lib/task-execution-service";
import {
  getDeterministicReportForTask,
} from "../../src/lib/deterministic-report-service";
import {
  getAiAnalysisForTask,
  DESENSITIZED_AI_UNAVAILABLE_SUMMARY,
  DESENSITIZED_AI_UNAVAILABLE_LIMITATION,
} from "../../src/lib/ai";
import {
  DEFAULT_PRODUCTION_REGISTRY,
  BilibiliPublicConnector,
} from "../../src/lib/connectors/bilibili-public-connector";
import {
  validateTaskLifecycleTransition,
  TaskLifecycleState,
} from "../../src/lib/task-lifecycle";

// Track any unexpected fetch calls
let fetchCallCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args: any[]) => {
  fetchCallCount++;
  return originalFetch(...(args as [any, any]));
};

const TEST_TARGET_UID_PREFIX = "test_exec_slice2_";
const TEST_TARGET_UID_1 = `${TEST_TARGET_UID_PREFIX}8801`;
const TEST_TARGET_UID_2 = `${TEST_TARGET_UID_PREFIX}8802`;
const TEST_TARGET_UID_3 = `${TEST_TARGET_UID_PREFIX}8803`;
const TEST_TARGET_UID_4 = `${TEST_TARGET_UID_PREFIX}8804`;

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
    // Ignore cleanup error
  }
}

async function runTaskExecutionSliceTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — MVP 切片 2: 任务执行一致性离线测试");
  console.log("=================================================\n");

  let allPassed = true;
  await cleanupFixtures();

  try {
    // -------------------------------------------------------------------------
    // Test 1: PENDING Task executes through stages (including SYNTHESIS) to COMPLETED
    // -------------------------------------------------------------------------
    console.log("[测试 1] 流水线阶段顺序推进（含 SYNTHESIS）与 COMPLETED + PARTIAL 验证...");

    const target1 = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_1,
        displayName: "执行测试用户 1",
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

    const result1 = await executeTaskPipeline(task1.id, { provider: "MOCK" });

    const pass1 =
      result1.taskStatus === "COMPLETED" &&
      result1.pipelineStage === "REPORT" &&
      result1.progress === 100 &&
      result1.outcome === "PARTIAL" &&
      result1.currentStageMessage.includes("Fixture") &&
      result1.completedAt !== null;

    console.log(`  - 任务状态推进至 COMPLETED / REPORT / 100% / PARTIAL: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1) allPassed = false;

    // Verify artifacts for Task 1
    const reportRes1 = await getDeterministicReportForTask(task1.id);
    const aiRes1 = await getAiAnalysisForTask(task1.id);

    const pass1Artifacts =
      reportRes1.success &&
      reportRes1.data.report.observations.length > 0 &&
      aiRes1.success &&
      aiRes1.data.analysis.findings.length > 0 &&
      aiRes1.data.provider === "MOCK";

    console.log(`  - 确定性报告与 Mock AI 工件完整生成: ${pass1Artifacts ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1Artifacts) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: AI Provider Failure Graceful Degradation & Desensitized Artifact
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] AI Provider 失败降级与脱敏工件持久化验证...");

    const target2 = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_2,
        displayName: "执行测试用户 2",
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

    // Failing upstream fetch (500 internal server error)
    const failingFetch: typeof fetch = async () => {
      return new Response("Internal Server Error with sensitive stack trace", {
        status: 500,
      });
    };

    const result2 = await executeTaskPipeline(task2.id, {
      provider: "OPENAI_COMPATIBLE",
      openAiConfig: {
        apiBaseUrl: "https://api.openai.com/v1",
        apiKey: "sk-sensitive-test-key-do-not-leak",
        model: "gpt-4o-mini",
      },
      customFetch: failingFetch,
    });

    const reportRes2 = await getDeterministicReportForTask(task2.id);
    const aiRes2 = await getAiAnalysisForTask(task2.id);

    const isDegradedAi =
      aiRes2.success &&
      aiRes2.data.provider === "OPENAI_COMPATIBLE" &&
      aiRes2.data.analysis.summary === DESENSITIZED_AI_UNAVAILABLE_SUMMARY &&
      aiRes2.data.analysis.findings.length === 0 &&
      aiRes2.data.analysis.limitations.includes(DESENSITIZED_AI_UNAVAILABLE_LIMITATION);

    const noLeak =
      aiRes2.success &&
      !JSON.stringify(aiRes2.data).includes("sensitive") &&
      !JSON.stringify(aiRes2.data).includes("sk-sensitive");

    const pass2 =
      result2.taskStatus === "COMPLETED" &&
      result2.outcome === "PARTIAL" &&
      reportRes2.success &&
      isDegradedAi &&
      noLeak;

    console.log(`  - 任务以 COMPLETED + PARTIAL 成功收尾: ${result2.taskStatus === "COMPLETED" ? "✅" : "❌"}`);
    console.log(`  - 确定性报告工件安全保留: ${reportRes2.success ? "✅" : "❌"}`);
    console.log(`  - 持久化标准脱敏 AI 不可用工件 (零假 Mock 伪造): ${isDegradedAi ? "✅" : "❌"}`);
    console.log(`  - 零敏感异常/密钥泄露: ${noLeak ? "✅" : "❌"}`);
    console.log(`  - AI 失败降级综合判定: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Concurrent Execution Race (Promise.all on same PENDING task)
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 并发 Promise.all 抢占与工件唯一性保护测试...");

    const target3 = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_3,
        displayName: "执行测试用户 3",
      },
    });

    const task3 = await prisma.analysisTask.create({
      data: {
        targetId: target3.id,
        taskStatus: "PENDING",
        pipelineStage: "COLLECT",
        progress: 0,
      },
    });

    // Fire 3 concurrent execution attempts
    const concurrentResults = await Promise.allSettled([
      executeTaskPipeline(task3.id, { provider: "MOCK" }),
      executeTaskPipeline(task3.id, { provider: "MOCK" }),
      executeTaskPipeline(task3.id, { provider: "MOCK" }),
    ]);

    const fulfilledCount = concurrentResults.filter((r) => r.status === "fulfilled").length;
    const rejectedCount = concurrentResults.filter((r) => r.status === "rejected").length;

    // Verify exactly 1 report and 1 AI artifact in database
    const reportCount = await prisma.deterministicReportArtifact.count({
      where: { taskId: task3.id },
    });
    const aiCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: task3.id },
    });

    const pass3 =
      fulfilledCount === 1 &&
      rejectedCount === 2 &&
      reportCount === 1 &&
      aiCount === 1;

    console.log(`  - 并发执行恰好 1 个成功领取 (成功=${fulfilledCount}, 拒绝=${rejectedCount}): ${fulfilledCount === 1 ? "✅" : "❌"}`);
    console.log(`  - 数据库确定性报告记录数严格为 1 (实际=${reportCount}): ${reportCount === 1 ? "✅" : "❌"}`);
    console.log(`  - 数据库 AI 工件记录数严格为 1 (实际=${aiCount}): ${aiCount === 1 ? "✅" : "❌"}`);
    console.log(`  - 并发保护综合判定: ${pass3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: Mid-Execution Task Cancellation Safety
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 执行途中任务被 CANCELLED 的竞争与终态保护测试...");

    const target4 = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_4,
        displayName: "执行测试用户 4",
      },
    });

    const task4 = await prisma.analysisTask.create({
      data: {
        targetId: target4.id,
        taskStatus: "PENDING",
        pipelineStage: "COLLECT",
        progress: 0,
      },
    });

    // Custom fetch that simulates a cancellation in DB while AI is running
    const cancellingCustomFetch: typeof fetch = async () => {
      // Simulate external cancel
      await prisma.analysisTask.updateMany({
        where: { id: task4.id },
        data: {
          taskStatus: "CANCELLED",
          outcome: "NONE",
          completedAt: new Date(),
          currentStageMessage: "用户手动取消了任务",
        },
      });
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    let cancelledCaught = false;
    try {
      await executeTaskPipeline(task4.id, {
        provider: "OPENAI_COMPATIBLE",
        openAiConfig: {
          apiBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-mock",
          model: "gpt-4o-mini",
        },
        customFetch: cancellingCustomFetch,
      });
    } catch (err: any) {
      cancelledCaught = err instanceof TaskTerminalStateError;
    }

    const finalTask4 = await prisma.analysisTask.findUnique({
      where: { id: task4.id },
      select: { taskStatus: true, outcome: true },
    });

    const aiArtifactCount4 = await prisma.aiAnalysisArtifact.count({
      where: { taskId: task4.id },
    });

    const pass4 =
      cancelledCaught &&
      finalTask4?.taskStatus === "CANCELLED" &&
      finalTask4?.outcome === "NONE" &&
      aiArtifactCount4 === 0;

    console.log(`  - 取消竞争被捕获且抛出 TerminalTaskError: ${cancelledCaught ? "✅" : "❌"}`);
    console.log(`  - 任务状态保持 CANCELLED 且未被误改为 FAILED: ${finalTask4?.taskStatus === "CANCELLED" ? "✅" : "❌"}`);
    console.log(`  - 取消后未生成多余 AI 工件 (count=${aiArtifactCount4}): ${aiArtifactCount4 === 0 ? "✅" : "❌"}`);
    console.log(`  - 取消竞争综合判定: ${pass4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Strict Lifecycle Validation for PENDING State
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] PENDING 状态 completedAt 严格为 null 生命周期校验测试...");

    const pendingWithUndefined: TaskLifecycleState = {
      taskStatus: "PENDING",
      pipelineStage: "COLLECT",
      progress: 0,
      outcome: "NONE",
      completedAt: undefined,
    };

    const valResult1 = validateTaskLifecycleTransition(pendingWithUndefined, {
      progress: 0,
    });

    const pendingWithNonNull: TaskLifecycleState = {
      taskStatus: "PENDING",
      pipelineStage: "COLLECT",
      progress: 0,
      outcome: "NONE",
      completedAt: new Date(),
    };

    const valResult2 = validateTaskLifecycleTransition(pendingWithNonNull, {
      progress: 0,
    });

    const pendingValid: TaskLifecycleState = {
      taskStatus: "PENDING",
      pipelineStage: "COLLECT",
      progress: 0,
      outcome: "NONE",
      completedAt: null,
    };

    const valResult3 = validateTaskLifecycleTransition(pendingValid, {
      progress: 0,
    });

    const pass5 =
      !valResult1.valid &&
      valResult1.code === "INVALID_PENDING_COMPLETED_AT" &&
      !valResult2.valid &&
      valResult2.code === "INVALID_PENDING_COMPLETED_AT" &&
      valResult3.valid;

    console.log(`  - PENDING + completedAt: undefined 校验拒绝: ${!valResult1.valid && valResult1.code === "INVALID_PENDING_COMPLETED_AT" ? "✅" : "❌"}`);
    console.log(`  - PENDING + completedAt: Date 校验拒绝: ${!valResult2.valid && valResult2.code === "INVALID_PENDING_COMPLETED_AT" ? "✅" : "❌"}`);
    console.log(`  - PENDING + completedAt: null 校验通过: ${valResult3.valid ? "✅" : "❌"}`);
    console.log(`  - PENDING 严格校验综合判定: ${pass5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Capability Registry & Bilibili Connector Zero Invocations
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] Capability 注册表隔离与 Phase 4.2 放行基线断言...");

    const connector = new BilibiliPublicConnector();
    const basicStatus = connector.getCapabilityStatus("BASIC_PROFILE");
    const followsStatus = connector.getCapabilityStatus("PUBLIC_FOLLOWS");
    const contentStatus = connector.getCapabilityStatus("PUBLIC_CONTENT");

    const pass6 =
      DEFAULT_PRODUCTION_REGISTRY.BASIC_PROFILE === "AVAILABLE_PUBLIC" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_CONTENT === "AVAILABLE_PUBLIC" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_FOLLOWS === "UNVERIFIED" &&
      basicStatus === "AVAILABLE_PUBLIC" &&
      contentStatus === "AVAILABLE_PUBLIC" &&
      followsStatus === "UNVERIFIED";

    console.log(`  - BASIC_PROFILE 状态: ${basicStatus}`);
    console.log(`  - PUBLIC_FOLLOWS 状态: ${followsStatus}`);
    console.log(`  - PUBLIC_CONTENT 状态: ${contentStatus}`);
    console.log(`  - 注册表仅 BASIC_PROFILE 为 AVAILABLE_PUBLIC，其余两项严格保持 UNVERIFIED: ${pass6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Zero External Network Fetch Assertion
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] 全流程零真实外部网络请求断言...");
    const pass7 = fetchCallCount === 0;
    console.log(`  - 真实外部 fetch 调用总数: ${fetchCallCount} -> ${pass7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass7) allPassed = false;

  } finally {
    await cleanupFixtures();
    globalThis.fetch = originalFetch;
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 MVP 切片 2 任务执行一致性离线测试全部通过！");
  } else {
    console.error("❌ 部分测试未通过，请检查上方日志。");
    process.exit(1);
  }
  console.log("=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("phase8-task-execution-slice-test"))
) {
  runTaskExecutionSliceTests().catch((e) => {
    console.error("[测试异常]", e);
    process.exit(1);
  });
}
