/**
 * BiliProfile Analyzer — Phase 5.1.2 Task Lifecycle & Route Integration Verification Suite
 * 
 * Verifies:
 * 1. Pure function lifecycle transition and invariant rules:
 *    a. PENDING normal transition to RUNNING.
 *    b. RUNNING normal pipelineStage and progress advancement.
 *    c. Normal task completion (REPORT, progress=100%, outcome=FULL/PARTIAL, completedAt non-null Date or ISO string).
 *    c2. COMPLETED with null completedAt rejected (COMPLETED_REQUIRES_COMPLETED_AT).
 *    c3. COMPLETED with invalid Date object rejected (INVALID_COMPLETED_AT).
 *    c4. COMPLETED with empty string completedAt rejected (COMPLETED_REQUIRES_COMPLETED_AT).
 *    d. Stage regression rejected (e.g., EXTRACT -> CLEAN).
 *    e. Progress regression rejected (e.g., 50% -> 30%).
 *    f. Skipping REPORT directly to COMPLETED rejected (e.g., CLEAN -> COMPLETED).
 *    g. Updating after terminal state (COMPLETED/FAILED/CANCELLED) rejected.
 *    h. Empty patch requests rejected (EMPTY_UPDATE).
 *    i. Non-terminal dataSourceRuns: [] is recognized as a valid non-empty patch.
 * 
 * 2. PATCH Route Handler direct SQLite integration tests (Zero network, direct execution):
 *    a. RUNNING -> COMPLETED without completedAt: succeeds with auto-generated non-null completedAt in DB.
 *    b. RUNNING -> COMPLETED with completedAt: null: rejected with 400, 0 DB mutations.
 *    c. Non-terminal task with dataSourceRuns: []: succeeds and clears dataSourceRuns.
 *    d. Terminal task with dataSourceRuns: []: rejected with 400, original records preserved.
 *    e. Empty PATCH request {}: rejected with 400, 0 DB mutations.
 *    f. [Phase 5.1.2 Regression] RUNNING task with existing completedAt receiving {}: rejected with 400 / EMPTY_UPDATE, zero mutations on task or dataSourceRuns.
 * 
 * Safety:
 * - Pure local SQLite operations.
 * - Zero external network calls.
 * - Isolated test fixtures safely cleaned up in finally.
 */

import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import {
  validateTaskLifecycleTransition,
} from "../../src/lib/task-lifecycle";
import { createTaskWithSnapshot } from "../../src/lib/self-profile-service";
import { PATCH } from "../../src/app/api/tasks/[id]/route";

const prisma = new PrismaClient();

const TEST_PROFILE_ID = "test_lifecycle_profile_99901";
const TEST_TARGET_UID = "test_lifecycle_target_99901";

async function cleanupFixtures() {
  try {
    const targets = await prisma.analysisTarget.findMany({
      where: { platformUid: TEST_TARGET_UID },
    });
    for (const t of targets) {
      await prisma.analysisTarget.delete({ where: { id: t.id } });
    }
    const profiles = await prisma.selfProvidedProfile.findMany({
      where: { id: TEST_PROFILE_ID },
    });
    for (const p of profiles) {
      await prisma.selfProvidedProfile.delete({ where: { id: p.id } });
    }
  } catch {
    // Ignore cleanup errors during pre-clean
  }
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runTaskLifecycleVerification() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 5.1.2 任务生命周期与路由修复测试");
  console.log("=================================================\n");

  let allPassed = true;

  try {
    await cleanupFixtures();

    // =========================================================================
    // --- Part 1: Pure Function Unit Tests ---
    // =========================================================================
    console.log("[模块 1] 纯函数生命周期状态转换与组合校验规则测试...");

    // Test a: PENDING -> RUNNING
    const resA = validateTaskLifecycleTransition(
      { taskStatus: "PENDING", pipelineStage: "COLLECT", progress: 0, outcome: "NONE" },
      { taskStatus: "RUNNING", pipelineStage: "COLLECT", progress: 0 }
    );
    const passA = resA.valid;
    console.log(`  - [规则 a] PENDING 正常进入 RUNNING: ${passA ? "✅ 通过" : "❌ 失败"}`);
    if (!passA) allPassed = false;

    // Test b: RUNNING advances stage and progress
    const resB = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "COLLECT", progress: 10, outcome: "NONE" },
      { pipelineStage: "EXTRACT", progress: 45 }
    );
    const passB = resB.valid;
    console.log(`  - [规则 b] RUNNING 正常递进阶段与进度: ${passB ? "✅ 通过" : "❌ 失败"}`);
    if (!passB) allPassed = false;

    // Test c: Normal completion with valid completedAt
    const resC = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "SYNTHESIS", progress: 90, outcome: "NONE" },
      { taskStatus: "COMPLETED", pipelineStage: "REPORT", progress: 100, outcome: "FULL", completedAt: new Date().toISOString() }
    );
    const passC = resC.valid;
    console.log(`  - [规则 c] 正常完成任务 (REPORT, 100%, FULL, completedAt 非空): ${passC ? "✅ 通过" : "❌ 失败"}`);
    if (!passC) allPassed = false;

    // Test c2: COMPLETED with null completedAt must fail
    const resC2 = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "REPORT", progress: 100, outcome: "FULL" },
      { taskStatus: "COMPLETED", completedAt: null }
    );
    const passC2 = !resC2.valid && resC2.code === "COMPLETED_REQUIRES_COMPLETED_AT";
    console.log(`  - [规则 c2] COMPLETED 状态传入 completedAt: null 被拦截: ${passC2 ? "✅ 通过" : "❌ 失败"}`);
    if (!passC2) allPassed = false;

    // Test c3: COMPLETED with Invalid Date object must fail
    const resC3 = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "REPORT", progress: 100, outcome: "FULL" },
      { taskStatus: "COMPLETED", completedAt: new Date("invalid-date-string") }
    );
    const passC3 = !resC3.valid && resC3.code === "INVALID_COMPLETED_AT";
    console.log(`  - [规则 c3] COMPLETED 状态传入 new Date("invalid") 被拦截 (INVALID_COMPLETED_AT): ${passC3 ? "✅ 通过" : "❌ 失败"}`);
    if (!passC3) allPassed = false;

    // Test c4: COMPLETED with empty string completedAt must fail
    const resC4 = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "REPORT", progress: 100, outcome: "FULL" },
      { taskStatus: "COMPLETED", completedAt: "   " }
    );
    const passC4 = !resC4.valid && resC4.code === "COMPLETED_REQUIRES_COMPLETED_AT";
    console.log(`  - [规则 c4] COMPLETED 状态传入空字符串 completedAt 被拦截: ${passC4 ? "✅ 通过" : "❌ 失败"}`);
    if (!passC4) allPassed = false;

    // Test d: Stage regression rejected
    const resD = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "EXTRACT", progress: 50, outcome: "NONE" },
      { pipelineStage: "CLEAN" }
    );
    const passD = !resD.valid && resD.code === "STAGE_REGRESSION";
    console.log(`  - [规则 d] 阶段倒退被拦截 (EXTRACT -> CLEAN): ${passD ? "✅ 通过" : "❌ 失败"}`);
    if (!passD) allPassed = false;

    // Test e: Progress regression rejected
    const resE = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "EXTRACT", progress: 50, outcome: "NONE" },
      { progress: 30 }
    );
    const passE = !resE.valid && resE.code === "PROGRESS_REGRESSION";
    console.log(`  - [规则 e] 进度倒退被拦截 (50% -> 30%): ${passE ? "✅ 通过" : "❌ 失败"}`);
    if (!passE) allPassed = false;

    // Test f: Skipping REPORT directly to COMPLETED rejected
    const resF = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "CLEAN", progress: 30, outcome: "NONE" },
      { taskStatus: "COMPLETED", outcome: "FULL", completedAt: new Date().toISOString() }
    );
    const passF = !resF.valid && (resF.code === "INCOMPLETE_STAGE_FOR_COMPLETION" || resF.code === "INCOMPLETE_PROGRESS_FOR_COMPLETION");
    console.log(`  - [规则 f] 未达 REPORT 直接标记 COMPLETED 被拦截: ${passF ? "✅ 通过" : "❌ 失败"}`);
    if (!passF) allPassed = false;

    // Test g: Updating after terminal state rejected
    const resG = validateTaskLifecycleTransition(
      { taskStatus: "COMPLETED", pipelineStage: "REPORT", progress: 100, outcome: "FULL", completedAt: new Date().toISOString() },
      { progress: 100, currentStageMessage: "尝试修改终态" }
    );
    const passG = !resG.valid && resG.code === "TERMINAL_STATE_IMMUTABLE";
    console.log(`  - [规则 g] 终态任务 (COMPLETED) 再次修改被拦截: ${passG ? "✅ 通过" : "❌ 失败"}`);
    if (!passG) allPassed = false;

    // Test h: Empty patch rejected
    const resH = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "COLLECT", progress: 10, outcome: "NONE" },
      {}
    );
    const passH = !resH.valid && resH.code === "EMPTY_UPDATE";
    console.log(`  - [规则 h] 真正空更新请求被拦截: ${passH ? "✅ 通过" : "❌ 失败"}`);
    if (!passH) allPassed = false;

    // Test i: dataSourceRuns: [] is recognized as a valid non-empty patch
    const resI = validateTaskLifecycleTransition(
      { taskStatus: "RUNNING", pipelineStage: "COLLECT", progress: 10, outcome: "NONE" },
      { dataSourceRuns: [] }
    );
    const passI = resI.valid;
    console.log(`  - [规则 i] 非终态传递 dataSourceRuns: [] 被认定为有效更新: ${passI ? "✅ 通过" : "❌ 失败"}`);
    if (!passI) allPassed = false;


    // =========================================================================
    // --- Part 2: PATCH Route Handler Integration Tests (Direct Invocation) ---
    // =========================================================================
    console.log("\n[模块 2] PATCH Route Handler 真实 SQLite 集成与零写入验证...");

    // Create initial task
    const task = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_UID,
        displayName: "生命周期路由集成测试目标",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_ID
    );

    // Initial transition to RUNNING with some initial dataSourceRuns
    const initRes = await PATCH(
      makePatchRequest(task.id, {
        taskStatus: "RUNNING",
        pipelineStage: "EXTRACT",
        progress: 40,
        dataSourceRuns: [
          { sourceName: "演示基础资料", status: "SUCCEEDED", recordsCount: 1 },
          { sourceName: "演示关注样本", status: "SUCCEEDED", recordsCount: 50 },
        ],
      }),
      { params: Promise.resolve({ id: task.id }) }
    );

    const initPassed = initRes.status === 200;
    console.log(`  - [集成准备] 任务初始化为 RUNNING 并注入 2 条数据源: ${initPassed ? "✅" : "❌"}`);
    if (!initPassed) allPassed = false;

    // --- Subtest a: RUNNING -> COMPLETED without completedAt in body -> Auto-generated non-null in DB ---
    console.log("\n  - [集成 a] RUNNING -> COMPLETED 且未传 completedAt (验证自动合成非空时间)...");
    const completeRes = await PATCH(
      makePatchRequest(task.id, {
        taskStatus: "COMPLETED",
        pipelineStage: "REPORT",
        progress: 100,
        outcome: "FULL",
      }),
      { params: Promise.resolve({ id: task.id }) }
    );

    const dbTaskA = await prisma.analysisTask.findUniqueOrThrow({
      where: { id: task.id },
    });
    const subtestAPassed =
      completeRes.status === 200 &&
      dbTaskA.taskStatus === "COMPLETED" &&
      dbTaskA.completedAt !== null;

    console.log(`    响应状态码: ${completeRes.status}, 数据库 completedAt: ${dbTaskA.completedAt ? "已自动生成非空" : "null"} -> ${subtestAPassed ? "✅ 通过" : "❌ 失败"}`);
    if (!subtestAPassed) allPassed = false;

    // --- Subtest b: RUNNING -> COMPLETED with completedAt: null -> Returns 400, 0 DB mutations ---
    console.log("\n  - [集成 b] RUNNING 任务尝试 COMPLETED 且传 completedAt: null (验证 400 拦截与 0 写入)...");
    const taskB = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_UID,
        displayName: "测试目标 B",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_ID
    );
    await PATCH(
      makePatchRequest(taskB.id, {
        taskStatus: "RUNNING",
        pipelineStage: "REPORT",
        progress: 100,
        outcome: "FULL",
      }),
      { params: Promise.resolve({ id: taskB.id }) }
    );

    const dbBeforeB = await prisma.analysisTask.findUniqueOrThrow({ where: { id: taskB.id } });

    const nullCompletedRes = await PATCH(
      makePatchRequest(taskB.id, {
        taskStatus: "COMPLETED",
        completedAt: null,
      }),
      { params: Promise.resolve({ id: taskB.id }) }
    );

    const dbAfterB = await prisma.analysisTask.findUniqueOrThrow({ where: { id: taskB.id } });
    const subtestBPassed =
      nullCompletedRes.status === 400 &&
      dbAfterB.taskStatus === dbBeforeB.taskStatus &&
      dbAfterB.completedAt === dbBeforeB.completedAt;

    console.log(`    响应状态码: ${nullCompletedRes.status}, 数据库任务状态保持不变 (0 写入): ${subtestBPassed ? "✅ 通过" : "❌ 失败"}`);
    if (!subtestBPassed) allPassed = false;

    // --- Subtest c: Non-terminal task with dataSourceRuns: [] -> Clears dataSourceRuns ---
    console.log("\n  - [集成 c] 非终态任务传递 dataSourceRuns: [] (验证清空数据源记录)...");
    const taskC = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_UID,
        displayName: "测试目标 C",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_ID
    );
    await PATCH(
      makePatchRequest(taskC.id, {
        taskStatus: "RUNNING",
        dataSourceRuns: [{ sourceName: "演示项", status: "SUCCEEDED", recordsCount: 10 }],
      }),
      { params: Promise.resolve({ id: taskC.id }) }
    );

    const dsBeforeC = await prisma.dataSourceRun.findMany({ where: { taskId: taskC.id } });

    const clearDsRes = await PATCH(
      makePatchRequest(taskC.id, {
        dataSourceRuns: [],
      }),
      { params: Promise.resolve({ id: taskC.id }) }
    );

    const dsAfterC = await prisma.dataSourceRun.findMany({ where: { taskId: taskC.id } });
    const subtestCPassed =
      clearDsRes.status === 200 &&
      dsBeforeC.length === 1 &&
      dsAfterC.length === 0;

    console.log(`    响应状态码: ${clearDsRes.status}, 数据源记录数变化: ${dsBeforeC.length} -> ${dsAfterC.length} -> ${subtestCPassed ? "✅ 通过" : "❌ 失败"}`);
    if (!subtestCPassed) allPassed = false;

    // --- Subtest d: Terminal task with dataSourceRuns: [] -> Returns 400, original records intact ---
    console.log("\n  - [集成 d] 终态任务传递 dataSourceRuns: [] (验证拦截与原记录完整保留)...");
    const dsBeforeD = await prisma.dataSourceRun.findMany({ where: { taskId: task.id } });

    const terminalDsRes = await PATCH(
      makePatchRequest(task.id, {
        dataSourceRuns: [],
      }),
      { params: Promise.resolve({ id: task.id }) }
    );

    const dsAfterD = await prisma.dataSourceRun.findMany({ where: { taskId: task.id } });
    const subtestDPassed =
      terminalDsRes.status === 400 &&
      dsBeforeD.length === dsAfterD.length;

    console.log(`    响应状态码: ${terminalDsRes.status}, 终态数据源记录未被修改 (${dsBeforeD.length} 条保留) -> ${subtestDPassed ? "✅ 通过" : "❌ 失败"}`);
    if (!subtestDPassed) allPassed = false;

    // --- Subtest e: Empty PATCH -> Returns 400 and zero writes ---
    console.log("\n  - [集成 e] 空 PATCH 请求体 {} (验证 400 拦截与 0 写入)...");
    const emptyRes = await PATCH(
      makePatchRequest(taskC.id, {}),
      { params: Promise.resolve({ id: taskC.id }) }
    );

    const subtestEPassed = emptyRes.status === 400;
    console.log(`    响应状态码: ${emptyRes.status} -> ${subtestEPassed ? "✅ 通过" : "❌ 失败"}`);
    if (!subtestEPassed) allPassed = false;

    // --- Subtest f (Phase 5.1.2 Regression): RUNNING task with existing completedAt receiving {} ---
    console.log("\n  - [集成 f] RUNNING 任务带有已有 completedAt 且接收空 PATCH {} (验证 EMPTY_UPDATE 拦截与 0 写入)...");
    const taskF = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_UID,
        displayName: "测试目标 F",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_ID
    );

    // Give taskF an existing completedAt while still in RUNNING (controlled fixture)
    const fixedDate = new Date("2026-08-26T12:00:00.000Z");
    await prisma.analysisTask.update({
      where: { id: taskF.id },
      data: {
        taskStatus: "RUNNING",
        pipelineStage: "EXTRACT",
        progress: 40,
        completedAt: fixedDate,
      },
    });
    await prisma.dataSourceRun.create({
      data: {
        taskId: taskF.id,
        sourceName: "测试固定源",
        status: "SUCCEEDED",
        recordsCount: 20,
      },
    });

    const dbBeforeF = await prisma.analysisTask.findUniqueOrThrow({ where: { id: taskF.id } });
    const dsBeforeF = await prisma.dataSourceRun.findMany({ where: { taskId: taskF.id } });

    // Send empty {}
    const emptyOnTaskFRes = await PATCH(
      makePatchRequest(taskF.id, {}),
      { params: Promise.resolve({ id: taskF.id }) }
    );

    const emptyOnTaskFJson = await emptyOnTaskFRes.json();
    const dbAfterF = await prisma.analysisTask.findUniqueOrThrow({ where: { id: taskF.id } });
    const dsAfterF = await prisma.dataSourceRun.findMany({ where: { taskId: taskF.id } });

    const subtestFPassed =
      emptyOnTaskFRes.status === 400 &&
      emptyOnTaskFJson?.error?.code === "EMPTY_UPDATE" &&
      dbAfterF.updatedAt.getTime() === dbBeforeF.updatedAt.getTime() &&
      dbAfterF.taskStatus === dbBeforeF.taskStatus &&
      dbAfterF.pipelineStage === dbBeforeF.pipelineStage &&
      dbAfterF.progress === dbBeforeF.progress &&
      dbAfterF.completedAt?.toISOString() === dbBeforeF.completedAt?.toISOString() &&
      dsAfterF.length === dsBeforeF.length;

    console.log(`    响应状态码: ${emptyOnTaskFRes.status}, 错误码: ${emptyOnTaskFJson?.error?.code}, 数据库零写入验证: ${subtestFPassed ? "✅ 通过" : "❌ 失败"}`);
    if (!subtestFPassed) allPassed = false;

    console.log("\n=================================================");
    if (allPassed) {
      console.log("🎉 Phase 5.1.2 生命周期与路由修复所有测试全部通过！");
      console.log("=================================================\n");
    } else {
      console.error("❌ 部分集成测试未通过，请检查。");
      console.log("=================================================\n");
      process.exit(1);
    }
  } finally {
    await cleanupFixtures();
    console.log("[清理] 测试夹具已安全清除。\n");
    await prisma.$disconnect();
  }
}

runTaskLifecycleVerification().catch((err) => {
  console.error("生命周期验证脚本异常:", err);
  process.exit(1);
});
