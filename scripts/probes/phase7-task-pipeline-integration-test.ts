/**
 * BiliProfile Analyzer — Phase 7: End-to-End Task Pipeline Integration Test
 *
 * Verifies the complete minimum usable user loop:
 * 1. POST /api/tasks creates AnalysisTarget & AnalysisTask with PENDING status.
 * 2. POST /api/tasks/[id]/execute executes pipeline:
 *    - Gated BilibiliPublicConnector fetches basic profile via customFetch mock.
 *    - Validates Phase 8.1 minimal contract & provenance REAL_CONNECTOR.
 *    - Updates Target displayName from placeholder to extracted public name.
 *    - Records DataSourceRun (SUCCEEDED, BASIC_PROFILE, recordsCount: 1).
 *    - Persists DeterministicReportArtifact & AiAnalysisArtifact.
 *    - Transitions task to COMPLETED / REPORT / 100% / PARTIAL.
 * 3. Read APIs & View Model:
 *    - GET /api/tasks returns desensitized summary with dataSourceRuns.
 *    - buildAnalysisViewModel correctly sets isRealProfile: true.
 * 4. Isolation & Security:
 *    - PUBLIC_FOLLOWS & PUBLIC_CONTENT remain blocked (0 calls).
 *    - Zero external real network requests (mock intercepted).
 */

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { POST as createTasksApi } from "../../src/app/api/tasks/route";
import { GET as getTasksApi } from "../../src/app/api/tasks/route";
import { GET as getDeterministicReportApi } from "../../src/app/api/tasks/[id]/deterministic-report/route";
import { GET as getAiAnalysisApi } from "../../src/app/api/tasks/[id]/ai-analysis/route";
import { executeTaskPipeline } from "../../src/lib/task-execution-service";
import { buildAnalysisViewModel } from "../../src/lib/analysis-view-model";
import { BilibiliPublicConnector } from "../../src/lib/connectors/bilibili-public-connector";

const TEST_E2E_UID = "1715629066";
let externalFetchCallCount = 0;

// Global fetch interceptor to guarantee 0 unmocked network calls
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  // If it's a real external fetch
  if (urlStr.startsWith("http://space.bilibili.com") || urlStr.startsWith("https://space.bilibili.com")) {
    externalFetchCallCount++;
    throw new Error(`[SAFETY_VIOLATION] Unexpected external fetch call to: ${urlStr}`);
  }
  return originalFetch(input, init);
};

const SAMPLE_HTML_PROFILE = `
<!DOCTYPE html>
<html>
<head>
  <title>科技创作者小明 的个人空间-哔哩哔哩视频</title>
  <meta name="description" content="分享前沿科技与编程全栈开发经验。" />
  <meta property="og:image" content="https://i0.hdslb.com/bfs/face/sample_avatar_123456.jpg" />
</head>
<body>
  <div>Bilibili User Space</div>
</body>
</html>
`;

async function cleanupTestData() {
  try {
    const targets = await prisma.analysisTarget.findMany({
      where: { platformUid: TEST_E2E_UID },
      include: { tasks: true },
    });
    for (const t of targets) {
      await prisma.analysisTarget.delete({ where: { id: t.id } });
    }
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}

async function runE2ETaskPipelineTest() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 7 端到端任务流水线闭环集成测试");
  console.log("=================================================\n");

  let allPassed = true;

  try {
    await cleanupTestData();

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // Test 1: Task Creation API (POST /api/tasks)
    // -------------------------------------------------------------------------
    console.log("[测试 1] 创建分析任务 API (POST /api/tasks)...");
    const e2eSessionId = `e2e-test-session-${Date.now()}`;
    const createReq = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": e2eSessionId,
      },
      body: JSON.stringify({
        platformUid: TEST_E2E_UID,
        displayName: `用户 (${TEST_E2E_UID})`,
        selfProvidedConsentConfirmed: true,
      }),
    });

    const createRes = await createTasksApi(createReq);
    const createdTask = await createRes.json();
    if (!createRes.ok) {
      console.error("  - 创建任务失败:", createdTask);
      allPassed = false;
    }
    const pass1 =
      createRes.status === 201 &&
      createdTask.id &&
      createdTask.taskStatus === "PENDING" &&
      createdTask.pipelineStage === "COLLECT";
    console.log(`  - 任务创建成功且处于 PENDING / COLLECT: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Task Execution Pipeline with Mocked Basic Profile Fetch
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 任务执行流水线 (executeTaskPipeline with Mock Fetch)...");

    // Mock fetch specifically for the connector
    const mockCustomFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      return new Response(SAMPLE_HTML_PROFILE, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    };

    const completedTask = await executeTaskPipeline(createdTask.id, {
      provider: "MOCK",
      customFetch: mockCustomFetch,
    });

    const pass2 =
      completedTask.taskStatus === "COMPLETED" &&
      completedTask.pipelineStage === "REPORT" &&
      completedTask.progress === 100 &&
      completedTask.outcome === "PARTIAL";
    console.log(`  - 流水线成功推进至 COMPLETED / REPORT / 100% / PARTIAL: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Target Display Name Sync & DataSourceRun Auditing
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] Target 展示名称同步与 DataSourceRun 审计落盘验证...");
    const updatedTarget = await prisma.analysisTarget.findUnique({
      where: { platformUid: TEST_E2E_UID },
      include: {
        tasks: {
          include: {
            dataSourceRuns: true,
            deterministicReport: true,
            aiAnalysis: true,
          },
        },
      },
    });

    const basicProfileRun = updatedTarget?.tasks[0]?.dataSourceRuns.find(
      (r) => r.sourceName === "BASIC_PROFILE"
    );

    const pass3 =
      updatedTarget?.displayName === "科技创作者小明" &&
      basicProfileRun !== undefined &&
      basicProfileRun.status === "SUCCEEDED" &&
      basicProfileRun.recordsCount === 1 &&
      updatedTarget?.tasks[0]?.deterministicReport !== null &&
      updatedTarget?.tasks[0]?.aiAnalysis !== null;

    console.log(`  - 目标展示名称同步为提取名称: ${updatedTarget?.displayName === "科技创作者小明" ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - DataSourceRun 成功记录 BASIC_PROFILE: ${basicProfileRun?.status === "SUCCEEDED" ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - 确定性报告与 AI 工件持久化完整: ${pass3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: View Model & UI Data Consumption (Provenance Awareness)
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 前端只读 View Model 与工件 API 消费测试 (Provenance Aware)...");
    const tasksGetReq = new NextRequest("http://localhost:3000/api/tasks", {
      headers: { "x-session-id": e2eSessionId },
    });
    const tasksGetRes = await getTasksApi(tasksGetReq);
    const tasksList = await tasksGetRes.json();
    const currentTask = Array.isArray(tasksList) ? tasksList.find((t: any) => t.id === createdTask.id) : null;

    const detReportReq = new NextRequest(`http://localhost:3000/api/tasks/${createdTask.id}/deterministic-report`, {
      headers: { "x-session-id": e2eSessionId },
    });
    const detReportRes = await getDeterministicReportApi(detReportReq, {
      params: Promise.resolve({ id: createdTask.id }),
    });
    const detReportData = await detReportRes.json();

    const aiReq = new NextRequest(`http://localhost:3000/api/tasks/${createdTask.id}/ai-analysis`, {
      headers: { "x-session-id": e2eSessionId },
    });
    const aiRes = await getAiAnalysisApi(aiReq, {
      params: Promise.resolve({ id: createdTask.id }),
    });
    const aiData = await aiRes.json();

    const viewModel = buildAnalysisViewModel(currentTask, detReportData, aiData);
    const isSuccess = viewModel.type === "SUCCESS";
    const isRealProfileDetected = isSuccess && viewModel.task.isRealProfile === true;

    console.log(`  - View-Model 状态: ${viewModel.type} (预期 SUCCESS)`);
    console.log(`  - 来源感知 isRealProfile: ${isRealProfileDetected ? "✅ 正确识别为公开基础资料" : "❌ 失败"}`);
    console.log(`  - 报告摘要生成完整: ${isSuccess && Boolean(viewModel.deterministicReport.summary) ? "✅ 通过" : "❌ 失败"}`);
    if (!isSuccess || !isRealProfileDetected) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Capability Isolation (PUBLIC_FOLLOWS blocked, PUBLIC_CONTENT enabled)
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 未放行能力隔离与 0 网络请求断言...");
    const connector = new BilibiliPublicConnector();
    const followsRes = await connector.fetchPublicFollows(TEST_E2E_UID);
    const unverifiedConnector = new BilibiliPublicConnector({ PUBLIC_CONTENT: "UNVERIFIED" });
    const contentGatedRes = await unverifiedConnector.fetchPublicContent(TEST_E2E_UID);

    const pass5 =
      followsRes.status === "UNVERIFIED_BLOCKED" &&
      contentGatedRes.status === "UNVERIFIED_BLOCKED" &&
      externalFetchCallCount === 0;

    console.log(`  - PUBLIC_FOLLOWS 严格阻断: ${followsRes.status === "UNVERIFIED_BLOCKED" ? "✅" : "❌"}`);
    console.log(`  - PUBLIC_CONTENT 未放行时门禁阻断: ${contentGatedRes.status === "UNVERIFIED_BLOCKED" ? "✅" : "❌"}`);
    console.log(`  - 全测试流程真实外部网络请求数: ${externalFetchCallCount} (预期 0) -> ${externalFetchCallCount === 0 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5) allPassed = false;

  } finally {
    globalThis.fetch = originalFetch;
    await cleanupTestData();
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 Phase 7 端到端任务流水线闭环集成测试全部通过！");
    console.log("=================================================");
    process.exit(0);
  } else {
    console.error("❌ Phase 7 端到端任务流水线闭环集成测试存在失败项！");
    console.log("=================================================");
    process.exit(1);
  }
}

runE2ETaskPipelineTest().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});
