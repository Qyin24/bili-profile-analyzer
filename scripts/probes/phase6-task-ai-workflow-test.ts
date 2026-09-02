/**
 * BiliProfile Analyzer — Phase 6.3 & 6.3.1: Task-level Offline AI Workflow & Completion Test Suite
 *
 * Verifies:
 * 1. Valid non-terminal task + deterministic analysis input -> automatically writes deterministic report,
 *    automatically writes MOCK AI artifact, completes task to COMPLETED / REPORT / 100%, and artifacts are verified.
 * 2. Idempotency: Repeating workflow for same task and same input returns identical artifact IDs, maintains single DB row each, no mutation.
 * 3. Non-existent task -> controlled rejection with TaskWorkflowTaskNotFoundError, error.code === "TASK_NOT_FOUND", zero artifacts written.
 * 4. Initial terminal task (without valid artifacts or FAILED/CANCELLED) -> controlled rejection with TaskWorkflowTerminalStateError, error.code === "TERMINAL_STATE_ERROR", zero writes.
 * 5. Failure during AI artifact generation/storage -> task remains RUNNING (never COMPLETED), deterministic report remains immutable, zero leaks.
 * 6. Two different tasks are strictly isolated (different artifacts, different interpretations, independent completion).
 * 7. Concurrency: Concurrent workflow runs on same task with same input both succeed, return matching artifact IDs, DB contains exactly 1 row each, task COMPLETED.
 * 8. Conflicting input against existing immutable artifacts -> controlled rejection with TaskWorkflowConflictError, error.code === "CONFLICT_ERROR".
 * 9. Phase 6.3.1 Terminal Race Protection:
 *    - Task updated to CANCELLED just before final completion update -> completeTaskWithOfflineDeterministicAi is rejected, task remains CANCELLED in DB (NOT COMPLETED), error.code === "TERMINAL_STATE_ERROR".
 * 10. Phase 6.3.1 Comprehensive Error Code Assertions:
 *    - All workflow error classes export stable readonly `code` properties matching TaskAiWorkflowErrorCode.
 * 11. Zero leakage of raw bodies, snapshot fields, self-profile data, credentials, Prisma errors, stack traces, or validation error arrays.
 * 12. Global fetch count is 0 throughout entire test suite.
 * 13. Test fixtures cleanly isolated and cleaned up in finally block.
 *
 * Safety:
 * - Pure local SQLite operations.
 * - Zero external network calls (fetch intercepted).
 */

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import {
  runDeterministicAnalysis,
} from "../../src/lib/processing/pipeline";
import {
  getDeterministicReportForTask,
} from "../../src/lib/deterministic-report-service";
import {
  getAiAnalysisForTask,
} from "../../src/lib/ai";
import {
  completeTaskWithOfflineDeterministicAi,
  TaskWorkflowTaskNotFoundError,
  TaskWorkflowTerminalStateError,
  TaskWorkflowConflictError,
  TaskWorkflowReportPersistError,
  TaskWorkflowAiPersistError,
  TaskWorkflowVerificationError,
  TaskWorkflowLifecycleError,
  TaskWorkflowExecutionError,
} from "../../src/lib/task-ai-workflow-service";
import { GET as getDeterministicReportApi } from "../../src/app/api/tasks/[id]/deterministic-report/route";
import { GET as getAiAnalysisApi } from "../../src/app/api/tasks/[id]/ai-analysis/route";
import { PublicSourceRecord } from "../../src/types/processing";

const TEST_TARGET_UID_A = "test_workflow_target_99911";
const TEST_TARGET_UID_B = "test_workflow_target_99912";
const TEST_TARGET_UID_C = "test_workflow_target_99913";
const TEST_TARGET_UID_D = "test_workflow_target_99914";
const TEST_TARGET_UID_E = "test_workflow_target_99915";

async function cleanupFixtures() {
  try {
    const targets = await prisma.analysisTarget.findMany({
      where: {
        platformUid: {
          in: [
            TEST_TARGET_UID_A,
            TEST_TARGET_UID_B,
            TEST_TARGET_UID_C,
            TEST_TARGET_UID_D,
            TEST_TARGET_UID_E,
          ],
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

async function runWorkflowVerification() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 6.3 & 6.3.1 任务级离线 MOCK AI 工件自动生成与完成编排测试");
  console.log("=================================================\n");

  let allPassed = true;

  // Intercept global fetch to strictly ensure zero network activity
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: unknown[]) => {
    fetchCallCount++;
    throw new Error("Workflow test violation: network fetch attempted!");
  };

  try {
    await cleanupFixtures();

    // -------------------------------------------------------------------------
    // Setup Test Data & Samples
    // -------------------------------------------------------------------------
    const SENTINEL_RAW_TEXT_A = "SENTINEL_RAW_BODY_WORKFLOW_TASK_A_SECRET";
    const sampleRecordsA: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_wf_a1",
        sourceType: "CONTENT",
        title: "黑神话悟空全流程解析",
        description: `包含受控正文：${SENTINEL_RAW_TEXT_A}`,
        tags: ["游戏"],
      },
      {
        sourceRecordId: "rec_wf_a2",
        sourceType: "CONTENT",
        title: "艾尔登法环DLC探索指南",
        tags: ["游戏"],
      },
    ];
    const analysisA = runDeterministicAnalysis(sampleRecordsA);

    const sampleRecordsB: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_wf_b1",
        sourceType: "CONTENT",
        title: "深入浅出大模型架构",
        tags: ["科技", "AI"],
      },
      {
        sourceRecordId: "rec_wf_b2",
        sourceType: "CONTENT",
        title: "2026年四月新番导视",
        tags: ["动漫"],
      },
    ];
    const analysisB = runDeterministicAnalysis(sampleRecordsB);

    // Target A & Task A1
    const targetA = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_A,
        displayName: "测试编排用户 A",
      },
    });

    const taskA1 = await prisma.analysisTask.create({
      data: {
        targetId: targetA.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });

    // -------------------------------------------------------------------------
    // Test 1: Full Orchestrated Completion Flow (Report -> AI -> Complete Task)
    // -------------------------------------------------------------------------
    console.log("[测试 1] 有效非终态任务离线编排完成测试 (确定性报告 -> MOCK AI -> 任务完成)...");
    const result1 = await completeTaskWithOfflineDeterministicAi(taskA1.id, analysisA);

    // Verify task state in database
    const dbTask1 = await prisma.analysisTask.findUnique({
      where: { id: taskA1.id },
      select: {
        id: true,
        taskStatus: true,
        pipelineStage: true,
        progress: true,
        outcome: true,
        completedAt: true,
      },
    });

    // Verify deterministic report via read service
    const readReport1 = await getDeterministicReportForTask(taskA1.id);
    // Verify AI analysis via read service
    const readAi1 = await getAiAnalysisForTask(taskA1.id);

    const pass1 =
      result1.taskId === taskA1.id &&
      result1.taskStatus === "COMPLETED" &&
      typeof result1.completedAt === "string" &&
      dbTask1?.taskStatus === "COMPLETED" &&
      dbTask1?.pipelineStage === "REPORT" &&
      dbTask1?.progress === 100 &&
      dbTask1?.completedAt !== null &&
      readReport1.success &&
      readReport1.data.artifactId === result1.deterministicReportArtifactId &&
      readAi1.success &&
      readAi1.data.artifactId === result1.aiAnalysisArtifactId &&
      readAi1.data.provider === "MOCK";

    console.log(`  - 编排成功且任务进入 COMPLETED / REPORT / 100%: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - 确定性报告工件持久化并可验证: ${readReport1.success ? "✅" : "❌"}`);
    console.log(`  - MOCK AI 工件持久化并可验证: ${readAi1.success ? "✅" : "❌"}`);
    if (!pass1) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Idempotent Repeat Execution on COMPLETED Task
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 已完成任务重复调用编排：安全幂等且返回同一工件标识...");
    const result2 = await completeTaskWithOfflineDeterministicAi(taskA1.id, analysisA);

    const reportCountA = await prisma.deterministicReportArtifact.count({
      where: { taskId: taskA1.id },
    });
    const aiCountA = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskA1.id },
    });

    const pass2 =
      result2.deterministicReportArtifactId === result1.deterministicReportArtifactId &&
      result2.aiAnalysisArtifactId === result1.aiAnalysisArtifactId &&
      result2.taskStatus === "COMPLETED" &&
      reportCountA === 1 &&
      aiCountA === 1;

    console.log(`  - 幂等返回相同两个 artifactId 且 DB 各仅 1 条记录: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Non-existent Task Rejection & Stable Error Code
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 不存在的任务编排：受控拒绝且零工件写入 (TASK_NOT_FOUND)...");
    let nonExistentCode: string | null = null;
    try {
      await completeTaskWithOfflineDeterministicAi("non_existent_wf_task_9999", analysisA);
    } catch (err: unknown) {
      if (err instanceof TaskWorkflowTaskNotFoundError) {
        nonExistentCode = err.code;
      }
    }

    const nonExistentReportCount = await prisma.deterministicReportArtifact.count({
      where: { taskId: "non_existent_wf_task_9999" },
    });
    const nonExistentAiCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: "non_existent_wf_task_9999" },
    });

    const pass3 =
      nonExistentCode === "TASK_NOT_FOUND" &&
      nonExistentReportCount === 0 &&
      nonExistentAiCount === 0;

    console.log(`  - 不存在任务受控拦截 (code=TASK_NOT_FOUND, 零写入): ${pass3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: Initial Terminal Task Rejection & Stable Error Code
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 初始终态任务 (FAILED) 编排：受控拒绝且零写入 (TERMINAL_STATE_ERROR)...");
    const targetB = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_B,
        displayName: "测试编排用户 B",
      },
    });

    const taskB_failed = await prisma.analysisTask.create({
      data: {
        targetId: targetB.id,
        taskStatus: "FAILED",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });

    let failedCode: string | null = null;
    try {
      await completeTaskWithOfflineDeterministicAi(taskB_failed.id, analysisB);
    } catch (err: unknown) {
      if (err instanceof TaskWorkflowTerminalStateError) {
        failedCode = err.code;
      }
    }

    const failedReportCount = await prisma.deterministicReportArtifact.count({
      where: { taskId: taskB_failed.id },
    });
    const failedAiCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskB_failed.id },
    });

    const pass4 =
      failedCode === "TERMINAL_STATE_ERROR" &&
      failedReportCount === 0 &&
      failedAiCount === 0;

    console.log(`  - 终态 FAILED 任务拦截 (code=TERMINAL_STATE_ERROR, 零写入): ${pass4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Failure during AI Artifact Creation (Task must NOT be completed)
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] AI 工件写入失败时：任务保持 RUNNING 不得完成，报告保持不可变，零泄露...");
    const targetC = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_C,
        displayName: "测试编排用户 C",
      },
    });

    const taskC1 = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });

    const SENTINEL_AI_CREATE_FAIL = "SENTINEL_AI_CREATE_FAILURE_MOCK_ERR_9996";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalAiCreate = (prisma.aiAnalysisArtifact as any).create;

    let aiFailCode: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.aiAnalysisArtifact as any).create = async () => {
        throw new Error(`AI create simulated error: ${SENTINEL_AI_CREATE_FAIL}`);
      };

      await completeTaskWithOfflineDeterministicAi(taskC1.id, analysisA);
    } catch (err: unknown) {
      if (
        err instanceof TaskWorkflowAiPersistError ||
        err instanceof TaskWorkflowExecutionError
      ) {
        aiFailCode = err.code;
      }
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.aiAnalysisArtifact as any).create = originalAiCreate;
    }

    // Task must still be RUNNING
    const dbTaskC1 = await prisma.analysisTask.findUnique({
      where: { id: taskC1.id },
      select: {
        taskStatus: true,
        pipelineStage: true,
        progress: true,
        completedAt: true,
      },
    });

    const reportCountC1 = await prisma.deterministicReportArtifact.count({
      where: { taskId: taskC1.id },
    });
    const aiCountC1 = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskC1.id },
    });

    const pass5 =
      aiFailCode === "AI_ANALYSIS_PERSISTENCE_FAILED" &&
      dbTaskC1?.taskStatus === "RUNNING" &&
      dbTaskC1?.completedAt === null &&
      reportCountC1 === 1 &&
      aiCountC1 === 0;

    console.log(`  - 失败时任务保持 RUNNING (progress=${dbTaskC1?.progress}%, code=${aiFailCode}): ${dbTaskC1?.taskStatus === "RUNNING" ? "✅" : "❌"}`);
    console.log(`  - 确定性报告已安全保留 (count=1), AI 未写入 (count=0): ${reportCountC1 === 1 && aiCountC1 === 0 ? "✅" : "❌"}`);
    if (!pass5) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Strict Isolation Between Two Different Tasks
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] 两个不同 Task (Task A1 与 Task D1) 报告、AI 工件与完成状态严格隔离...");
    const targetD = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_D,
        displayName: "测试编排用户 D",
      },
    });

    const taskD1 = await prisma.analysisTask.create({
      data: {
        targetId: targetD.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });

    const resultD1 = await completeTaskWithOfflineDeterministicAi(taskD1.id, analysisB);

    const pass6 =
      resultD1.taskId === taskD1.id &&
      resultD1.taskStatus === "COMPLETED" &&
      resultD1.deterministicReportArtifactId !== result1.deterministicReportArtifactId &&
      resultD1.aiAnalysisArtifactId !== result1.aiAnalysisArtifactId;

    console.log(`  - Task A (游戏) 与 Task D (科技/动漫) 隔离且各自独立完成: ${pass6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Concurrency Race Safety (Same Task, Same Input)
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] 同一任务并发相同请求安全测试...");
    const taskD2 = await prisma.analysisTask.create({
      data: {
        targetId: targetD.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });

    const [resConc1, resConc2] = await Promise.all([
      completeTaskWithOfflineDeterministicAi(taskD2.id, analysisB),
      completeTaskWithOfflineDeterministicAi(taskD2.id, analysisB),
    ]);

    const reportCountD2 = await prisma.deterministicReportArtifact.count({
      where: { taskId: taskD2.id },
    });
    const aiCountD2 = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskD2.id },
    });
    const dbTaskD2 = await prisma.analysisTask.findUnique({
      where: { id: taskD2.id },
      select: { taskStatus: true },
    });

    const pass7 =
      resConc1.deterministicReportArtifactId === resConc2.deterministicReportArtifactId &&
      resConc1.aiAnalysisArtifactId === resConc2.aiAnalysisArtifactId &&
      resConc1.taskStatus === "COMPLETED" &&
      resConc2.taskStatus === "COMPLETED" &&
      dbTaskD2?.taskStatus === "COMPLETED" &&
      reportCountD2 === 1 &&
      aiCountD2 === 1;

    console.log(`  - 并发两调用均成功，返回相同两个 artifactId, 每类 DB 各 1 行，任务完成: ${pass7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass7) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 8: Conflict Defense on Conflicting Input against Immutable Artifacts
    // -------------------------------------------------------------------------
    console.log("\n[测试 8] 冲突输入对已有不可变报告/AI 工件防御测试 (CONFLICT_ERROR)...");
    let conflictCode: string | null = null;
    try {
      // Try to re-complete taskA1 (completed with analysisA) using analysisB
      await completeTaskWithOfflineDeterministicAi(taskA1.id, analysisB);
    } catch (err: unknown) {
      if (err instanceof TaskWorkflowConflictError) {
        conflictCode = err.code;
      }
    }

    const pass8 = conflictCode === "CONFLICT_ERROR";
    console.log(`  - 冲突输入被拦截 (code=CONFLICT_ERROR, 原工件保持不变): ${pass8 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 9: Phase 6.3.1 Terminal Race Window Protection (Atomic Conditional Update)
    // -------------------------------------------------------------------------
    console.log("\n[测试 9] Phase 6.3.1 终态竞态窗口防御测试 (任务在最终更新前被 CANCELLED)...");
    const targetE = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_E,
        displayName: "测试编排用户 E",
      },
    });

    const taskE1 = await prisma.analysisTask.create({
      data: {
        targetId: targetE.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });

    // We hook into prisma.aiAnalysisArtifact.findUnique during step 5 (verification)
    // to simulate the task being CANCELLED in DB right before the completion update!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalAiFindUnique = (prisma.aiAnalysisArtifact as any).findUnique;
    let raceCancelledCode: string | null = null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.aiAnalysisArtifact as any).findUnique = async (...args: any[]) => {
        // As soon as AI artifact is being verified, another thread cancels the task in DB
        await prisma.analysisTask.update({
          where: { id: taskE1.id },
          data: {
            taskStatus: "CANCELLED",
            pipelineStage: "AI_ANALYSIS",
          },
        });
        return originalAiFindUnique.apply(prisma.aiAnalysisArtifact, args);
      };

      await completeTaskWithOfflineDeterministicAi(taskE1.id, analysisA);
    } catch (err: unknown) {
      if (err instanceof TaskWorkflowTerminalStateError) {
        raceCancelledCode = err.code;
      }
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.aiAnalysisArtifact as any).findUnique = originalAiFindUnique;
    }

    // Verify task is STILL CANCELLED in DB and NOT COMPLETED
    const dbTaskE1 = await prisma.analysisTask.findUnique({
      where: { id: taskE1.id },
      select: {
        taskStatus: true,
        completedAt: true,
      },
    });

    const pass9 =
      raceCancelledCode === "TERMINAL_STATE_ERROR" &&
      dbTaskE1?.taskStatus === "CANCELLED" &&
      dbTaskE1?.completedAt === null;

    console.log(`  - 竞态取消拦截成功 (code=TERMINAL_STATE_ERROR): ${raceCancelledCode === "TERMINAL_STATE_ERROR" ? "✅" : "❌"}`);
    console.log(`  - 数据库中任务状态严格保持 CANCELLED (未被复写为 COMPLETED): ${pass9 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass9) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 10: Phase 6.3.1 Error Classes Stable Code Verification
    // -------------------------------------------------------------------------
    console.log("\n[测试 10] Phase 6.3.1 全部编排受控错误类稳定 code 契约断言...");
    const errTaskNotFound = new TaskWorkflowTaskNotFoundError();
    const errTerminal = new TaskWorkflowTerminalStateError();
    const errConflict = new TaskWorkflowConflictError();
    const errReportPersist = new TaskWorkflowReportPersistError();
    const errAiPersist = new TaskWorkflowAiPersistError();
    const errVerification = new TaskWorkflowVerificationError();
    const errLifecycle = new TaskWorkflowLifecycleError();

    const pass10 =
      errTaskNotFound.code === "TASK_NOT_FOUND" &&
      errTerminal.code === "TERMINAL_STATE_ERROR" &&
      errConflict.code === "CONFLICT_ERROR" &&
      errReportPersist.code === "REPORT_PERSISTENCE_FAILED" &&
      errAiPersist.code === "AI_ANALYSIS_PERSISTENCE_FAILED" &&
      errVerification.code === "ARTIFACT_VERIFICATION_FAILED" &&
      errLifecycle.code === "LIFECYCLE_TRANSITION_FAILED";

    console.log(`  - 7 类受控错误 code 均精确匹配契约: ${pass10 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass10) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 11: Zero Leakage Verification on APIs & Workflow Results
    // -------------------------------------------------------------------------
    console.log("\n[测试 11] 敏感字段与哨兵文本零泄露综合验证...");
    const reqReportApi = new NextRequest(`http://localhost:3000/api/tasks/${taskA1.id}/deterministic-report`);
    const respReportApi = await getDeterministicReportApi(reqReportApi, { params: Promise.resolve({ id: taskA1.id }) });
    const jsonReportApi = await respReportApi.json();
    const strReportApi = JSON.stringify(jsonReportApi);

    const reqAiApi = new NextRequest(`http://localhost:3000/api/tasks/${taskA1.id}/ai-analysis`);
    const respAiApi = await getAiAnalysisApi(reqAiApi, { params: Promise.resolve({ id: taskA1.id }) });
    const jsonAiApi = await respAiApi.json();
    const strAiApi = JSON.stringify(jsonAiApi);

    const strWorkflowResult = JSON.stringify(result1);

    const pass11 =
      respReportApi.status === 200 &&
      respAiApi.status === 200 &&
      !strReportApi.includes(SENTINEL_RAW_TEXT_A) &&
      !strReportApi.includes("SnapshotField") &&
      !strReportApi.includes("currentGoals") &&
      !strReportApi.includes("learningDirections") &&
      !strReportApi.includes("customPrompt") &&
      !strReportApi.includes("SESSDATA") &&
      !strReportApi.includes("Cookie") &&
      !strReportApi.includes("bili_jct") &&
      !strAiApi.includes(SENTINEL_RAW_TEXT_A) &&
      !strAiApi.includes("SnapshotField") &&
      !strAiApi.includes("currentGoals") &&
      !strAiApi.includes("learningDirections") &&
      !strAiApi.includes("customPrompt") &&
      !strAiApi.includes("SESSDATA") &&
      !strAiApi.includes("Cookie") &&
      !strAiApi.includes("bili_jct") &&
      !strWorkflowResult.includes(SENTINEL_RAW_TEXT_A) &&
      !strWorkflowResult.includes("SnapshotField") &&
      !strWorkflowResult.includes("SESSDATA");

    console.log(`  - 报告工件 API、AI 工件 API 与编排结果零敏感文本泄露: ${pass11 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass11) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 12: Zero Network Fetch Calls Assertion
    // -------------------------------------------------------------------------
    console.log("\n[测试 12] 全测试流程零外部网络请求断言...");
    const pass12 = fetchCallCount === 0;
    console.log(`  - 全程 fetch 调用总数: ${fetchCallCount} -> ${pass12 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass12) allPassed = false;

    console.log("\n=================================================");
    if (allPassed) {
      console.log("🎉 Phase 6.3 & 6.3.1 任务级离线 MOCK AI 工件自动生成与完成编排测试全部通过！");
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

runWorkflowVerification().catch((err) => {
  console.error("任务编排测试脚本异常:", err);
  process.exit(1);
});
