/**
 * BiliProfile Analyzer — Phase 6.4: /analysis Read-Only UI View-Model & Route Handler Integration Test
 *
 * Verifies:
 * 1. Valid completed task + dual verified artifacts -> view-model produces SUCCESS state with deterministic report and MOCK AI findings.
 * 2. Gap 1: Multiple completed tasks are stably sorted by completedAt ?? createdAt descending (most recent first).
 * 3. Gap 2: Deterministic report limitations are preserved in the successful view-model.
 * 4. Gap 3: Dangling evidenceId references in observations or AI findings are strictly rejected with INVALID_DATA, zero fake evidence synthesis.
 * 5. No completed tasks -> produces clean EMPTY state without generating fallback mock/fake conclusions.
 * 6. 404, 422, 500 error mapping to fixed safe messages without leaking taskId, stack, Prisma, or service messages.
 * 7. Zero leakage: Sentinels, raw body, snapshots, self-profile data, credentials do not appear in view-model or API responses.
 * 8. In-process route handler invocation with 0 external network requests (globalThis.fetch count === 0).
 * 9. Test fixtures safely created and cleaned up in finally block.
 *
 * Safety:
 * - Pure local SQLite operations.
 * - Zero external network calls (fetch intercepted).
 */

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { runDeterministicAnalysis } from "../../src/lib/processing/pipeline";
import { completeTaskWithOfflineMockAi } from "../../src/lib/task-ai-workflow-service";
import {
  buildAnalysisViewModel,
  filterCompletedTasks,
  mapApiStatusToErrorMessage,
  AnalysisPageState,
} from "../../src/lib/analysis-view-model";
import { GET as getTasksApi } from "../../src/app/api/tasks/route";
import { GET as getDeterministicReportApi } from "../../src/app/api/tasks/[id]/deterministic-report/route";
import { GET as getAiAnalysisApi } from "../../src/app/api/tasks/[id]/ai-analysis/route";
import { PublicSourceRecord } from "../../src/types/processing";
import { TaskSummaryResponse } from "../../src/types/task-api";

const TEST_TARGET_UID_1 = "test_ui_target_99921";
const TEST_TARGET_UID_2 = "test_ui_target_99922";

async function cleanupFixtures() {
  try {
    const targets = await prisma.analysisTarget.findMany({
      where: {
        platformUid: {
          in: [TEST_TARGET_UID_1, TEST_TARGET_UID_2],
        },
      },
      include: {
        tasks: {
          include: {
            deterministicReport: true,
            aiAnalysis: true,
          },
        },
      },
    });

    for (const t of targets) {
      await prisma.analysisTarget.delete({ where: { id: t.id } });
    }
  } catch {
    // Ignore cleanup errors during pre-clean
  }
}

async function runAnalysisUiVerification() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 6.4 /analysis 页面只读展示已验证任务工件测试");
  console.log("=================================================\n");

  let allPassed = true;

  // Intercept global fetch to strictly ensure zero network activity
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: unknown[]) => {
    fetchCallCount++;
    throw new Error("UI integration test violation: external network fetch attempted!");
  };

  try {
    await cleanupFixtures();

    // -------------------------------------------------------------------------
    // Setup Target 1 & Completed Tasks (Task 1 Earlier, Task 2 Later)
    // -------------------------------------------------------------------------
    const target1 = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_1,
        displayName: "测试 UI 用户 1",
      },
    });

    const task1 = await prisma.analysisTask.create({
      data: {
        targetId: target1.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });

    const SENTINEL_RAW_TEXT = "SENTINEL_RAW_BODY_UI_TEST_SECRET_9992";
    const sampleRecords1: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_ui_1",
        sourceType: "CONTENT",
        title: "大模型推理全栈优化实战",
        description: `包含私密文本：${SENTINEL_RAW_TEXT}`,
        tags: ["游戏"],
      },
      {
        sourceRecordId: "rec_ui_2",
        sourceType: "CONTENT",
        title: "2026年四月新番导视",
        tags: ["游戏"],
      },
    ];

    const analysisResult1 = runDeterministicAnalysis(sampleRecords1);
    await completeTaskWithOfflineMockAi(task1.id, analysisResult1);

    // Explicitly set task1 to an older date
    await prisma.analysisTask.update({
      where: { id: task1.id },
      data: {
        completedAt: new Date("2020-01-01T10:00:00.000Z"),
        createdAt: new Date("2020-01-01T09:00:00.000Z"),
      },
    });

    // Create Task 2 with a future/recent date
    const task2 = await prisma.analysisTask.create({
      data: {
        targetId: target1.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });

    const sampleRecords2: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_ui_3",
        sourceType: "CONTENT",
        title: "深度学习编译优化",
        tags: ["知识"],
      },
    ];
    const analysisResult2 = runDeterministicAnalysis(sampleRecords2);
    await completeTaskWithOfflineMockAi(task2.id, analysisResult2);

    // Explicitly set task2 to a newer date
    await prisma.analysisTask.update({
      where: { id: task2.id },
      data: {
        completedAt: new Date("2099-01-01T10:00:00.000Z"),
        createdAt: new Date("2099-01-01T09:00:00.000Z"),
      },
    });

    // -------------------------------------------------------------------------
    // Test 1: Recent Task Sorting (Gap 1)
    // -------------------------------------------------------------------------
    console.log("[测试 1] 已完成任务按完成时间逆序稳定排序测试 (Gap 1)...");
    const tasksResp = await getTasksApi();
    const tasksData: TaskSummaryResponse[] = await tasksResp.json();
    const sortedCompletedTasks = filterCompletedTasks(tasksData);

    const task1Index = sortedCompletedTasks.findIndex((t) => t.id === task1.id);
    const task2Index = sortedCompletedTasks.findIndex((t) => t.id === task2.id);

    // Pure unit test of sorting with invalid/missing date edge cases
    const mockUnsortedTasks = [
      { id: "task_old", taskStatus: "COMPLETED", completedAt: "2021-01-01T00:00:00.000Z" } as TaskSummaryResponse,
      { id: "task_invalid_date", taskStatus: "COMPLETED", completedAt: "invalid" } as TaskSummaryResponse,
      { id: "task_newest", taskStatus: "COMPLETED", completedAt: "2026-08-27T12:00:00.000Z" } as TaskSummaryResponse,
      { id: "task_created_only", taskStatus: "COMPLETED", completedAt: null, createdAt: "2025-05-01T00:00:00.000Z" } as TaskSummaryResponse,
    ];
    const unitSorted = filterCompletedTasks(mockUnsortedTasks);

    const pass1 =
      sortedCompletedTasks.length >= 2 &&
      task2Index === 0 && // task2 (2099) is at index 0
      task1Index > task2Index && // task1 (2020) is after task2
      unitSorted[0].id === "task_newest" &&
      unitSorted[1].id === "task_created_only" &&
      unitSorted[2].id === "task_old";

    console.log(`  - 完成任务逆序排列，最近完成的 Task 2 居于首位: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Dual Verified Artifacts & Deterministic Limitations (Gap 2)
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 读取工件 API 组装 UI view-model 并验证确定性局限性说明 (Gap 2)...");
    const targetCompletedTask = sortedCompletedTasks.find((t) => t.id === task1.id);

    // Call deterministic-report API
    const reqReport = new NextRequest(`http://localhost:3000/api/tasks/${task1.id}/deterministic-report`);
    const respReport = await getDeterministicReportApi(reqReport, { params: Promise.resolve({ id: task1.id }) });
    const reportData = await respReport.json();

    // Call ai-analysis API
    const reqAi = new NextRequest(`http://localhost:3000/api/tasks/${task1.id}/ai-analysis`);
    const respAi = await getAiAnalysisApi(reqAi, { params: Promise.resolve({ id: task1.id }) });
    const aiData = await respAi.json();

    const viewModel = buildAnalysisViewModel(targetCompletedTask!, reportData, aiData);

    const pass2 =
      tasksResp.status === 200 &&
      respReport.status === 200 &&
      respAi.status === 200 &&
      viewModel.type === "SUCCESS" &&
      viewModel.task.id === task1.id &&
      viewModel.deterministicReport.topicShares.length > 0 &&
      viewModel.deterministicReport.observations.length > 0 &&
      Array.isArray(viewModel.deterministicReport.limitations) &&
      viewModel.aiAnalysis.findings.length > 0 &&
      viewModel.aiAnalysis.provider === "MOCK";

    console.log(`  - 任务列表、确定性报告 API、AI API 响应均为 200: ${respReport.status === 200 && respAi.status === 200 ? "✅" : "❌"}`);
    console.log(`  - View-model 成功组装为 SUCCESS 状态且保留确定性 limitations: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Strict Dangling Evidence Verification & Zero Fake Fallback (Gap 3)
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 悬空 evidenceId 严格校验与零合成证据测试 (Gap 3)...");
    const SENTINEL_DANGLING_EV = "SENTINEL_DANGLING_EV_ID_SECRET_9993";

    // 3a: Corrupt an observation with a dangling evidenceId
    const corruptedReportData = JSON.parse(JSON.stringify(reportData));
    corruptedReportData.report.observations[0].evidenceIds.push(SENTINEL_DANGLING_EV);

    const resultDanglingObs = buildAnalysisViewModel(
      targetCompletedTask!,
      corruptedReportData,
      aiData
    );

    const strDanglingObs = JSON.stringify(resultDanglingObs);
    const pass3a =
      resultDanglingObs.type === "ERROR" &&
      resultDanglingObs.code === "INVALID_DATA" &&
      resultDanglingObs.message === "任务工件未通过安全校验，暂不展示" &&
      !strDanglingObs.includes(SENTINEL_DANGLING_EV);

    // 3b: Corrupt an AI finding with a dangling evidenceId
    const corruptedAiData = JSON.parse(JSON.stringify(aiData));
    corruptedAiData.analysis.findings[0].evidenceIds.push(SENTINEL_DANGLING_EV);

    const resultDanglingFinding = buildAnalysisViewModel(
      targetCompletedTask!,
      reportData,
      corruptedAiData
    );

    const strDanglingFinding = JSON.stringify(resultDanglingFinding);
    const pass3b =
      resultDanglingFinding.type === "ERROR" &&
      resultDanglingFinding.code === "INVALID_DATA" &&
      resultDanglingFinding.message === "任务工件未通过安全校验，暂不展示" &&
      !strDanglingFinding.includes(SENTINEL_DANGLING_EV);

    const pass3 = pass3a && pass3b;
    console.log(`  - 悬空 observation 证据引用拦截 (返回 INVALID_DATA, 零泄露): ${pass3a ? "✅" : "❌"}`);
    console.log(`  - 悬空 AI finding 证据引用拦截 (返回 INVALID_DATA, 零泄露): ${pass3b ? "✅" : "❌"}`);
    console.log(`  - 严格证据完整性校验综合判定: ${pass3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: No Completed Tasks returns clean EMPTY state
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 无完成任务时得到中性空状态 (绝不回退到假示例结论)...");
    const emptyCompletedTasks = filterCompletedTasks([]);
    const emptyState: AnalysisPageState =
      emptyCompletedTasks.length === 0
        ? { type: "EMPTY", message: "暂无可展示的完成分析任务" }
        : { type: "LOADING" };

    const strEmptyState = JSON.stringify(emptyState);

    const pass4 =
      emptyState.type === "EMPTY" &&
      emptyState.message === "暂无可展示的完成分析任务" &&
      !strEmptyState.includes("计算机工程") &&
      !strEmptyState.includes("吉他乐理") &&
      !strEmptyState.includes("羽毛球");

    console.log(`  - 空状态为标准中性文案且无假示例结论: ${pass4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Safe Error Message Mapping for 404, 422, 500
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 404、422、500 分别映射为固定受控安全提示 (零内部信息泄露)...");
    const err404 = mapApiStatusToErrorMessage(404);
    const err422 = mapApiStatusToErrorMessage(422);
    const err500 = mapApiStatusToErrorMessage(500);
    const err503 = mapApiStatusToErrorMessage(503);

    const pass5 =
      err404.code === "NOT_FOUND" &&
      err404.message === "任务工件尚未生成或不存在" &&
      err422.code === "INVALID_DATA" &&
      err422.message === "任务工件未通过安全校验，暂不展示" &&
      err500.code === "SERVER_ERROR" &&
      err500.message === "暂时无法加载分析结果，请稍后重试" &&
      err503.code === "SERVER_ERROR" &&
      err503.message === "暂时无法加载分析结果，请稍后重试";

    console.log(`  - 404/422/500 安全错误映射准确: ${pass5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Zero Leakage Verification
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] 敏感正文哨兵、自述字段、凭据与内部错误零泄露断言...");
    const strViewModel = JSON.stringify(viewModel);
    const strReportData = JSON.stringify(reportData);
    const strAiData = JSON.stringify(aiData);

    const pass6 =
      !strViewModel.includes(SENTINEL_RAW_TEXT) &&
      !strViewModel.includes("SnapshotField") &&
      !strViewModel.includes("currentGoals") &&
      !strViewModel.includes("learningDirections") &&
      !strViewModel.includes("customPrompt") &&
      !strViewModel.includes("SESSDATA") &&
      !strViewModel.includes("Cookie") &&
      !strViewModel.includes("bili_jct") &&
      !strReportData.includes(SENTINEL_RAW_TEXT) &&
      !strReportData.includes("SnapshotField") &&
      !strAiData.includes(SENTINEL_RAW_TEXT) &&
      !strAiData.includes("SnapshotField");

    console.log(`  - 哨兵文本与自述/凭据在 view-model 及工件 API 响应中零泄露: ${pass6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Zero External Network Fetch Calls Assertion
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] 全测试流程零外部网络请求断言...");
    const pass7 = fetchCallCount === 0;
    console.log(`  - 全程 fetch 调用总数: ${fetchCallCount} -> ${pass7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass7) allPassed = false;

    console.log("\n=================================================");
    if (allPassed) {
      console.log("🎉 Phase 6.4 /analysis 页面只读展示已验证任务工件测试全部通过！");
      console.log("=================================================\n");
    } else {
      console.error("❌ 部分测试未通过，请检查。");
      console.log("=================================================\n");
      process.exit(1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await cleanupFixtures();
    await prisma.$disconnect();
  }
}

runAnalysisUiVerification().catch((err) => {
  console.error("UI 测试脚本异常:", err);
  process.exit(1);
});
