/**
 * BiliProfile Analyzer — Phase 5.0.3 Isolated Self-Profile & Minimal Response Read Verification Suite
 * 
 * Verifies:
 * a. Profile A purge `currentGoals` only deletes Profile A's corresponding SnapshotFields.
 * b. Profile B's identical field and task snapshots remain 100% untouched.
 * c. Profile A's empty snapshot (0 fields remaining) is physically deleted, while snapshot with other fields is preserved.
 * d. Profile A's affected tasks are marked needsRegeneration=true, while Profile B's tasks remain false.
 * e. Revoking field prevents it from being copied into subsequent task snapshots.
 * f. Unconfirmed consent aborts transaction: 0 targets, 0 tasks, 0 snapshots created.
 * g. [Phase 5.0.3] Minimal Read & Zero-Leakage:
 *    - All Task API summary query projections strictly select ONLY `SnapshotField.id` for count, NEVER `SnapshotField.value` or raw fields.
 *    - `POST /api/tasks`, `GET /api/tasks`, `GET /api/tasks/[id]`, `PATCH /api/tasks/[id]` serialization JSONs never contain sentinel secret.
 *    - Database SQLite raw records preserve full original snapshot values intact.
 * h. Zero-pollution: Tests only operate on explicit test fixture IDs and clean them up safely.
 * 
 * Safety:
 * - Purely local SQLite operations.
 * - Zero external network calls.
 * - Never reads or touches existing user profile data.
 * - Never prints raw sentinel strings to logs or stdout.
 */

import { PrismaClient } from "@prisma/client";
import {
  updateSelfProfile,
  revokeSelfProfile,
  purgeSelfProfile,
  createTaskWithSnapshot,
  serializeTaskSummary,
  TASK_SUMMARY_PRISMA_INCLUDE,
  SelfProvidedConsentRequiredError,
} from "../../src/lib/self-profile-service";

const prisma = new PrismaClient();

const TEST_PROFILE_A_ID = "test_iso_profile_a_99901";
const TEST_PROFILE_B_ID = "test_iso_profile_b_99902";
const TEST_TARGET_A_UID = "test_iso_target_a_99901";
const TEST_TARGET_B_UID = "test_iso_target_b_99902";

// Unique sentinel string to test output desensitization
const SENTINEL_SECRET = "SENTINEL_SECRET_GOAL_VALUE_PHASE_503";

async function cleanupTestFixtures() {
  try {
    const targets = await prisma.analysisTarget.findMany({
      where: { platformUid: { in: [TEST_TARGET_A_UID, TEST_TARGET_B_UID] } },
    });
    for (const t of targets) {
      await prisma.analysisTarget.delete({ where: { id: t.id } });
    }

    const profiles = await prisma.selfProvidedProfile.findMany({
      where: { id: { in: [TEST_PROFILE_A_ID, TEST_PROFILE_B_ID] } },
    });
    for (const p of profiles) {
      await prisma.selfProvidedProfile.delete({ where: { id: p.id } });
    }
  } catch {
    // Ignore cleanup errors during pre-clean
  }
}

async function runPhase503Verification() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 5.0.3 隔离测试与最小读取验证");
  console.log("=================================================\n");

  let allPassed = true;

  try {
    // Clean up previous test fixtures if any
    await cleanupTestFixtures();

    // 1. Setup Isolated Profile A and Profile B
    console.log("[准备] 初始化完全隔离的测试 Profile A 与 Profile B...");
    await updateSelfProfile(
      {
        fields: {
          currentGoals: {
            value: "Profile A 专属学习目标",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
          learningDirections: {
            value: "Profile A 专属技术方向",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
        },
      },
      TEST_PROFILE_A_ID
    );

    await updateSelfProfile(
      {
        fields: {
          currentGoals: {
            value: "Profile B 专属学习目标 (绝不可被污染)",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
          learningDirections: {
            value: "Profile B 专属技术方向 (绝不可被污染)",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
        },
      },
      TEST_PROFILE_B_ID
    );

    // 2. Create Tasks for Profile A and Profile B
    console.log("[准备] 为两个 Profile 分别创建任务与快照...");
    // Task A1: Multi-field snapshot (currentGoals + learningDirections)
    const taskA1 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_A_UID,
        displayName: "测试目标 A1",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_A_ID
    );

    // Task B1: Multi-field snapshot for Profile B
    const taskB1 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_B_UID,
        displayName: "测试目标 B1",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_B_ID
    );

    // Task A2: Single-field snapshot (revoke learningDirections first, so it only has currentGoals)
    await revokeSelfProfile({ fieldName: "learningDirections" }, TEST_PROFILE_A_ID);
    const taskA2 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_A_UID,
        displayName: "测试目标 A2 (单字段快照)",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_A_ID
    );

    // Restore Profile A learningDirections for testing
    await updateSelfProfile(
      {
        fields: {
          learningDirections: {
            value: "Profile A 专属技术方向",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
        },
      },
      TEST_PROFILE_A_ID
    );

    console.log(`  - 已创建 Task A1 (快照字段数: ${taskA1.selfProvidedFieldsCount})`);
    console.log(`  - 已创建 Task A2 (快照字段数: ${taskA2.selfProvidedFieldsCount})`);
    console.log(`  - 已创建 Task B1 (快照字段数: ${taskB1.selfProvidedFieldsCount})`);

    // --- Test 1: Profile A Purges `currentGoals` ---
    console.log("\n[测试 1] 针对 Profile A 执行 purge(currentGoals)...");
    const purgeResult = await purgeSelfProfile({ fieldName: "currentGoals" }, TEST_PROFILE_A_ID);
    console.log(`  - Purge 执行结果: ${purgeResult.message}`);

    // Verify Profile A currentGoals is reset
    const profileAAfter = await prisma.selfProvidedField.findUniqueOrThrow({
      where: {
        profileId_fieldName: {
          profileId: TEST_PROFILE_A_ID,
          fieldName: "currentGoals",
        },
      },
    });

    const test1Passed = profileAAfter.value === "" && profileAAfter.allowedForAnalysis === false;
    console.log(`  - Profile A 的 currentGoals 字段已清空重置: ${test1Passed ? "✅ 通过" : "❌ 失败"}`);
    if (!test1Passed) allPassed = false;

    // --- Test 2: Verify Profile B is 100% Untouched ---
    console.log("\n[测试 2] 验证 Profile B 及其任务快照完全未受影响 (严格数据隔离)...");
    const profileBAfter = await prisma.selfProvidedField.findUniqueOrThrow({
      where: {
        profileId_fieldName: {
          profileId: TEST_PROFILE_B_ID,
          fieldName: "currentGoals",
        },
      },
    });

    const taskB1Db = await prisma.analysisTask.findUniqueOrThrow({
      where: { id: taskB1.id },
      include: {
        selfProvidedSnapshot: {
          include: { fields: true },
        },
      },
    });

    const bCurrentGoalsField = taskB1Db.selfProvidedSnapshot?.fields.find((f) => f.fieldName === "currentGoals");
    const test2Passed =
      profileBAfter.value === "Profile B 专属学习目标 (绝不可被污染)" &&
      profileBAfter.allowedForAnalysis === true &&
      taskB1Db.needsRegeneration === false &&
      bCurrentGoalsField?.value === "Profile B 专属学习目标 (绝不可被污染)";

    console.log(`  - Profile B 的 currentGoals 字段值未变: ${profileBAfter.value === "Profile B 专属学习目标 (绝不可被污染)" ? "✅" : "❌"}`);
    console.log(`  - Task B1 的快照 currentGoals 完整保留: ${Boolean(bCurrentGoalsField) ? "✅" : "❌"}`);
    console.log(`  - Task B1 未被误标记 needsRegeneration: ${!taskB1Db.needsRegeneration ? "✅" : "❌"}`);
    if (!test2Passed) allPassed = false;

    // --- Test 3: Snapshot Cleanup & Task NeedsRegeneration Verification ---
    console.log("\n[测试 3] 验证 Profile A 的快照差异保留与空快照物理删除...");
    const taskA1Db = await prisma.analysisTask.findUniqueOrThrow({
      where: { id: taskA1.id },
      include: {
        selfProvidedSnapshot: {
          include: { fields: true },
        },
      },
    });

    const taskA2Db = await prisma.analysisTask.findUniqueOrThrow({
      where: { id: taskA2.id },
      include: {
        selfProvidedSnapshot: {
          include: { fields: true },
        },
      },
    });

    const a1HasGoals = taskA1Db.selfProvidedSnapshot?.fields.some((f) => f.fieldName === "currentGoals");
    const a1HasDirections = taskA1Db.selfProvidedSnapshot?.fields.some((f) => f.fieldName === "learningDirections");
    const a2SnapshotDeleted = taskA2Db.selfProvidedSnapshot === null;

    const test3Passed =
      !a1HasGoals &&
      a1HasDirections &&
      a2SnapshotDeleted &&
      taskA1Db.needsRegeneration === true &&
      taskA2Db.needsRegeneration === true;

    console.log(`  - Task A1 保留其他字段 (learningDirections): ${a1HasDirections ? "✅" : "❌"}`);
    console.log(`  - Task A1 移除了 currentGoals: ${!a1HasGoals ? "✅" : "❌"}`);
    console.log(`  - Task A2 变空后快照记录被物理删除: ${a2SnapshotDeleted ? "✅" : "❌"}`);
    console.log(`  - Task A1 标记 needsRegeneration=true: ${taskA1Db.needsRegeneration ? "✅" : "❌"}`);
    console.log(`  - Task A2 标记 needsRegeneration=true: ${taskA2Db.needsRegeneration ? "✅" : "❌"}`);
    if (!test3Passed) allPassed = false;

    // --- Test 4: Verify Revoke Prevents Subsequent Task Snapshotting ---
    console.log("\n[测试 4] 验证 Revoke 撤回后创建新任务不写入已撤回字段...");
    await revokeSelfProfile({ fieldName: "learningDirections" }, TEST_PROFILE_A_ID);

    const taskA3 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_A_UID,
        displayName: "测试目标 A3",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_A_ID
    );

    const test4Passed = taskA3.hasSelfProvidedSnapshot === false && taskA3.selfProvidedFieldsCount === 0;
    console.log(`  - 全部字段撤回/清空后，新任务不生成快照: ${test4Passed ? "✅ 通过" : "❌ 失败"}`);
    if (!test4Passed) allPassed = false;

    // --- Test 5: Verify Unconfirmed Consent Aborts Transaction Atomically ---
    console.log("\n[测试 5] 验证未确认授权时事务完全回滚 (0 目标, 0 任务, 0 快照)...");
    await updateSelfProfile(
      {
        fields: {
          interestTags: {
            value: "AI, 架构",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
        },
      },
      TEST_PROFILE_A_ID
    );

    const tasksCountBefore = await prisma.analysisTask.count();
    const targetsCountBefore = await prisma.analysisTarget.count();
    const snapshotsCountBefore = await prisma.selfProvidedSnapshot.count();

    let threwConsentError = false;
    try {
      await createTaskWithSnapshot(
        {
          platformUid: "test_aborted_target_99999",
          displayName: "应被回滚的目标",
          selfProvidedConsentConfirmed: false, // Not confirmed
        },
        TEST_PROFILE_A_ID
      );
    } catch (err) {
      if (err instanceof SelfProvidedConsentRequiredError) {
        threwConsentError = true;
      }
    }

    const tasksCountAfter = await prisma.analysisTask.count();
    const targetsCountAfter = await prisma.analysisTarget.count();
    const snapshotsCountAfter = await prisma.selfProvidedSnapshot.count();

    const test5Passed =
      threwConsentError &&
      tasksCountBefore === tasksCountAfter &&
      targetsCountBefore === targetsCountAfter &&
      snapshotsCountBefore === snapshotsCountAfter;

    console.log(`  - 抛出 SelfProvidedConsentRequiredError: ${threwConsentError ? "✅" : "❌"}`);
    console.log(`  - 任务数未增加: ${tasksCountBefore === tasksCountAfter ? "✅" : "❌"}`);
    console.log(`  - 目标数未增加: ${targetsCountBefore === targetsCountAfter ? "✅" : "❌"}`);
    console.log(`  - 快照数未增加: ${snapshotsCountBefore === snapshotsCountAfter ? "✅" : "❌"}`);
    if (!test5Passed) allPassed = false;

    // --- Test 6: Zero-Leakage Sentinel String & Minimal Read Verification ---
    console.log("\n[测试 6] 验证任务 API 响应链最小读取收口与零哨兵泄露 (Phase 5.0.3)...");
    
    // Check 0: Validate TASK_SUMMARY_PRISMA_INCLUDE projection strictly selects only id
    const includeConfig = TASK_SUMMARY_PRISMA_INCLUDE.selfProvidedSnapshot.include.fields.select;
    const isMinimalProjection =
      includeConfig.id === true &&
      !("value" in includeConfig) &&
      !("fieldName" in includeConfig) &&
      !("consentScope" in includeConfig);

    // Update Profile A with unique sentinel secret
    await updateSelfProfile(
      {
        fields: {
          currentGoals: {
            value: SENTINEL_SECRET,
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
        },
      },
      TEST_PROFILE_A_ID
    );

    // Check 1: POST /api/tasks response (createTaskWithSnapshot)
    const sentinelTask = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_A_UID,
        displayName: "哨兵测试目标",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_A_ID
    );
    const leakedInPost = JSON.stringify(sentinelTask).includes(SENTINEL_SECRET);

    // Check 2: GET /api/tasks list response query and serialization
    const tasksListRaw = await prisma.analysisTask.findMany({
      where: { targetId: sentinelTask.targetId },
      include: TASK_SUMMARY_PRISMA_INCLUDE,
    });
    const serializedList = tasksListRaw.map(serializeTaskSummary);
    const leakedInList = JSON.stringify(serializedList).includes(SENTINEL_SECRET);

    // Check 3: GET /api/tasks/[id] response query and serialization
    const singleTaskRaw = await prisma.analysisTask.findUniqueOrThrow({
      where: { id: sentinelTask.id },
      include: TASK_SUMMARY_PRISMA_INCLUDE,
    });
    const serializedGet = serializeTaskSummary(singleTaskRaw);
    const leakedInGet = JSON.stringify(serializedGet).includes(SENTINEL_SECRET);

    // Check 4: PATCH /api/tasks/[id] response query and serialization
    const patchedTaskRaw = await prisma.analysisTask.update({
      where: { id: sentinelTask.id },
      data: { progress: 50 },
      include: TASK_SUMMARY_PRISMA_INCLUDE,
    });
    const serializedPatch = serializeTaskSummary(patchedTaskRaw);
    const leakedInPatch = JSON.stringify(serializedPatch).includes(SENTINEL_SECRET);

    // Check 5: Database SQLite raw records STILL contain full original sentinel secret
    const dbSnapshotField = await prisma.snapshotField.findFirst({
      where: {
        snapshot: { taskId: sentinelTask.id },
        fieldName: "currentGoals",
      },
    });
    const preservedInDb = dbSnapshotField?.value === SENTINEL_SECRET;

    // Check 6: Non-sensitive metadata correctly computed
    const metadataCorrect =
      sentinelTask.hasSelfProvidedSnapshot === true &&
      sentinelTask.selfProvidedFieldsCount >= 1 &&
      typeof sentinelTask.snapshotCreatedAt === "string" &&
      typeof sentinelTask.needsRegeneration === "boolean";

    const test6Passed =
      isMinimalProjection &&
      !leakedInPost &&
      !leakedInList &&
      !leakedInGet &&
      !leakedInPatch &&
      preservedInDb &&
      metadataCorrect;

    console.log(`  - Task API Prisma 查询投影严格收口 (只 select id): ${isMinimalProjection ? "✅" : "❌"}`);
    console.log(`  - POST /api/tasks 响应 JSON 绝无哨兵泄露: ${!leakedInPost ? "✅" : "❌"}`);
    console.log(`  - GET /api/tasks 列表 JSON 绝无哨兵泄露: ${!leakedInList ? "✅" : "❌"}`);
    console.log(`  - GET /api/tasks/[id] 详情 JSON 绝无哨兵泄露: ${!leakedInGet ? "✅" : "❌"}`);
    console.log(`  - PATCH /api/tasks/[id] 更新 JSON 绝无哨兵泄露: ${!leakedInPatch ? "✅" : "❌"}`);
    console.log(`  - SQLite 数据库内部完整保留原始快照值: ${preservedInDb ? "✅" : "❌"}`);
    console.log(`  - 非敏感快照元数据完整提供 (hasSnapshot, fieldsCount, snapshotCreatedAt): ${metadataCorrect ? "✅" : "❌"}`);
    if (!test6Passed) allPassed = false;

    console.log("\n=================================================");
    if (allPassed) {
      console.log("🎉 Phase 5.0.3 隔离测试与最小读取验证所有 6 项测试全部通过！");
      console.log("=================================================\n");
    } else {
      console.error("❌ 部分测试未通过，请检查逻辑。");
      console.log("=================================================\n");
      process.exit(1);
    }
  } finally {
    // Zero-pollution cleanup: only clean up test fixtures
    await cleanupTestFixtures();
    console.log("[清理] 隔离测试夹具已安全清除，未触碰任何用户数据。\n");
    await prisma.$disconnect();
  }
}

runPhase503Verification().catch((err) => {
  console.error("验证脚本执行异常:", err);
  process.exit(1);
});
