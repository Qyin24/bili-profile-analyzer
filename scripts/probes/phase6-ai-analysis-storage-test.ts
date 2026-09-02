/**
 * BiliProfile Analyzer — Phase 6.2 AI Analysis Storage & API Integration Test Suite
 *
 * Verifies:
 * 1. Valid task + deterministic report -> persistDeterministicAiAnalysisForTask creates AI artifact; reading returns semantically equal result to generateAiAnalysis(report, "MOCK").
 * 2. Idempotency: Repeating persist for same task with same report returns existing artifact safely without mutation (DB has 1 row).
 * 3. Non-existent task persist is rejected with zero writes.
 * 4. Terminal task AI artifact handling: absent -> backfill allowed; identical -> idempotent return; different -> conflict rejected; missing source report -> rejected.
 * 5. Task without DeterministicReportArtifact fails to persist AI artifact with zero writes.
 * 6. Task without AI artifact returns 404 + AI_ANALYSIS_NOT_FOUND on GET API.
 * 7. Read-only API returns safe AI analysis and JSON string has zero leaks (sentinels, snapshot values, self-profile, credentials).
 * 8. Two different tasks' deterministic reports and AI artifacts are strictly isolated.
 * 9. Corrupted JSON, invalid AI data, dangling evidence, provider/schema/taxonomy/reportSchemaVersion metadata mismatches:
 *    - Service rejected with controlled error;
 *    - API returns 422;
 *    - Zero sentinel, zero analysisData, zero Prisma, zero stack leaks.
 * 10. Database read exception controlled mapping (INTERNAL_SERVER_ERROR):
 *    - Temporarily mock findUnique to throw error with unique sentinel;
 *    - Service returns INTERNAL_SERVER_ERROR;
 *    - API returns 500 + INTERNAL_SERVER_ERROR;
 *    - Zero sentinel, zero Prisma, zero stack, zero raw error leaks.
 * 11. Concurrency: Same task, identical result concurrent persistence returns same artifactId (both succeed, DB has 1 row).
 * 12. Global fetch call count is 0 throughout entire test suite.
 * 13. Isolated test fixtures safely cleaned up in finally block.
 *
 * Safety:
 * - Pure local SQLite operations.
 * - Zero external network calls (fetch intercepted).
 */

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
} from "../../src/lib/processing/pipeline";
import { persistDeterministicReportForTask } from "../../src/lib/deterministic-report-service";
import {
  persistDeterministicAiAnalysisForTask,
  getAiAnalysisForTask,
  generateAiAnalysis,
  TaskNotFoundError,
  SourceReportNotFoundError,
  AiAnalysisConflictError,
  AI_ANALYSIS_SCHEMA_VERSION,
} from "../../src/lib/ai";
import { GET } from "../../src/app/api/tasks/[id]/ai-analysis/route";
import { PublicSourceRecord } from "../../src/types/processing";

const TEST_TARGET_UID_A = "test_ai_storage_target_99901";
const TEST_TARGET_UID_B = "test_ai_storage_target_99902";
const TEST_TARGET_UID_C = "test_ai_storage_target_99903";

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

async function runAiStorageVerification() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 6.2 AI 分析工件存储与只读获取测试");
  console.log("=================================================\n");

  let allPassed = true;

  // Intercept global fetch to strictly ensure zero network activity
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: unknown[]) => {
    fetchCallCount++;
    throw new Error("AI storage test violation: network fetch attempted!");
  };

  try {
    await cleanupFixtures();

    // -------------------------------------------------------------------------
    // Setup Test Targets & Tasks
    // -------------------------------------------------------------------------
    const targetA = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_A,
        displayName: "测试 AI 用户 A",
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

    const taskA2_terminal = await prisma.analysisTask.create({
      data: {
        targetId: targetA.id,
        taskStatus: "COMPLETED",
        pipelineStage: "REPORT",
        progress: 100,
        completedAt: new Date(),
      },
    });

    const taskA4_terminal_diff = await prisma.analysisTask.create({
      data: {
        targetId: targetA.id,
        taskStatus: "COMPLETED",
        pipelineStage: "REPORT",
        progress: 100,
        completedAt: new Date(),
      },
    });

    const taskA5_terminal_noreport = await prisma.analysisTask.create({
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
        displayName: "测试 AI 用户 B",
      },
    });

    const taskB1 = await prisma.analysisTask.create({
      data: {
        targetId: targetB.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 85,
      },
    });

    // -------------------------------------------------------------------------
    // Setup Deterministic Reports for Task A1 and Task B1
    // -------------------------------------------------------------------------
    const SENTINEL_RAW_TEXT_A = "SENTINEL_RAW_BODY_TASK_A_AI_CONFIDENTIAL";
    const sampleRecordsA: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_a_1",
        sourceType: "CONTENT",
        title: "黑神话悟空攻略",
        description: `包含敏感正文：${SENTINEL_RAW_TEXT_A}`,
        tags: ["游戏"],
      },
      {
        sourceRecordId: "rec_a_2",
        sourceType: "CONTENT",
        title: "塞尔达传说旷野之息探索",
        tags: ["游戏"],
      },
    ];
    const analysisA = runDeterministicAnalysis(sampleRecordsA);
    const reportInputA = buildDeterministicReportInput(analysisA);
    await persistDeterministicReportForTask(taskA1.id, analysisA);

    const sampleRecordsB: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_b_1",
        sourceType: "CONTENT",
        title: "大语言模型理论与实战",
        tags: ["科技", "AI"],
      },
      {
        sourceRecordId: "rec_b_2",
        sourceType: "CONTENT",
        title: "新番动画导视",
        tags: ["动漫"],
      },
    ];
    const analysisB = runDeterministicAnalysis(sampleRecordsB);
    const reportInputB = buildDeterministicReportInput(analysisB);
    await persistDeterministicReportForTask(taskB1.id, analysisB);

    // Also persist report for taskA2 (terminal task, report was created earlier)
    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskA2_terminal.id,
        schemaVersion: reportInputA.schemaVersion,
        taxonomyVersion: reportInputA.taxonomyVersion,
        reportData: JSON.stringify(reportInputA),
      },
    });

    // Report for taskA4 (terminal + divergent pre-existing AI artifact -> conflict test)
    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskA4_terminal_diff.id,
        schemaVersion: reportInputA.schemaVersion,
        taxonomyVersion: reportInputA.taxonomyVersion,
        reportData: JSON.stringify(reportInputA),
      },
    });

    // Pre-existing DIFFERENT AI artifact for taskA4 (to trigger conflict on re-persist)
    await prisma.aiAnalysisArtifact.create({
      data: {
        taskId: taskA4_terminal_diff.id,
        provider: "MOCK",
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        reportSchemaVersion: reportInputA.schemaVersion,
        taxonomyVersion: reportInputA.taxonomyVersion,
        analysisData: JSON.stringify({
          provider: "MOCK",
          summary: "PRE-EXISTING DIVERGENT ARTIFACT",
          findings: [],
          limitations: [],
        }),
      },
    });

    // -------------------------------------------------------------------------
    // Test 1: Persist and Read AI Analysis Artifact
    // -------------------------------------------------------------------------
    console.log("[测试 1] 写入 MOCK AI 分析结果并读取，验证工件语义一致性...");
    const persistedA = await persistDeterministicAiAnalysisForTask(taskA1.id);
    const readA = await getAiAnalysisForTask(taskA1.id);

    const directExpectedA = await generateAiAnalysis(reportInputA, "MOCK");

    const pass1 =
      readA.success &&
      persistedA.artifactId === readA.data.artifactId &&
      persistedA.provider === "MOCK" &&
      persistedA.schemaVersion === AI_ANALYSIS_SCHEMA_VERSION &&
      persistedA.reportSchemaVersion === reportInputA.schemaVersion &&
      persistedA.taxonomyVersion === reportInputA.taxonomyVersion &&
      JSON.stringify(readA.data.analysis) === JSON.stringify(directExpectedA);

    console.log(`  - 写入与读取 AI 报告深度相等: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Idempotent Repeat Persist
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 同一 Task 重复写入：安全幂等且返回同一 artifactId...");
    const persistedRepeat = await persistDeterministicAiAnalysisForTask(taskA1.id);
    const rowCountA = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskA1.id },
    });

    const pass2 =
      persistedRepeat.artifactId === persistedA.artifactId &&
      rowCountA === 1;

    console.log(`  - 幂等写入返回相同 artifactId: ${pass2 ? "✅ 通过" : "❌ 失败"} (count=${rowCountA})`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Non-existent Task Persist Rejected
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 不存在的 Task 写入：明确拒绝且零写入...");
    let nonExistentThrown = false;
    try {
      await persistDeterministicAiAnalysisForTask("non_existent_task_id_99999");
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        nonExistentThrown = true;
      }
    }

    const nonExistentCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: "non_existent_task_id_99999" },
    });

    const pass3 = nonExistentThrown && nonExistentCount === 0;
    console.log(`  - 不存在 Task 拦截 (抛出 TaskNotFoundError, 零写入): ${pass3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: Terminal Task AI Artifact Handling (backfill / idempotency / conflict / missing-source)
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 终态 Task AI 工件处理：缺则补生成、相同则幂等、不同则冲突拒绝、缺源报告则拒绝...");

    // 4a. Terminal task with report but no AI artifact -> backfill allowed
    const backfilled = await persistDeterministicAiAnalysisForTask(taskA2_terminal.id);
    const backfillCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskA2_terminal.id },
    });
    const pass4a = !!backfilled.artifactId && backfillCount === 1;
    console.log(`  - [4a] 终态缺工件补生成 (create, count=1): ${pass4a ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4a) allPassed = false;

    // 4b. Terminal task with identical existing artifact -> idempotent return
    const idem = await persistDeterministicAiAnalysisForTask(taskA2_terminal.id);
    const idemCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskA2_terminal.id },
    });
    const pass4b =
      idem.artifactId === backfilled.artifactId &&
      idemCount === 1;
    console.log(`  - [4b] 终态相同工件幂等返回 (同 artifactId, count=1): ${pass4b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4b) allPassed = false;

    // 4c. Terminal task with a different pre-existing artifact -> conflict rejected, no overwrite
    let conflictThrown = false;
    try {
      await persistDeterministicAiAnalysisForTask(taskA4_terminal_diff.id);
    } catch (err) {
      if (err instanceof AiAnalysisConflictError) {
        conflictThrown = true;
      }
    }
    const conflictCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskA4_terminal_diff.id },
    });
    const conflictArtifact = await prisma.aiAnalysisArtifact.findUnique({
      where: { taskId: taskA4_terminal_diff.id },
      select: { analysisData: true },
    });
    const pass4c =
      conflictThrown &&
      conflictCount === 1 &&
      !!conflictArtifact &&
      conflictArtifact.analysisData.includes("PRE-EXISTING DIVERGENT ARTIFACT");
    console.log(`  - [4c] 终态不同工件冲突拒绝 (抛出 AiAnalysisConflictError, 零覆盖): ${pass4c ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4c) allPassed = false;

    // 4d. Terminal task with no source report -> rejected with SourceReportNotFoundError
    let noSourceThrown = false;
    try {
      await persistDeterministicAiAnalysisForTask(taskA5_terminal_noreport.id);
    } catch (err) {
      if (err instanceof SourceReportNotFoundError) {
        noSourceThrown = true;
      }
    }
    const noSourceCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskA5_terminal_noreport.id },
    });
    const pass4d = noSourceThrown && noSourceCount === 0;
    console.log(`  - [4d] 终态缺源报告拒绝 (抛出 SourceReportNotFoundError, 零写入): ${pass4d ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4d) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Task without DeterministicReportArtifact Persist Rejected
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 缺少确定性报告工件的任务写入：明确拒绝且零写入...");
    let noReportThrown = false;
    try {
      await persistDeterministicAiAnalysisForTask(taskA3_no_report.id);
    } catch (err) {
      if (err instanceof SourceReportNotFoundError) {
        noReportThrown = true;
      }
    }

    const noReportAiCount = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskA3_no_report.id },
    });

    const pass5 = noReportThrown && noReportAiCount === 0;
    console.log(`  - 缺少报告工件拦截 (抛出 SourceReportNotFoundError, 零写入): ${pass5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Task without AI Artifact Returns 404 + AI_ANALYSIS_NOT_FOUND
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] 未生成 AI 工件的 Task 读取返回 AI_ANALYSIS_NOT_FOUND (404)...");
    const readNoAi = await getAiAnalysisForTask(taskA3_no_report.id);

    const reqNoAi = new NextRequest(`http://localhost:3000/api/tasks/${taskA3_no_report.id}/ai-analysis`);
    const respNoAi = await GET(reqNoAi, { params: Promise.resolve({ id: taskA3_no_report.id }) });
    const jsonNoAi = await respNoAi.json();

    const pass6 =
      !readNoAi.success &&
      readNoAi.error === "AI_ANALYSIS_NOT_FOUND" &&
      respNoAi.status === 404 &&
      jsonNoAi.error.code === "AI_ANALYSIS_NOT_FOUND";

    console.log(`  - 无工件读取状态判定 (404 + AI_ANALYSIS_NOT_FOUND): ${pass6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Read-only API GET /api/tasks/[id]/ai-analysis & Zero Leakage
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] 只读 API GET /api/tasks/[id]/ai-analysis 与零泄露验证...");
    const reqApi = new NextRequest(`http://localhost:3000/api/tasks/${taskA1.id}/ai-analysis`);
    const respApi = await GET(reqApi, { params: Promise.resolve({ id: taskA1.id }) });
    const jsonApi = await respApi.json();
    const serializedApiResponse = JSON.stringify(jsonApi);

    const pass7 =
      respApi.status === 200 &&
      jsonApi.taskId === taskA1.id &&
      jsonApi.provider === "MOCK" &&
      jsonApi.analysis.findings.length > 0 &&
      !serializedApiResponse.includes(SENTINEL_RAW_TEXT_A) &&
      !serializedApiResponse.includes("SnapshotField") &&
      !serializedApiResponse.includes("currentGoals") &&
      !serializedApiResponse.includes("learningDirections") &&
      !serializedApiResponse.includes("customPrompt") &&
      !serializedApiResponse.includes("SESSDATA") &&
      !serializedApiResponse.includes("Cookie") &&
      !serializedApiResponse.includes("bili_jct");

    console.log(`  - API 状态码 200: ${respApi.status === 200 ? "✅" : "❌"}`);
    console.log(`  - 哨兵与敏感自述/凭据零泄露: ${pass7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass7) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 8: Two Tasks Isolation
    // -------------------------------------------------------------------------
    console.log("\n[测试 8] 两个不同 Task (Task A1 与 Task B1) 的 AI 工件严格隔离...");
    const persistedB = await persistDeterministicAiAnalysisForTask(taskB1.id);
    const readB = await getAiAnalysisForTask(taskB1.id);

    const pass8 =
      persistedA.artifactId !== persistedB.artifactId &&
      readB.success &&
      readA.success &&
      JSON.stringify(readA.data.analysis) !== JSON.stringify(readB.data.analysis);

    console.log(`  - Task A (游戏偏好) 与 Task B (科技/动漫) AI 解读独立隔离: ${pass8 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 9: Corrupted Data, Invalid Contracts & Metadata Mismatch Defense
    // -------------------------------------------------------------------------
    console.log("\n[测试 9] 手动构造损坏数据、非法工件与元数据篡改不一致：受控拒绝且零泄露...");

    // Setup Target C and Task C1 for corruption tests
    const targetC = await prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: TEST_TARGET_UID_C,
        displayName: "测试 AI 用户 C (损坏测试)",
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

    // Create valid deterministic report for taskC1
    await prisma.deterministicReportArtifact.create({
      data: {
        taskId: taskC1.id,
        schemaVersion: reportInputA.schemaVersion,
        taxonomyVersion: reportInputA.taxonomyVersion,
        reportData: JSON.stringify(reportInputA),
      },
    });

    // 9a. Corrupted JSON in ai_analysis_artifacts
    const SENTINEL_CORRUPTED = "SENTINEL_CORRUPTED_AI_DATA_XYZ_9999";
    await prisma.aiAnalysisArtifact.create({
      data: {
        taskId: taskC1.id,
        provider: "MOCK",
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        reportSchemaVersion: reportInputA.schemaVersion,
        taxonomyVersion: reportInputA.taxonomyVersion,
        analysisData: `{"corrupted": true, "raw": "${SENTINEL_CORRUPTED}"`, // invalid JSON
      },
    });

    const readCorrupted = await getAiAnalysisForTask(taskC1.id);
    const reqCorrupted = new NextRequest(`http://localhost:3000/api/tasks/${taskC1.id}/ai-analysis`);
    const respCorrupted = await GET(reqCorrupted, { params: Promise.resolve({ id: taskC1.id }) });
    const jsonCorrupted = await respCorrupted.json();
    const strCorrupted = JSON.stringify(jsonCorrupted);

    const pass9a =
      !readCorrupted.success &&
      readCorrupted.error === "CORRUPTED_AI_ANALYSIS_DATA" &&
      respCorrupted.status === 422 &&
      jsonCorrupted.error.code === "AI_ANALYSIS_DATA_INVALID" &&
      !strCorrupted.includes(SENTINEL_CORRUPTED) &&
      !strCorrupted.includes("analysisData") &&
      !strCorrupted.includes("Prisma") &&
      !strCorrupted.includes("stack");

    console.log(`  - [9a] 损坏 JSON 受控拒绝 (422 / AI_ANALYSIS_DATA_INVALID, 零泄露): ${pass9a ? "✅" : "❌"}`);
    if (!pass9a) allPassed = false;

    // 9b. Invalid AI contract data (dangling evidenceId)
    const SENTINEL_DANGLING_EV = "SENTINEL_DANGLING_EVID_IN_DB_9995";
    const badAiResult = {
      ...directExpectedA,
      findings: [
        {
          id: "finding_hallucinated",
          category: "TOPIC_INTERPRETATION",
          statement: "虚假推断",
          evidenceIds: [SENTINEL_DANGLING_EV],
        },
      ],
    };

    await prisma.aiAnalysisArtifact.update({
      where: { taskId: taskC1.id },
      data: {
        analysisData: JSON.stringify(badAiResult),
      },
    });

    const readDangling = await getAiAnalysisForTask(taskC1.id);
    const reqDangling = new NextRequest(`http://localhost:3000/api/tasks/${taskC1.id}/ai-analysis`);
    const respDangling = await GET(reqDangling, { params: Promise.resolve({ id: taskC1.id }) });
    const jsonDangling = await respDangling.json();
    const strDangling = JSON.stringify(jsonDangling);

    const pass9b =
      !readDangling.success &&
      readDangling.error === "INVALID_AI_ANALYSIS_DATA" &&
      respDangling.status === 422 &&
      jsonDangling.error.code === "AI_ANALYSIS_DATA_INVALID" &&
      !strDangling.includes(SENTINEL_DANGLING_EV) &&
      !strDangling.includes("analysisData") &&
      !strDangling.includes("Prisma") &&
      !strDangling.includes("stack");

    console.log(`  - [9b] 悬空证据引用工件受控拒绝 (422 / INVALID_AI_ANALYSIS_DATA, 零泄露): ${pass9b ? "✅" : "❌"}`);
    if (!pass9b) allPassed = false;

    // 9c. Metadata Mismatch: DB schemaVersion mismatch with unique sentinel
    const SENTINEL_TAMPERED_SCHEMA = "SENTINEL_TAMPERED_SCHEMA_9993";
    await prisma.aiAnalysisArtifact.update({
      where: { taskId: taskC1.id },
      data: {
        analysisData: JSON.stringify(directExpectedA),
        schemaVersion: SENTINEL_TAMPERED_SCHEMA,
      },
    });

    const readSchemaMismatch = await getAiAnalysisForTask(taskC1.id);
    const reqSchemaMismatch = new NextRequest(`http://localhost:3000/api/tasks/${taskC1.id}/ai-analysis`);
    const respSchemaMismatch = await GET(reqSchemaMismatch, { params: Promise.resolve({ id: taskC1.id }) });
    const jsonSchemaMismatch = await respSchemaMismatch.json();
    const strSchemaMismatch = JSON.stringify(jsonSchemaMismatch);

    const pass9c =
      !readSchemaMismatch.success &&
      readSchemaMismatch.error === "VERSION_METADATA_MISMATCH" &&
      respSchemaMismatch.status === 422 &&
      jsonSchemaMismatch.error.code === "VERSION_METADATA_MISMATCH" &&
      !strSchemaMismatch.includes(SENTINEL_TAMPERED_SCHEMA) &&
      !strSchemaMismatch.includes("analysisData") &&
      !strSchemaMismatch.includes("Prisma") &&
      !strSchemaMismatch.includes("stack");

    console.log(`  - [9c] schemaVersion 不一致拦截 (服务返回 VERSION_METADATA_MISMATCH, API 422, 零哨兵泄露): ${pass9c ? "✅" : "❌"}`);
    if (!pass9c) allPassed = false;

    // 9d. Metadata Mismatch: DB reportSchemaVersion mismatch with unique sentinel
    const SENTINEL_TAMPERED_REPORT_SCHEMA = "SENTINEL_TAMPERED_REPORT_SCHEMA_9994";
    await prisma.aiAnalysisArtifact.update({
      where: { taskId: taskC1.id },
      data: {
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        reportSchemaVersion: SENTINEL_TAMPERED_REPORT_SCHEMA,
      },
    });

    const readReportSchemaMismatch = await getAiAnalysisForTask(taskC1.id);
    const reqReportSchemaMismatch = new NextRequest(`http://localhost:3000/api/tasks/${taskC1.id}/ai-analysis`);
    const respReportSchemaMismatch = await GET(reqReportSchemaMismatch, { params: Promise.resolve({ id: taskC1.id }) });
    const jsonReportSchemaMismatch = await respReportSchemaMismatch.json();
    const strReportSchemaMismatch = JSON.stringify(jsonReportSchemaMismatch);

    const pass9d =
      !readReportSchemaMismatch.success &&
      readReportSchemaMismatch.error === "VERSION_METADATA_MISMATCH" &&
      respReportSchemaMismatch.status === 422 &&
      jsonReportSchemaMismatch.error.code === "VERSION_METADATA_MISMATCH" &&
      !strReportSchemaMismatch.includes(SENTINEL_TAMPERED_REPORT_SCHEMA) &&
      !strReportSchemaMismatch.includes("analysisData") &&
      !strReportSchemaMismatch.includes("Prisma") &&
      !strReportSchemaMismatch.includes("stack");

    console.log(`  - [9d] reportSchemaVersion 不一致拦截 (服务返回 VERSION_METADATA_MISMATCH, API 422, 零哨兵泄露): ${pass9d ? "✅" : "❌"}`);
    if (!pass9d) allPassed = false;

    // 9e. Metadata Mismatch: DB provider mismatch with unique sentinel
    const SENTINEL_TAMPERED_PROVIDER = "SENTINEL_TAMPERED_PROVIDER_9991";
    await prisma.aiAnalysisArtifact.update({
      where: { taskId: taskC1.id },
      data: {
        provider: SENTINEL_TAMPERED_PROVIDER,
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        reportSchemaVersion: reportInputA.schemaVersion,
        taxonomyVersion: reportInputA.taxonomyVersion,
        analysisData: JSON.stringify(directExpectedA), // valid MOCK analysisData
      },
    });

    const readProviderMismatch = await getAiAnalysisForTask(taskC1.id);
    const reqProviderMismatch = new NextRequest(`http://localhost:3000/api/tasks/${taskC1.id}/ai-analysis`);
    const respProviderMismatch = await GET(reqProviderMismatch, { params: Promise.resolve({ id: taskC1.id }) });
    const jsonProviderMismatch = await respProviderMismatch.json();
    const strProviderMismatch = JSON.stringify(jsonProviderMismatch);

    const pass9e =
      !readProviderMismatch.success &&
      readProviderMismatch.error === "VERSION_METADATA_MISMATCH" &&
      respProviderMismatch.status === 422 &&
      jsonProviderMismatch.error.code === "VERSION_METADATA_MISMATCH" &&
      !strProviderMismatch.includes(SENTINEL_TAMPERED_PROVIDER) &&
      !strProviderMismatch.includes("analysisData") &&
      !strProviderMismatch.includes("Prisma") &&
      !strProviderMismatch.includes("stack");

    console.log(`  - [9e] provider 元数据错配拦截 (服务返回 VERSION_METADATA_MISMATCH, API 422, 零哨兵泄露): ${pass9e ? "✅" : "❌"}`);
    if (!pass9e) allPassed = false;

    // 9f. Metadata Mismatch: DB taxonomyVersion mismatch with unique sentinel
    const SENTINEL_TAMPERED_TAXONOMY = "SENTINEL_TAMPERED_TAXONOMY_9992";
    await prisma.aiAnalysisArtifact.update({
      where: { taskId: taskC1.id },
      data: {
        provider: "MOCK",
        schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
        reportSchemaVersion: reportInputA.schemaVersion,
        taxonomyVersion: SENTINEL_TAMPERED_TAXONOMY,
        analysisData: JSON.stringify(directExpectedA),
      },
    });

    const readTaxonomyMismatch = await getAiAnalysisForTask(taskC1.id);
    const reqTaxonomyMismatch = new NextRequest(`http://localhost:3000/api/tasks/${taskC1.id}/ai-analysis`);
    const respTaxonomyMismatch = await GET(reqTaxonomyMismatch, { params: Promise.resolve({ id: taskC1.id }) });
    const jsonTaxonomyMismatch = await respTaxonomyMismatch.json();
    const strTaxonomyMismatch = JSON.stringify(jsonTaxonomyMismatch);

    const pass9f =
      !readTaxonomyMismatch.success &&
      readTaxonomyMismatch.error === "VERSION_METADATA_MISMATCH" &&
      respTaxonomyMismatch.status === 422 &&
      jsonTaxonomyMismatch.error.code === "VERSION_METADATA_MISMATCH" &&
      !strTaxonomyMismatch.includes(SENTINEL_TAMPERED_TAXONOMY) &&
      !strTaxonomyMismatch.includes("analysisData") &&
      !strTaxonomyMismatch.includes("Prisma") &&
      !strTaxonomyMismatch.includes("stack");

    console.log(`  - [9f] taxonomyVersion 元数据错配拦截 (服务返回 VERSION_METADATA_MISMATCH, API 422, 零哨兵泄露): ${pass9f ? "✅" : "❌"}`);
    if (!pass9f) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 10: DB Read Exception Controlled Mapping (INTERNAL_SERVER_ERROR / 500)
    // -------------------------------------------------------------------------
    console.log("\n[测试 10] 数据库读取异常受控映射 (500 / INTERNAL_SERVER_ERROR)...");
    const SENTINEL_DB_READ_ERROR = "SENTINEL_DB_READ_FAILURE_ERR_9998";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalFindUnique = (prisma.aiAnalysisArtifact as any).findUnique;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.aiAnalysisArtifact as any).findUnique = async () => {
        throw new Error(`Database connection failed: ${SENTINEL_DB_READ_ERROR}`);
      };

      const readDbError = await getAiAnalysisForTask(taskA1.id);
      const reqDbError = new NextRequest(`http://localhost:3000/api/tasks/${taskA1.id}/ai-analysis`);
      const respDbError = await GET(reqDbError, { params: Promise.resolve({ id: taskA1.id }) });
      const jsonDbError = await respDbError.json();
      const strDbError = JSON.stringify(jsonDbError);

      const pass10 =
        !readDbError.success &&
        readDbError.error === "INTERNAL_SERVER_ERROR" &&
        readDbError.message === "获取 AI 分析工件失败" &&
        respDbError.status === 500 &&
        jsonDbError.error.code === "INTERNAL_SERVER_ERROR" &&
        jsonDbError.error.message === "获取 AI 分析工件失败" &&
        !strDbError.includes(SENTINEL_DB_READ_ERROR) &&
        !strDbError.includes("Prisma") &&
        !strDbError.includes("stack") &&
        !strDbError.includes("analysisData") &&
        !strDbError.includes("Database connection failed");

      console.log(`  - 服务层与 API 返回 500 / INTERNAL_SERVER_ERROR, 零哨兵与内部异常泄露: ${pass10 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass10) allPassed = false;
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.aiAnalysisArtifact as any).findUnique = originalFindUnique;
    }

    // -------------------------------------------------------------------------
    // Test 11: Concurrency Race Handling
    // -------------------------------------------------------------------------
    console.log("\n[测试 11] 并发写入安全测试...");

    // Setup Task C2 with report for concurrency test
    const taskC2 = await prisma.analysisTask.create({
      data: {
        targetId: targetC.id,
        taskStatus: "RUNNING",
        pipelineStage: "AI_ANALYSIS",
        progress: 80,
      },
    });
    await persistDeterministicReportForTask(taskC2.id, analysisA);

    // Concurrently invoke persistDeterministicAiAnalysisForTask on taskC2
    const [resConc1, resConc2] = await Promise.all([
      persistDeterministicAiAnalysisForTask(taskC2.id),
      persistDeterministicAiAnalysisForTask(taskC2.id),
    ]);

    const countConc = await prisma.aiAnalysisArtifact.count({
      where: { taskId: taskC2.id },
    });

    const pass11 =
      resConc1.artifactId === resConc2.artifactId &&
      resConc1.provider === "MOCK" &&
      countConc === 1;

    console.log(`  - 同 Task 同结果并发写入：两请求均成功且 artifactId 一致 (${resConc1.artifactId}), DB 记录数=1: ${pass11 ? "✅ 通过" : "❌ 失败"}`);
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
      console.log("🎉 Phase 6.2 AI 分析工件存储与只读获取测试全部通过！");
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

runAiStorageVerification().catch((err) => {
  console.error("AI 分析工件存储测试脚本异常:", err);
  process.exit(1);
});
