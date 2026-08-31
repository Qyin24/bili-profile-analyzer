/**
 * BiliProfile Analyzer — Phase 5.2.3.1 Deterministic Report Storage & API Integration Test Suite
 *
 * Verifies:
 * 1. Persisting deterministic pipeline result creates artifact; reading returns semantically equal report to buildDeterministicReportInput.
 * 2. Idempotency: Repeating persist with identical result for same task returns existing artifact safely without mutation.
 * 3. Conflict rejection: Attempting to persist different result for same task is rejected; original artifact remains unchanged.
 * 4. Non-existent task persist is rejected with zero writes.
 * 5. Terminal task cannot have report artifact persisted or modified.
 * 6. Task without artifact returns "REPORT_NOT_FOUND".
 * 7. Read-only API returns safe report and JSON string has zero leaks (sentinels, snapshot values, self-profile, credentials).
 * 8. Two different tasks' report artifacts are strictly isolated.
 * 9. Corrupted JSON or invalid report artifact in database is rejected by service and API with controlled error, zero raw JSON or sentinel leaks.
 * 10. Global fetch call count is 0 throughout entire test suite.
 *
 * Phase 5.2.3.1 Additions:
 * 11. Concurrency: Same task, identical result concurrent persistence returns same artifactId (both succeed, DB has 1 row).
 * 12. Concurrency: Same task, different result concurrent persistence yields exactly one winner and one ReportConflictError (DB has 1 row).
 * 13. Metadata integrity: DB schemaVersion mismatch is rejected by service (VERSION_METADATA_MISMATCH) and API (422), zero leak.
 * 14. Metadata integrity: DB taxonomyVersion mismatch is rejected by service (VERSION_METADATA_MISMATCH) and API (422), zero leak.
 *
 * Safety:
 * - Pure local SQLite operations.
 * - Zero external network calls (fetch intercepted).
 * - Isolated test fixtures safely cleaned up in finally block.
 */

import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
} from "../../src/lib/processing/pipeline";
import {
  persistDeterministicReportForTask,
  getDeterministicReportForTask,
  TaskNotFoundError,
  TerminalTaskReportError,
  ReportConflictError,
} from "../../src/lib/deterministic-report-service";
import { GET } from "../../src/app/api/tasks/[id]/deterministic-report/route";
import { PublicSourceRecord } from "../../src/types/processing";

const prisma = new PrismaClient();

const TEST_TARGET_UID_A = "test_report_target_99901";
const TEST_TARGET_UID_B = "test_report_target_99902";
const TEST_TARGET_UID_C = "test_report_target_99903";

async function cleanupFixtures() {
  try {
    const targets = await prisma.analysisTarget.findMany({
      where: {
        platformUid: {
          in: [TEST_TARGET_UID_A, TEST_TARGET_UID_B, TEST_TARGET_UID_C],
        },
      },
      include: {
        tasks: {
          include: {
            deterministicReport: true,
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

async function runReportStorageVerification() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 5.2.3.1 报告工件并发一致性与元数据完整性测试");
  console.log("=================================================\n");

  let allPassed = true;

  // Intercept global fetch to strictly ensure zero network activity
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: unknown[]) => {
    fetchCallCount++;
    throw new Error("Report storage test violation: network fetch attempted!");
  };

  try {
    await cleanupFixtures();

    // Setup Targets & Tasks
    const targetA = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_A,
        displayName: "测试用户 A",
      },
    });

    const taskA1 = await prisma.analysisTask.create({
      data: {
        targetId: targetA.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const taskA2_terminal = await prisma.analysisTask.create({
      data: {
        targetId: targetA.id,
        taskStatus: "COMPLETED",
        pipelineStage: "REPORT",
        progress: 100,
        completedAt: new Date(),
      },
    });

    const taskA3_no_report = await prisma.analysisTask.create({
      data: {
        targetId: targetA.id,
        taskStatus: "RUNNING",
        pipelineStage: "COLLECT",
        progress: 10,
      },
    });

    const targetB = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_B,
        displayName: "测试用户 B",
      },
    });

    const taskB1 = await prisma.analysisTask.create({
      data: {
        targetId: targetB.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const targetC = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_C,
        displayName: "测试用户 C",
      },
    });

    // Sample Data Fixtures
    const SENTINEL_RAW_TEXT = "SENTINEL_RAW_BODY_CONFIDENTIAL_1234567890";
    const sampleRecordsA: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_g1",
        sourceType: "CONTENT",
        title: "黑神话悟空全流程速通攻略",
        description: `包含保密敏感正文：${SENTINEL_RAW_TEXT}`,
        tags: ["游戏", "单机游戏"],
      },
      {
        sourceRecordId: "rec_g2",
        sourceType: "CONTENT",
        title: "原神探索攻略",
        tags: ["游戏"],
      },
    ];

    const sampleRecordsB: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_t1",
        sourceType: "CONTENT",
        title: "人工智能前沿研究实战",
        tags: ["科技", "AI"],
      },
      {
        sourceRecordId: "rec_a1",
        sourceType: "FOLLOW",
        title: "新番连载动漫专栏",
        tags: ["动漫"],
      },
    ];

    const analysisResultA = runDeterministicAnalysis(sampleRecordsA);
    const expectedReportInputA = buildDeterministicReportInput(analysisResultA);

    const analysisResultB = runDeterministicAnalysis(sampleRecordsB);
    const expectedReportInputB = buildDeterministicReportInput(analysisResultB);

    // -------------------------------------------------------------------------
    // Test 1: Persist and Retrieve Equality
    // -------------------------------------------------------------------------
    console.log("[测试 1] 写入确定性分析结果并读取，验证工件语义一致性...");
    const persistedA = await persistDeterministicReportForTask(taskA1.id, analysisResultA);
    const fetchedA = await getDeterministicReportForTask(taskA1.id);

    const pass1 =
      fetchedA.success === true &&
      fetchedA.data.taskId === taskA1.id &&
      JSON.stringify(fetchedA.data.report) === JSON.stringify(expectedReportInputA) &&
      persistedA.artifactId === fetchedA.data.artifactId;

    console.log(`  - 写入与读取报告深度相等: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Idempotency (Same Task & Identical Result)
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 同一 Task 相同结果重复写入：安全幂等且不产生覆盖或新记录...");
    const persistedA_repeat = await persistDeterministicReportForTask(taskA1.id, analysisResultA);
    const countA = await prisma.deterministicReportArtifact.count({
      where: { taskId: taskA1.id },
    });

    const pass2 =
      persistedA_repeat.artifactId === persistedA.artifactId &&
      countA === 1;

    console.log(`  - 幂等写入返回相同 artifactId: ${pass2 ? "✅ 通过" : "❌ 失败"} (count=${countA})`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Conflict Rejection (Same Task & Different Result)
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 同一 Task 不同结果第二次写入：明确拒绝覆盖，原工件保持不变...");
    let threwConflict = false;
    try {
      await persistDeterministicReportForTask(taskA1.id, analysisResultB);
    } catch (err: unknown) {
      if (err instanceof ReportConflictError) {
        threwConflict = true;
      }
    }

    const fetchedA_afterConflict = await getDeterministicReportForTask(taskA1.id);
    const pass3 =
      threwConflict &&
      fetchedA_afterConflict.success === true &&
      JSON.stringify(fetchedA_afterConflict.data.report) === JSON.stringify(expectedReportInputA);

    console.log(`  - 冲突写入拦截并抛出 ReportConflictError: ${pass3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: Non-existent Task Persist Rejection
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 不存在的 Task 写入：明确拒绝且零写入...");
    let threwNotFound = false;
    try {
      await persistDeterministicReportForTask("non_existent_task_id_99999", analysisResultA);
    } catch (err: unknown) {
      if (err instanceof TaskNotFoundError) {
        threwNotFound = true;
      }
    }
    const countBogus = await prisma.deterministicReportArtifact.count({
      where: { taskId: "non_existent_task_id_99999" },
    });

    const pass4 = threwNotFound && countBogus === 0;
    console.log(`  - 不存在 Task 拦截 (抛出 TaskNotFoundError, 零写入): ${pass4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Terminal Task Persist Rejection
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 终态 Task (COMPLETED) 不允许新增或修改报告工件...");
    let threwTerminal = false;
    try {
      await persistDeterministicReportForTask(taskA2_terminal.id, analysisResultA);
    } catch (err: unknown) {
      if (err instanceof TerminalTaskReportError) {
        threwTerminal = true;
      }
    }
    const countTerminal = await prisma.deterministicReportArtifact.count({
      where: { taskId: taskA2_terminal.id },
    });

    const pass5 = threwTerminal && countTerminal === 0;
    console.log(`  - 终态 Task 拦截 (抛出 TerminalTaskReportError, 零写入): ${pass5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Task Without Artifact Returns REPORT_NOT_FOUND
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] 未生成报告工件的 Task 读取返回 REPORT_NOT_FOUND...");
    const fetchedNoReport = await getDeterministicReportForTask(taskA3_no_report.id);
    const pass6 =
      fetchedNoReport.success === false &&
      fetchedNoReport.error === "REPORT_NOT_FOUND";

    console.log(`  - 无工件读取状态判定: ${pass6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Read-only API Success & Zero Leaks Assertion
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] 只读 API GET /api/tasks/[id]/deterministic-report 与零泄露验证...");
    const apiReqA = new NextRequest(
      `http://localhost:3000/api/tasks/${taskA1.id}/deterministic-report`
    );
    const apiResA = await GET(apiReqA, { params: Promise.resolve({ id: taskA1.id }) });
    const apiJsonA = await apiResA.json();
    const apiRawString = JSON.stringify(apiJsonA);

    const pass7 =
      apiResA.status === 200 &&
      apiJsonA.taskId === taskA1.id &&
      apiJsonA.report !== undefined &&
      !apiRawString.includes(SENTINEL_RAW_TEXT) &&
      !apiRawString.includes("SnapshotField") &&
      !apiRawString.includes("currentGoals") &&
      !apiRawString.includes("learningDirections") &&
      !apiRawString.includes("customPrompt") &&
      !apiRawString.includes("SESSDATA") &&
      !apiRawString.includes("Cookie");

    console.log(`  - API 状态码 200: ${apiResA.status === 200 ? "✅" : "❌"}`);
    console.log(`  - 哨兵与敏感自述/凭据零泄露: ${pass7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass7) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 8: Task Report Artifact Isolation
    // -------------------------------------------------------------------------
    console.log("\n[测试 8] 两个不同 Task (Task A1 与 Task B1) 的报告工件严格隔离...");
    await persistDeterministicReportForTask(taskB1.id, analysisResultB);
    const readA = await getDeterministicReportForTask(taskA1.id);
    const readB = await getDeterministicReportForTask(taskB1.id);

    const hasA_gaming = readA.success && readA.data.report.observations.some((o) => o.statement.includes("游戏"));
    const hasA_other = readA.success && readA.data.report.observations.some((o) => o.statement.includes("科技") || o.statement.includes("动漫"));
    const hasB_techOrAnime = readB.success && readB.data.report.observations.some((o) => o.statement.includes("科技") || o.statement.includes("动漫"));
    const hasB_gaming = readB.success && readB.data.report.observations.some((o) => o.statement.includes("游戏"));

    const pass8 =
      readA.success === true &&
      readB.success === true &&
      readA.data.taskId === taskA1.id &&
      readB.data.taskId === taskB1.id &&
      hasA_gaming &&
      !hasA_other &&
      hasB_techOrAnime &&
      !hasB_gaming;

    console.log(`  - Task A (游戏) 与 Task B (科技/动漫) 报告内容独立隔离: ${pass8 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 9: Corrupted JSON and Invalid Artifact Controlled Rejection
    // -------------------------------------------------------------------------
    console.log("\n[测试 9] 手动构造数据库损坏数据与非法工件：受控拒绝且零原始堆栈泄露...");

    // Create corrupted task
    const taskCorrupted = await prisma.analysisTask.create({
      data: {
        targetId: targetA.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const SENTINEL_CORRUPTED = "SENTINEL_CORRUPTED_RAW_BLOB_9999";
    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskCorrupted.id,
        schemaVersion: "deterministic-report-input/v1",
        taxonomyVersion: "1.0.0",
        reportData: `BAD_JSON_{${SENTINEL_CORRUPTED}`,
      },
    });

    const getCorrupted = await getDeterministicReportForTask(taskCorrupted.id);
    const apiReqCorrupted = new NextRequest(
      `http://localhost:3000/api/tasks/${taskCorrupted.id}/deterministic-report`
    );
    const apiResCorrupted = await GET(apiReqCorrupted, {
      params: Promise.resolve({ id: taskCorrupted.id }),
    });
    const apiJsonCorrupted = await apiResCorrupted.json();
    const apiStrCorrupted = JSON.stringify(apiJsonCorrupted);

    // Create invalid schema report task
    const taskInvalidReport = await prisma.analysisTask.create({
      data: {
        targetId: targetA.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskInvalidReport.id,
        schemaVersion: "invalid-version",
        taxonomyVersion: "1.0.0",
        reportData: JSON.stringify({ schemaVersion: "invalid-version" }),
      },
    });

    const getInvalid = await getDeterministicReportForTask(taskInvalidReport.id);
    const apiReqInvalid = new NextRequest(
      `http://localhost:3000/api/tasks/${taskInvalidReport.id}/deterministic-report`
    );
    const apiResInvalid = await GET(apiReqInvalid, {
      params: Promise.resolve({ id: taskInvalidReport.id }),
    });

    const pass9 =
      !getCorrupted.success &&
      getCorrupted.error === "CORRUPTED_REPORT_DATA" &&
      apiResCorrupted.status === 422 &&
      apiJsonCorrupted.error.code === "REPORT_DATA_INVALID" &&
      !apiStrCorrupted.includes(SENTINEL_CORRUPTED) &&
      !getInvalid.success &&
      getInvalid.error === "INVALID_REPORT_DATA" &&
      apiResInvalid.status === 422;

    console.log(`  - 损坏 JSON 受控拒绝 (422, 零泄露): ${!getCorrupted.success && getCorrupted.error === "CORRUPTED_REPORT_DATA" && !apiStrCorrupted.includes(SENTINEL_CORRUPTED) ? "✅" : "❌"}`);
    console.log(`  - 非法契约工件受控拒绝 (422): ${!getInvalid.success && getInvalid.error === "INVALID_REPORT_DATA" ? "✅" : "❌"}`);
    console.log(`  - 异常防御综合判定: ${pass9 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass9) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 10: Zero Network Fetch Calls Assertion
    // -------------------------------------------------------------------------
    console.log("\n[测试 10] 全测试流程零外部网络请求断言...");
    const pass10 = fetchCallCount === 0;
    console.log(`  - 全程 fetch 调用总数: ${fetchCallCount} -> ${pass10 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass10) allPassed = false;

    // =========================================================================
    // --- Phase 5.2.3.1 Additions: Concurrency & Metadata Integrity Tests ---
    // =========================================================================
    console.log("\n[Phase 5.2.3.1 并发幂等与元数据完整性测试]");

    // --- Test 11: Concurrent Persistence for Same Task ---
    console.log("\n[测试 11] 并发写入安全测试...");

    // Case a: Concurrent identical writes on taskC1
    const taskC1 = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const [cRes1, cRes2] = await Promise.all([
      persistDeterministicReportForTask(taskC1.id, analysisResultA),
      persistDeterministicReportForTask(taskC1.id, analysisResultA),
    ]);

    const cCount = await prisma.deterministicReportArtifact.count({
      where: { taskId: taskC1.id },
    });

    const pass11a =
      cRes1.artifactId === cRes2.artifactId &&
      cRes1.taskId === taskC1.id &&
      cCount === 1;

    console.log(`  - [11a] 同 Task 同结果并发写入：两请求均成功且 artifactId 一致 (${cRes1.artifactId}), DB 记录数=${cCount}: ${pass11a ? "✅ 通过" : "❌ 失败"}`);
    if (!pass11a) allPassed = false;

    // Case b: Concurrent conflicting writes on taskC2
    const taskC2 = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const settledResults = await Promise.allSettled([
      persistDeterministicReportForTask(taskC2.id, analysisResultA),
      persistDeterministicReportForTask(taskC2.id, analysisResultB),
    ]);

    const fulfilledCount = settledResults.filter((r) => r.status === "fulfilled").length;
    const rejectedCount = settledResults.filter(
      (r) => r.status === "rejected" && (r as PromiseRejectedResult).reason instanceof ReportConflictError
    ).length;

    const c2Count = await prisma.deterministicReportArtifact.count({
      where: { taskId: taskC2.id },
    });

    const pass11b = fulfilledCount === 1 && rejectedCount === 1 && c2Count === 1;
    console.log(`  - [11b] 同 Task 冲突结果并发写入：恰有一成功一失败 (ReportConflictError), DB 记录数=${c2Count}: ${pass11b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass11b) allPassed = false;

    // --- Test 12: Version Metadata Mismatch Protection ---
    console.log("\n[测试 12] 版本元数据完整性与不一致防御测试...");

    // Case c: schemaVersion mismatch in DB column vs reportData
    const taskSchemaMismatch = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskSchemaMismatch.id,
        schemaVersion: "mismatched-schema-v999",
        taxonomyVersion: expectedReportInputA.taxonomyVersion,
        reportData: JSON.stringify(expectedReportInputA),
      },
    });

    const getMismatchSchema = await getDeterministicReportForTask(taskSchemaMismatch.id);
    const apiReqSchema = new NextRequest(
      `http://localhost:3000/api/tasks/${taskSchemaMismatch.id}/deterministic-report`
    );
    const apiResSchema = await GET(apiReqSchema, {
      params: Promise.resolve({ id: taskSchemaMismatch.id }),
    });
    const apiJsonSchema = await apiResSchema.json();
    const apiStrSchema = JSON.stringify(apiJsonSchema);

    const pass12c =
      !getMismatchSchema.success &&
      getMismatchSchema.error === "VERSION_METADATA_MISMATCH" &&
      apiResSchema.status === 422 &&
      apiJsonSchema.error.code === "REPORT_DATA_INVALID" &&
      !apiStrSchema.includes("Prisma");

    console.log(`  - [12c] schemaVersion 不一致拦截 (服务返回 VERSION_METADATA_MISMATCH, API 422, 零泄露): ${pass12c ? "✅ 通过" : "❌ 失败"}`);
    if (!pass12c) allPassed = false;

    // Case d: taxonomyVersion mismatch in DB column vs reportData
    const taskTaxonomyMismatch = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskTaxonomyMismatch.id,
        schemaVersion: expectedReportInputA.schemaVersion,
        taxonomyVersion: "99.99.99",
        reportData: JSON.stringify(expectedReportInputA),
      },
    });

    const getMismatchTaxonomy = await getDeterministicReportForTask(taskTaxonomyMismatch.id);
    const apiReqTaxonomy = new NextRequest(
      `http://localhost:3000/api/tasks/${taskTaxonomyMismatch.id}/deterministic-report`
    );
    const apiResTaxonomy = await GET(apiReqTaxonomy, {
      params: Promise.resolve({ id: taskTaxonomyMismatch.id }),
    });
    const apiJsonTaxonomy = await apiResTaxonomy.json();
    const apiStrTaxonomy = JSON.stringify(apiJsonTaxonomy);

    const pass12d =
      !getMismatchTaxonomy.success &&
      getMismatchTaxonomy.error === "VERSION_METADATA_MISMATCH" &&
      apiResTaxonomy.status === 422 &&
      apiJsonTaxonomy.error.code === "REPORT_DATA_INVALID" &&
      !apiStrTaxonomy.includes("Prisma");

    console.log(`  - [12d] taxonomyVersion 不一致拦截 (服务返回 VERSION_METADATA_MISMATCH, API 422, 零泄露): ${pass12d ? "✅ 通过" : "❌ 失败"}`);
    if (!pass12d) allPassed = false;

    // =========================================================================
    // --- Phase 5.2.3.2 Additions: Strict Structural Validation & Zero Leakage ---
    // =========================================================================
    console.log("\n[Phase 5.2.3.2 报告工件严格结构校验与未知字段零泄露测试]");

    // --- Scenario a: Extra field on Root object ---
    console.log("\n[测试 13a] 根对象携带未知字段：拒绝并返回 422，零哨兵泄露...");
    const taskExtraRoot = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const SENTINEL_EXTRA_ROOT = "SENTINEL_EXTRA_ROOT_LEAK_CHECK_9901";
    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskExtraRoot.id,
        schemaVersion: expectedReportInputA.schemaVersion,
        taxonomyVersion: expectedReportInputA.taxonomyVersion,
        reportData: JSON.stringify({
          ...expectedReportInputA,
          unknownRootProp: SENTINEL_EXTRA_ROOT,
        }),
      },
    });

    const getExtraRoot = await getDeterministicReportForTask(taskExtraRoot.id);
    const apiReqExtraRoot = new NextRequest(
      `http://localhost:3000/api/tasks/${taskExtraRoot.id}/deterministic-report`
    );
    const apiResExtraRoot = await GET(apiReqExtraRoot, {
      params: Promise.resolve({ id: taskExtraRoot.id }),
    });
    const apiJsonExtraRoot = await apiResExtraRoot.json();
    const apiStrExtraRoot = JSON.stringify(apiJsonExtraRoot);

    const pass13a =
      !getExtraRoot.success &&
      getExtraRoot.error === "INVALID_REPORT_DATA" &&
      apiResExtraRoot.status === 422 &&
      apiJsonExtraRoot.error.code === "REPORT_DATA_INVALID" &&
      !apiStrExtraRoot.includes(SENTINEL_EXTRA_ROOT) &&
      !apiStrExtraRoot.includes("Prisma") &&
      !apiStrExtraRoot.includes("SnapshotField");

    console.log(`  - [13a] 根对象未知字段拦截 (422 / INVALID_REPORT_DATA, 零泄露): ${pass13a ? "✅ 通过" : "❌ 失败"}`);
    if (!pass13a) allPassed = false;

    // --- Scenario b: Extra field inside Observation ---
    console.log("\n[测试 13b] Observation 内部携带未知字段：拒绝并返回 422，零哨兵泄露...");
    const taskExtraObs = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const SENTINEL_EXTRA_OBS = "SENTINEL_EXTRA_OBS_LEAK_CHECK_9902";
    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskExtraObs.id,
        schemaVersion: expectedReportInputA.schemaVersion,
        taxonomyVersion: expectedReportInputA.taxonomyVersion,
        reportData: JSON.stringify({
          ...expectedReportInputA,
          observations: [
            {
              ...expectedReportInputA.observations[0],
              unknownObsProp: SENTINEL_EXTRA_OBS,
            },
            ...expectedReportInputA.observations.slice(1),
          ],
        }),
      },
    });

    const getExtraObs = await getDeterministicReportForTask(taskExtraObs.id);
    const apiReqExtraObs = new NextRequest(
      `http://localhost:3000/api/tasks/${taskExtraObs.id}/deterministic-report`
    );
    const apiResExtraObs = await GET(apiReqExtraObs, {
      params: Promise.resolve({ id: taskExtraObs.id }),
    });
    const apiJsonExtraObs = await apiResExtraObs.json();
    const apiStrExtraObs = JSON.stringify(apiJsonExtraObs);

    const pass13b =
      !getExtraObs.success &&
      getExtraObs.error === "INVALID_REPORT_DATA" &&
      apiResExtraObs.status === 422 &&
      apiJsonExtraObs.error.code === "REPORT_DATA_INVALID" &&
      !apiStrExtraObs.includes(SENTINEL_EXTRA_OBS) &&
      !apiStrExtraObs.includes("Prisma") &&
      !apiStrExtraObs.includes("SnapshotField");

    console.log(`  - [13b] Observation 未知字段拦截 (422 / INVALID_REPORT_DATA, 零泄露): ${pass13b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass13b) allPassed = false;

    // --- Scenario c: Extra field inside Evidence ---
    console.log("\n[测试 13c] Evidence 内部携带未知字段：拒绝并返回 422，零哨兵泄露...");
    const taskExtraEv = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const SENTINEL_EXTRA_EV = "SENTINEL_EXTRA_EV_LEAK_CHECK_9903";
    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskExtraEv.id,
        schemaVersion: expectedReportInputA.schemaVersion,
        taxonomyVersion: expectedReportInputA.taxonomyVersion,
        reportData: JSON.stringify({
          ...expectedReportInputA,
          evidence: [
            {
              ...expectedReportInputA.evidence[0],
              unknownEvProp: SENTINEL_EXTRA_EV,
            },
            ...expectedReportInputA.evidence.slice(1),
          ],
        }),
      },
    });

    const getExtraEv = await getDeterministicReportForTask(taskExtraEv.id);
    const apiReqExtraEv = new NextRequest(
      `http://localhost:3000/api/tasks/${taskExtraEv.id}/deterministic-report`
    );
    const apiResExtraEv = await GET(apiReqExtraEv, {
      params: Promise.resolve({ id: taskExtraEv.id }),
    });
    const apiJsonExtraEv = await apiResExtraEv.json();
    const apiStrExtraEv = JSON.stringify(apiJsonExtraEv);

    const pass13c =
      !getExtraEv.success &&
      getExtraEv.error === "INVALID_REPORT_DATA" &&
      apiResExtraEv.status === 422 &&
      apiJsonExtraEv.error.code === "REPORT_DATA_INVALID" &&
      !apiStrExtraEv.includes(SENTINEL_EXTRA_EV) &&
      !apiStrExtraEv.includes("Prisma") &&
      !apiStrExtraEv.includes("SnapshotField");

    console.log(`  - [13c] Evidence 未知字段拦截 (422 / INVALID_REPORT_DATA, 零泄露): ${pass13c ? "✅ 通过" : "❌ 失败"}`);
    if (!pass13c) allPassed = false;

    // --- Scenario d: Extra field inside DiagnosticsSummary ---
    console.log("\n[测试 13d] DiagnosticsSummary 内部携带未知字段：拒绝并返回 422，零哨兵泄露...");
    const taskExtraDs = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "STATISTICAL_ANALYSIS",
        progress: 80,
      },
    });

    const SENTINEL_EXTRA_DS = "SENTINEL_EXTRA_DS_LEAK_CHECK_9904";
    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskExtraDs.id,
        schemaVersion: expectedReportInputA.schemaVersion,
        taxonomyVersion: expectedReportInputA.taxonomyVersion,
        reportData: JSON.stringify({
          ...expectedReportInputA,
          diagnosticsSummary: {
            ...expectedReportInputA.diagnosticsSummary,
            unknownDsProp: SENTINEL_EXTRA_DS,
          },
        }),
      },
    });

    const getExtraDs = await getDeterministicReportForTask(taskExtraDs.id);
    const apiReqExtraDs = new NextRequest(
      `http://localhost:3000/api/tasks/${taskExtraDs.id}/deterministic-report`
    );
    const apiResExtraDs = await GET(apiReqExtraDs, {
      params: Promise.resolve({ id: taskExtraDs.id }),
    });
    const apiJsonExtraDs = await apiResExtraDs.json();
    const apiStrExtraDs = JSON.stringify(apiJsonExtraDs);

    const pass13d =
      !getExtraDs.success &&
      getExtraDs.error === "INVALID_REPORT_DATA" &&
      apiResExtraDs.status === 422 &&
      apiJsonExtraDs.error.code === "REPORT_DATA_INVALID" &&
      !apiStrExtraDs.includes(SENTINEL_EXTRA_DS) &&
      !apiStrExtraDs.includes("Prisma") &&
      !apiStrExtraDs.includes("SnapshotField");

    console.log(`  - [13d] DiagnosticsSummary 未知字段拦截 (422 / INVALID_REPORT_DATA, 零泄露): ${pass13d ? "✅ 通过" : "❌ 失败"}`);
    if (!pass13d) allPassed = false;

    console.log("\n=================================================");
    if (allPassed) {
      console.log("🎉 Phase 5.2.3.1 & 5.2.3.2 报告工件存储与严格校验测试全部通过！");
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

runReportStorageVerification().catch((err) => {
  console.error("测试脚本异常:", err);
  process.exit(1);
});
