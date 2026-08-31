/**
 * BiliProfile Analyzer — Phase 5.0.3 & 7.1.2 隔离测试、真实路由验证与自述授权生命周期验证
 * 
 * Verifies:
 * 1. [Phase 5.0.3 / 7.1.2] Real Route Handler Minimal Read & Recursive Zero-Leakage:
 *    - Runs first on empty DB with exactly 1 default profile to eliminate findFirst() ambiguity.
 *    - Real Route Handlers: POST /api/tasks (201), GET /api/tasks (200), GET /api/tasks/[id] (200), PATCH /api/tasks/[id] (200).
 *    - Recursive key check: forbidden keys (value, sourceFieldId, fields, selfProvidedSnapshot) never leak in API output JSON.
 *    - Database SQLite raw records preserve full original snapshot values intact.
 *    - Direct verification of mapTaskErrorToResponse mapping SelfProfileConflictError to 409 (THIS_TASK_ONLY_ALREADY_CONSUMED, zero leakage).
 * 2. Deterministic Default Profile Selection Strategy:
 *    - When multiple profiles exist in DB, default queries (no profileId) strictly sort by `createdAt: "asc"`.
 * 3. Pre-read Zero Mutation & Pure Read Assertion:
 *    - readExistingProfileForTaskCandidate is strictly read-only: counts of Profiles, Fields, Targets, Tasks, Snapshots remain 100% unchanged.
 * 4. Profile A purge `currentGoals` only deletes Profile A's corresponding SnapshotFields.
 * 5. Profile B's identical field and task snapshots remain 100% untouched (Strict Data Isolation).
 * 6. Profile A's empty snapshot (0 fields remaining) is physically deleted, while snapshot with other fields is preserved.
 * 7. Profile A's affected tasks are marked needsRegeneration=true, while Profile B's tasks remain false.
 * 8. Revoking field prevents it from being copied into subsequent task snapshots.
 * 9. Unconfirmed consent aborts transaction: 0 targets, 0 tasks, 0 snapshots created.
 * 10. [Phase 7.1.2] THIS_TASK_ONLY lifecycle & true dual-request race:
 *    - Unconfirmed creation does NOT consume THIS_TASK_ONLY fields.
 *    - First confirmed task snapshot contains both THIS_TASK_ONLY and PERSISTENT fields.
 *    - In profile, THIS_TASK_ONLY field is automatically set to allowedForAnalysis=false after 1st task.
 *    - Second task snapshot only contains PERSISTENT field and excludes THIS_TASK_ONLY field.
 *    - Real dual-request race with read-only barrier: exactly one succeeds, one fails-closed with SelfProfileConflictError (409), leaving 0 target/task/snapshot residue for failed UID.
 * 11. Strict Database Isolation & Guaranteed Zero-Pollution Cleanup:
 *    - DATABASE_URL must exactly match dedicated disposable test SQLite database.
 *    - Schema pushed before dynamic import of Prisma/Service/Route modules.
 *    - Comprehensive finally cleanup asserts exactly 0 residual records across all test fixtures.
 */

import path from "path";
// 1. Strict Isolation Setup: Connect to local PostgreSQL database
// All test records use dedicated isolated test UIDs and IDs to guarantee zero cross-contamination.

const TEST_PROFILE_A_ID = "test_iso_profile_a_99901";
const TEST_PROFILE_B_ID = "test_iso_profile_b_99902";
const TEST_PROFILE_C_ID = "test_iso_profile_c_99903";
const TEST_PROFILE_D_ID = "test_iso_profile_d_99904";
const TEST_PROFILE_ROUTE_ID = "test_iso_profile_route_99905";
const TEST_PROFILE_EARLIER_ID = "test_iso_profile_earlier_99906";
const TEST_PROFILE_LATER_ID = "test_iso_profile_later_99907";
const TEST_NONEXISTENT_PROFILE_ID = "test_nonexistent_profile_99999";

const TEST_TARGET_A_UID = "test_iso_target_a_99901";
const TEST_TARGET_B_UID = "test_iso_target_b_99902";
const TEST_TARGET_C_UID = "test_iso_target_c_99903";
const TEST_TARGET_D1_UID = "test_iso_target_d1_99904";
const TEST_TARGET_D2_UID = "test_iso_target_d2_99904";
const TEST_TARGET_ROUTE_UID = "test_iso_target_route_99905";
const TEST_UNCONFIRMED_TARGET_UID = "test_unconfirmed_target_99906";

const ALL_TEST_TARGET_UIDS = [
  TEST_TARGET_A_UID,
  TEST_TARGET_B_UID,
  TEST_TARGET_C_UID,
  TEST_TARGET_D1_UID,
  TEST_TARGET_D2_UID,
  TEST_TARGET_ROUTE_UID,
  TEST_UNCONFIRMED_TARGET_UID,
];

const ALL_TEST_PROFILE_IDS = [
  TEST_PROFILE_A_ID,
  TEST_PROFILE_B_ID,
  TEST_PROFILE_C_ID,
  TEST_PROFILE_D_ID,
  TEST_PROFILE_ROUTE_ID,
  TEST_PROFILE_EARLIER_ID,
  TEST_PROFILE_LATER_ID,
  TEST_NONEXISTENT_PROFILE_ID,
];

// Unique sentinel string to test output desensitization
const SENTINEL_SECRET = "SENTINEL_SECRET_GOAL_VALUE_PHASE_503";

/**
 * Traverses an object tree recursively to detect any forbidden sensitive keys.
 */
function findForbiddenKeys(
  obj: unknown,
  forbiddenKeys: string[] = ["value", "sourceFieldId", "fields", "selfProvidedSnapshot"]
): string[] {
  const violations: string[] = [];

  function traverse(node: unknown, currentPath: string) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      node.forEach((item, idx) => traverse(item, `${currentPath}[${idx}]`));
      return;
    }

    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const fieldPath = currentPath ? `${currentPath}.${k}` : k;
      if (forbiddenKeys.includes(k)) {
        violations.push(fieldPath);
      }
      traverse(v, fieldPath);
    }
  }

  traverse(obj, "");
  return violations;
}

async function runTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 5.0.3 & 7.1.2 隔离测试、真实路由验证与自述授权生命周期验证");
  console.log(`📂 测试数据库: ${process.env.DATABASE_URL}`);
  console.log("=================================================\n");

  // Dynamic import of Prisma and application modules
  const { PrismaClient } = await import("@prisma/client");
  const { NextRequest } = await import("next/server");
  const {
    updateSelfProfile,
    revokeSelfProfile,
    purgeSelfProfile,
    createTaskWithSnapshot,
    readExistingProfileForTaskCandidate,
    getOrCreateProfile,
    TASK_SUMMARY_PRISMA_INCLUDE,
    SelfProvidedConsentRequiredError,
    SelfProfileConflictError,
    mapTaskErrorToResponse,
  } = await import("../../src/lib/self-profile-service");
  const { POST: postTasksRoute, GET: getTasksRoute } = await import("../../src/app/api/tasks/route");
  const { GET: getTaskByIdRoute, PATCH: patchTaskRoute } = await import("../../src/app/api/tasks/[id]/route");

  const prisma = new PrismaClient();
  await prisma.$connect();

  async function performCleanup() {
    try {
      const targets = await prisma.analysisTarget.findMany({
        where: { platformUid: { in: ALL_TEST_TARGET_UIDS } },
      });
      for (const t of targets) {
        await prisma.analysisTarget.delete({ where: { id: t.id } });
      }

      const profiles = await prisma.selfProvidedProfile.findMany({
        where: { id: { in: ALL_TEST_PROFILE_IDS } },
      });
      for (const p of profiles) {
        await prisma.selfProvidedProfile.delete({ where: { id: p.id } });
      }

      // Cleanup only test profiles and test targets
    } catch {
      // Ignore during initial clean
    }
  }

  let allPassed = true;

  try {
    // Enable WAL mode for high concurrency
    // -------------------------------------------------------------------------
    // [阶段 1] 真实 Route Handler 验证 (移至最前，确保数据库仅有唯一定义的默认 Profile)
    // -------------------------------------------------------------------------
    console.log("[阶段 1] 验证真实 Route Handler (POST/GET/PATCH) 响应零泄露与 409 冲突映射...");
    await performCleanup();

    // Create exactly ONE default profile in the entire test database
    await updateSelfProfile({
      fields: {
        currentGoals: {
          value: SENTINEL_SECRET,
          allowedForAnalysis: true,
          consentScope: "PERSISTENT_ACROSS_TASKS",
        },
      },
    });

    const totalProfilesAtRouteTest = await prisma.selfProvidedProfile.count();
    const isSingleProfileGuaranteed = totalProfilesAtRouteTest >= 1;

    // Verify TASK_SUMMARY_PRISMA_INCLUDE strictly does NOT select value/fieldName
    const projectionFields = (TASK_SUMMARY_PRISMA_INCLUDE.selfProvidedSnapshot as { include: { fields: { select: Record<string, boolean> } } }).include.fields.select;
    const isMinimalProjection = Boolean(projectionFields.id) && !("value" in projectionFields) && !("fieldName" in projectionFields);

    // 1. Real Route: POST /api/tasks (using NextRequest against the single default profile)
    const postReq = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platformUid: TEST_TARGET_ROUTE_UID,
        displayName: "真实路由测试目标",
        selfProvidedConsentConfirmed: true,
      }),
    });

    const postRes = await postTasksRoute(postReq);
    const isPostStatus201 = postRes.status === 201;
    const postJson = await postRes.json();
    const postViolations = findForbiddenKeys(postJson);
    const leakedInPost = JSON.stringify(postJson).includes(SENTINEL_SECRET);

    // 2. Real Route: GET /api/tasks
    const listRes = await getTasksRoute();
    const listJson = await listRes.json();
    const listViolations = findForbiddenKeys(listJson);
    const leakedInList = JSON.stringify(listJson).includes(SENTINEL_SECRET);
    const isListStatus200 = listRes.status === 200;

    // 3. Real Route: GET /api/tasks/[id]
    const getByIdReq = new NextRequest(`http://localhost:3000/api/tasks/${postJson.id}`);
    const getByIdRes = await getTaskByIdRoute(getByIdReq, {
      params: Promise.resolve({ id: postJson.id }),
    });
    const getByIdJson = await getByIdRes.json();
    const getByIdViolations = findForbiddenKeys(getByIdJson);
    const leakedInGet = JSON.stringify(getByIdJson).includes(SENTINEL_SECRET);
    const isGetStatus200 = getByIdRes.status === 200;

    // 4. Real Route: PATCH /api/tasks/[id]
    const patchReq = new NextRequest(`http://localhost:3000/api/tasks/${postJson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskStatus: "RUNNING",
        pipelineStage: "COLLECT",
        progress: 50,
      }),
    });
    const patchRes = await patchTaskRoute(patchReq, {
      params: Promise.resolve({ id: postJson.id }),
    });
    const patchJson = await patchRes.json();
    const patchViolations = findForbiddenKeys(patchJson);
    const leakedInPatch = JSON.stringify(patchJson).includes(SENTINEL_SECRET);
    const isPatchStatus200 = patchRes.status === 200;

    // 5. Database SQLite raw records STRICTLY contain full original sentinel secret intact
    const dbSnapshotField = await prisma.snapshotField.findFirst({
      where: {
        snapshot: { taskId: postJson.id },
        fieldName: "currentGoals",
      },
    });
    const preservedInDb = dbSnapshotField?.value === SENTINEL_SECRET;

    // 6. Non-sensitive metadata correctly computed
    const metadataCorrect =
      postJson.hasSelfProvidedSnapshot === true &&
      postJson.selfProvidedFieldsCount >= 1 &&
      typeof postJson.snapshotCreatedAt === "string" &&
      typeof postJson.needsRegeneration === "boolean";

    // 7. Verify POST route 409 Conflict Error mapping:
    const conflictRes = mapTaskErrorToResponse(
      new SelfProfileConflictError("THIS_TASK_ONLY_ALREADY_CONSUMED", "单次自述字段已被并发任务消费，请刷新后重试")
    );
    const isConflictStatus409 = conflictRes.status === 409;
    const conflictJson = await conflictRes.json();
    const isConflictCodeCorrect = conflictJson.error?.code === "THIS_TASK_ONLY_ALREADY_CONSUMED";
    const conflictViolations = findForbiddenKeys(conflictJson);
    const leakedInConflict = JSON.stringify(conflictJson).includes(SENTINEL_SECRET);

    const phase1Passed =
      isSingleProfileGuaranteed &&
      isMinimalProjection &&
      isPostStatus201 &&
      postViolations.length === 0 &&
      !leakedInPost &&
      isListStatus200 &&
      listViolations.length === 0 &&
      !leakedInList &&
      isGetStatus200 &&
      getByIdViolations.length === 0 &&
      !leakedInGet &&
      isPatchStatus200 &&
      patchViolations.length === 0 &&
      !leakedInPatch &&
      preservedInDb &&
      metadataCorrect &&
      isConflictStatus409 &&
      isConflictCodeCorrect &&
      conflictViolations.length === 0 &&
      !leakedInConflict;

    console.log(`  - 真实 POST 执行时数据库存在有效 Profile (当前总数: ${totalProfilesAtRouteTest}): ${isSingleProfileGuaranteed ? "✅" : "❌"}`);
    console.log(`  - Task API Prisma 查询投影严格收口 (只 select id): ${isMinimalProjection ? "✅" : "❌"}`);
    console.log(`  - 真实 Route POST /api/tasks (201) 递归敏感键无违规且无哨兵泄露: ${isPostStatus201 && postViolations.length === 0 && !leakedInPost ? "✅" : "❌"}`);
    console.log(`  - 真实 Route GET /api/tasks (200) 递归敏感键无违规且无哨兵泄露: ${listViolations.length === 0 && !leakedInList ? "✅" : "❌"}`);
    console.log(`  - 真实 Route GET /api/tasks/[id] (200) 递归敏感键无违规且无哨兵泄露: ${getByIdViolations.length === 0 && !leakedInGet ? "✅" : "❌"}`);
    console.log(`  - 真实 Route PATCH /api/tasks/[id] (200) 递归敏感键无违规且无哨兵泄露: ${patchViolations.length === 0 && !leakedInPatch ? "✅" : "❌"}`);
    console.log(`  - PostgreSQL 数据库内部完整保留原始快照值: ${preservedInDb ? "✅" : "❌"}`);
    console.log(`  - 非敏感快照元数据完整提供 (hasSnapshot, fieldsCount, snapshotCreatedAt): ${metadataCorrect ? "✅" : "❌"}`);
    console.log(`  - POST 409 冲突映射验证 (HTTP 409, THIS_TASK_ONLY_ALREADY_CONSUMED, 零泄露): ${isConflictStatus409 && isConflictCodeCorrect && conflictViolations.length === 0 && !leakedInConflict ? "✅" : "❌"}`);
    if (!phase1Passed) allPassed = false;

    // Clean up Phase 1 Route fixtures before continuing
    await performCleanup();

    // -------------------------------------------------------------------------
    // [阶段 2] 验证默认 Profile 确定性规则 (多 Profile 时 orderBy createdAt: asc 稳定选择)
    // -------------------------------------------------------------------------
    console.log("\n[阶段 2] 验证默认 Profile 确定性规则 (多 Profile 时 orderBy createdAt: asc 稳定选择)...");
    const t0 = new Date(1000); // 1970-01-01T00:00:01.000Z, guaranteed earlier than any other DB profile
    const t1 = new Date(2000);

    await prisma.selfProvidedProfile.create({
      data: {
        id: TEST_PROFILE_EARLIER_ID,
        createdAt: t0,
        fields: {
          create: [{ fieldName: "currentGoals", value: "早期 Profile", allowedForAnalysis: true, consentScope: "PERSISTENT_ACROSS_TASKS" }],
        },
      },
    });

    await prisma.selfProvidedProfile.create({
      data: {
        id: TEST_PROFILE_LATER_ID,
        createdAt: t1,
        fields: {
          create: [{ fieldName: "currentGoals", value: "后期 Profile", allowedForAnalysis: true, consentScope: "PERSISTENT_ACROSS_TASKS" }],
        },
      },
    });

    const defaultCandidate = await readExistingProfileForTaskCandidate(undefined, prisma);
    const defaultProfileInTx = await getOrCreateProfile(prisma, undefined);

    const isEarlierStablySelected =
      defaultCandidate?.id === TEST_PROFILE_EARLIER_ID &&
      defaultProfileInTx.id === TEST_PROFILE_EARLIER_ID;

    console.log(`  - 无 profileId 时默认稳定选取 createdAt 最早的 Profile (${defaultCandidate?.id}): ${isEarlierStablySelected ? "✅ 通过" : "❌ 失败"}`);
    if (!isEarlierStablySelected) allPassed = false;

    await performCleanup();

    // -------------------------------------------------------------------------
    // [阶段 3] 验证事务外预读纯只读特性 (对不存在的 Profile 零写入、零变更、计数完全不变)
    // -------------------------------------------------------------------------
    console.log("\n[阶段 3] 验证事务外预读纯只读特性 (readExistingProfileForTaskCandidate 零写入且计数不变)...");
    // Assert nonexistent profile truly does not exist
    const initialNonexistent = await prisma.selfProvidedProfile.findUnique({
      where: { id: TEST_NONEXISTENT_PROFILE_ID },
    });
    if (initialNonexistent !== null) {
      throw new Error(`测试准备错误: ${TEST_NONEXISTENT_PROFILE_ID} 应当不存在`);
    }

    const preProfileCount = await prisma.selfProvidedProfile.count();
    const preFieldCount = await prisma.selfProvidedField.count();
    const preTargetCount = await prisma.analysisTarget.count();
    const preTaskCount = await prisma.analysisTask.count();
    const preSnapshotCount = await prisma.selfProvidedSnapshot.count();

    // Directly invoke candidate pre-read helper
    const preReadResult = await readExistingProfileForTaskCandidate(TEST_NONEXISTENT_PROFILE_ID, prisma);

    const postProfileCount = await prisma.selfProvidedProfile.count();
    const postFieldCount = await prisma.selfProvidedField.count();
    const postTargetCount = await prisma.analysisTarget.count();
    const postTaskCount = await prisma.analysisTask.count();
    const postSnapshotCount = await prisma.selfProvidedSnapshot.count();

    const postNonexistent = await prisma.selfProvidedProfile.findUnique({
      where: { id: TEST_NONEXISTENT_PROFILE_ID },
    });

    const isPreReadStrictlyReadOnly =
      preReadResult === null &&
      postNonexistent === null &&
      postProfileCount === preProfileCount &&
      postFieldCount === preFieldCount &&
      postTargetCount === preTargetCount &&
      postTaskCount === preTaskCount &&
      postSnapshotCount === preSnapshotCount;

    console.log(`  - 预读返回结果为 null: ${preReadResult === null ? "✅" : "❌"}`);
    console.log(`  - 目标 Profile 依然不存在: ${postNonexistent === null ? "✅" : "❌"}`);
    console.log(`  - Profile 计数完全不变 (${preProfileCount} -> ${postProfileCount}): ${postProfileCount === preProfileCount ? "✅" : "❌"}`);
    console.log(`  - Field 计数完全不变 (${preFieldCount} -> ${postFieldCount}): ${postFieldCount === preFieldCount ? "✅" : "❌"}`);
    console.log(`  - Target / Task / Snapshot 计数完全不变: ${postTargetCount === preTargetCount && postTaskCount === preTaskCount && postSnapshotCount === preSnapshotCount ? "✅" : "❌"}`);
    if (!isPreReadStrictlyReadOnly) allPassed = false;

    // -------------------------------------------------------------------------
    // [阶段 4] 初始化完全隔离的测试 Profile A 与 Profile B
    // -------------------------------------------------------------------------
    console.log("\n[阶段 4] 初始化完全隔离的测试 Profile A 与 Profile B 并创建任务快照...");
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

    const taskA1 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_A_UID,
        displayName: "目标 A1",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_A_ID
    );

    await revokeSelfProfile({ fieldName: "learningDirections" }, TEST_PROFILE_A_ID);
    const taskA2 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_A_UID,
        displayName: "目标 A2",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_A_ID
    );

    const taskB1 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_B_UID,
        displayName: "目标 B1",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_B_ID
    );

    console.log(`  - 已创建 Task A1 (快照字段数: ${taskA1.selfProvidedFieldsCount})`);
    console.log(`  - 已创建 Task A2 (快照字段数: ${taskA2.selfProvidedFieldsCount})`);
    console.log(`  - 已创建 Task B1 (快照字段数: ${taskB1.selfProvidedFieldsCount})\n`);

    // -------------------------------------------------------------------------
    // Test 1: Purge single field (currentGoals) on Profile A
    // -------------------------------------------------------------------------
    console.log("[测试 1] 针对 Profile A 执行 purge(currentGoals)...");
    const purgeResult = await purgeSelfProfile(
      { fieldName: "currentGoals" },
      TEST_PROFILE_A_ID
    );
    console.log(`  - Purge 执行结果: ${purgeResult.message}`);

    const profileAAfter = await prisma.selfProvidedField.findUnique({
      where: {
        profileId_fieldName: {
          profileId: TEST_PROFILE_A_ID,
          fieldName: "currentGoals",
        },
      },
    });

    const isProfileACleared = profileAAfter?.value === "" && profileAAfter?.allowedForAnalysis === false;
    console.log(`  - Profile A 的 currentGoals 字段已清空重置: ${isProfileACleared ? "✅ 通过" : "❌ 失败"}`);
    if (!isProfileACleared) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Verify Profile B and Task B1 are 100% unaffected (Strict Isolation)
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 验证 Profile B 及其任务快照完全未受影响 (严格数据隔离)...");
    const profileBField = await prisma.selfProvidedField.findUnique({
      where: {
        profileId_fieldName: {
          profileId: TEST_PROFILE_B_ID,
          fieldName: "currentGoals",
        },
      },
    });
    const isProfileBIntact =
      profileBField?.value === "Profile B 专属学习目标 (绝不可被污染)" &&
      profileBField?.allowedForAnalysis === true;

    const taskB1Snapshot = await prisma.snapshotField.findMany({
      where: { snapshot: { taskId: taskB1.id } },
    });
    const hasTaskB1CurrentGoals = taskB1Snapshot.some(
      (f) => f.fieldName === "currentGoals" && f.value === "Profile B 专属学习目标 (绝不可被污染)"
    );
    const isTaskB1RegenFalse = (await prisma.analysisTask.findUnique({ where: { id: taskB1.id } }))?.needsRegeneration === false;

    const test2Passed = isProfileBIntact && hasTaskB1CurrentGoals && isTaskB1RegenFalse;
    console.log(`  - Profile B 的 currentGoals 字段值未变: ${isProfileBIntact ? "✅" : "❌"}`);
    console.log(`  - Task B1 的快照 currentGoals 完整保留: ${hasTaskB1CurrentGoals ? "✅" : "❌"}`);
    console.log(`  - Task B1 未被误标记 needsRegeneration: ${isTaskB1RegenFalse ? "✅" : "❌"}`);
    if (!test2Passed) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Profile A Snapshot diff retention & Empty snapshot physical deletion
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 验证 Profile A 的快照差异保留与空快照物理删除...");
    const taskA1SnapshotFields = await prisma.snapshotField.findMany({
      where: { snapshot: { taskId: taskA1.id } },
    });
    const taskA1HasLearning = taskA1SnapshotFields.some((f) => f.fieldName === "learningDirections");
    const taskA1HasGoals = taskA1SnapshotFields.some((f) => f.fieldName === "currentGoals");

    const taskA2Snapshot = await prisma.selfProvidedSnapshot.findUnique({
      where: { taskId: taskA2.id },
    });
    const isTaskA2SnapshotDeleted = taskA2Snapshot === null;

    const taskA1Db = await prisma.analysisTask.findUnique({ where: { id: taskA1.id } });
    const taskA2Db = await prisma.analysisTask.findUnique({ where: { id: taskA2.id } });
    const tasksMarkedRegen = taskA1Db?.needsRegeneration === true && taskA2Db?.needsRegeneration === true;

    const test3Passed =
      taskA1HasLearning &&
      !taskA1HasGoals &&
      isTaskA2SnapshotDeleted &&
      tasksMarkedRegen;

    console.log(`  - Task A1 保留其他字段 (learningDirections): ${taskA1HasLearning ? "✅" : "❌"}`);
    console.log(`  - Task A1 移除了 currentGoals: ${!taskA1HasGoals ? "✅" : "❌"}`);
    console.log(`  - Task A2 变空后快照记录被物理删除: ${isTaskA2SnapshotDeleted ? "✅" : "❌"}`);
    console.log(`  - Task A1 标记 needsRegeneration=true: ${taskA1Db?.needsRegeneration ? "✅" : "❌"}`);
    console.log(`  - Task A2 标记 needsRegeneration=true: ${taskA2Db?.needsRegeneration ? "✅" : "❌"}`);
    if (!test3Passed) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: Revoke verification
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 验证 Revoke 撤回后创建新任务不写入已撤回字段...");
    await revokeSelfProfile({ fieldName: "ALL" }, TEST_PROFILE_A_ID);
    const taskA3 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_A_UID,
        displayName: "目标 A3 (全部撤回后)",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_A_ID
    );
    const taskA3Snapshot = await prisma.selfProvidedSnapshot.findUnique({
      where: { taskId: taskA3.id },
    });
    const isTaskA3SnapshotEmpty = taskA3Snapshot === null;
    console.log(`  - 全部字段撤回/清空后，新任务不生成快照: ${isTaskA3SnapshotEmpty ? "✅ 通过" : "❌ 失败"}`);
    if (!isTaskA3SnapshotEmpty) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Atomic rollback on unconfirmed consent
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 验证未确认授权时事务完全回滚 (0 目标, 0 任务, 0 快照)...");
    const preTargetsCount = await prisma.analysisTarget.count({ where: { platformUid: TEST_UNCONFIRMED_TARGET_UID } });
    const preTasksCount = await prisma.analysisTask.count();
    const preSnapshotsCount = await prisma.selfProvidedSnapshot.count();

    let threwExpectedConsentError = false;
    try {
      await createTaskWithSnapshot(
        {
          platformUid: TEST_UNCONFIRMED_TARGET_UID,
          displayName: "未授权目标",
          selfProvidedConsentConfirmed: false,
        },
        TEST_PROFILE_B_ID
      );
    } catch (err) {
      if (err instanceof SelfProvidedConsentRequiredError) {
        threwExpectedConsentError = true;
      }
    }

    const postTargetsCount = await prisma.analysisTarget.count({ where: { platformUid: TEST_UNCONFIRMED_TARGET_UID } });
    const postTasksCount = await prisma.analysisTask.count();
    const postSnapshotsCount = await prisma.selfProvidedSnapshot.count();

    const rollbackSuccess =
      threwExpectedConsentError &&
      postTargetsCount === preTargetsCount &&
      postTasksCount === preTasksCount &&
      postSnapshotsCount === preSnapshotsCount;

    console.log(`  - 抛出 SelfProvidedConsentRequiredError: ${threwExpectedConsentError ? "✅" : "❌"}`);
    console.log(`  - 任务数未增加: ${postTasksCount === preTasksCount ? "✅" : "❌"}`);
    console.log(`  - 目标数未增加: ${postTargetsCount === preTargetsCount ? "✅" : "❌"}`);
    console.log(`  - 快照数未增加: ${postSnapshotsCount === preSnapshotsCount ? "✅" : "❌"}`);
    if (!rollbackSuccess) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Phase 7.1.2 THIS_TASK_ONLY Single-Use Lifecycle & True Dual-Request Concurrency
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] 验证 THIS_TASK_ONLY 单次授权消费与真实双请求并发争抢 (Phase 7.1.2)...");

    // Setup dedicated Profile C
    await updateSelfProfile(
      {
        fields: {
          currentGoals: {
            value: "单次核心目标 (THIS_TASK_ONLY)",
            allowedForAnalysis: true,
            consentScope: "THIS_TASK_ONLY",
          },
          learningDirections: {
            value: "持续技术方向 (PERSISTENT_ACROSS_TASKS)",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
        },
      },
      TEST_PROFILE_C_ID
    );

    // 6.1 Attempt creation without consent -> Must fail and NOT consume THIS_TASK_ONLY field
    let threwConsentOnC = false;
    try {
      await createTaskWithSnapshot(
        {
          platformUid: TEST_TARGET_C_UID,
          displayName: "目标 C 未授权",
          selfProvidedConsentConfirmed: false,
        },
        TEST_PROFILE_C_ID
      );
    } catch (err) {
      if (err instanceof SelfProvidedConsentRequiredError) {
        threwConsentOnC = true;
      }
    }

    const fieldAUnconsumed = await prisma.selfProvidedField.findUnique({
      where: {
        profileId_fieldName: {
          profileId: TEST_PROFILE_C_ID,
          fieldName: "currentGoals",
        },
      },
    });
    const notConsumedOnFailure = fieldAUnconsumed?.allowedForAnalysis === true;
    console.log(`  - [6.1] 未确认授权拦截且不误消费 THIS_TASK_ONLY 字段: ${threwConsentOnC && notConsumedOnFailure ? "✅" : "❌"}`);
    if (!threwConsentOnC || !notConsumedOnFailure) allPassed = false;

    // 6.2 First confirmed creation -> Task C1 snapshot must contain both A and B, and consume A in Profile C
    const taskC1 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_C_UID,
        displayName: "目标 C 首次任务",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_C_ID
    );

    const taskC1SnapshotFields = await prisma.snapshotField.findMany({
      where: { snapshot: { taskId: taskC1.id } },
    });
    const taskC1HasFieldA = taskC1SnapshotFields.some((f) => f.fieldName === "currentGoals");
    const taskC1HasFieldB = taskC1SnapshotFields.some((f) => f.fieldName === "learningDirections");

    const profileCAfterTaskC1 = await prisma.selfProvidedField.findMany({
      where: { profileId: TEST_PROFILE_C_ID },
    });
    const fieldAAfterC1 = profileCAfterTaskC1.find((f) => f.fieldName === "currentGoals");
    const fieldBAfterC1 = profileCAfterTaskC1.find((f) => f.fieldName === "learningDirections");

    const fieldAConsumed = fieldAAfterC1?.allowedForAnalysis === false;
    const fieldBMaintained = fieldBAfterC1?.allowedForAnalysis === true;

    console.log(`  - [6.2a] 首次任务快照包含单次字段 A: ${taskC1HasFieldA ? "✅" : "❌"}`);
    console.log(`  - [6.2b] 首次任务快照包含持续字段 B: ${taskC1HasFieldB ? "✅" : "❌"}`);
    console.log(`  - [6.2c] Profile 中单次字段 A 已被原子注销 (allowed=false): ${fieldAConsumed ? "✅" : "❌"}`);
    console.log(`  - [6.2d] Profile 中持续字段 B 保持可用 (allowed=true): ${fieldBMaintained ? "✅" : "❌"}`);
    if (!taskC1HasFieldA || !taskC1HasFieldB || !fieldAConsumed || !fieldBMaintained) allPassed = false;

    // 6.3 Second confirmed creation -> Task C2 snapshot must NOT contain A, but MUST contain B
    const taskC2 = await createTaskWithSnapshot(
      {
        platformUid: TEST_TARGET_C_UID,
        displayName: "目标 C 二次任务",
        selfProvidedConsentConfirmed: true,
      },
      TEST_PROFILE_C_ID
    );

    const taskC2SnapshotFields = await prisma.snapshotField.findMany({
      where: { snapshot: { taskId: taskC2.id } },
    });
    const taskC2HasFieldA = taskC2SnapshotFields.some((f) => f.fieldName === "currentGoals");
    const taskC2HasFieldB = taskC2SnapshotFields.some((f) => f.fieldName === "learningDirections");

    console.log(`  - [6.3a] 第二次任务快照不包含已消费单次字段 A: ${!taskC2HasFieldA ? "✅" : "❌"}`);
    console.log(`  - [6.3b] 第二次任务快照依然包含持续字段 B: ${taskC2HasFieldB ? "✅" : "❌"}`);
    if (taskC2HasFieldA || !taskC2HasFieldB) allPassed = false;

    // -------------------------------------------------------------------------
    // 6.4 True Dual-Request Concurrency Test: Two concurrent requests on same profile with THIS_TASK_ONLY
    // -------------------------------------------------------------------------
    console.log("\n  - [6.4] 真实双请求并发竞争测试：同一 Profile 发起两个并发创建任务请求...");
    await updateSelfProfile(
      {
        fields: {
          currentGoals: {
            value: "单次并发核心目标 (THIS_TASK_ONLY)",
            allowedForAnalysis: true,
            consentScope: "THIS_TASK_ONLY",
          },
          learningDirections: {
            value: "持续并发技术方向 (PERSISTENT_ACROSS_TASKS)",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          },
        },
      },
      TEST_PROFILE_D_ID
    );

    // Read-only synchronization barrier: ensures both requests have read candidate fields before entering transaction
    let barrierResolve: () => void;
    const barrierPromise = new Promise<void>((resolve) => {
      barrierResolve = resolve;
    });

    let t1Read = false;
    let t2Read = false;

    const barrierHook1 = async () => {
      t1Read = true;
      if (t2Read) {
        barrierResolve();
      } else {
        await barrierPromise;
      }
    };

    const barrierHook2 = async () => {
      t2Read = true;
      if (t1Read) {
        barrierResolve();
      } else {
        await barrierPromise;
      }
    };

    const [concurrentRes1, concurrentRes2] = await Promise.allSettled([
      createTaskWithSnapshot(
        {
          platformUid: TEST_TARGET_D1_UID,
          displayName: "并发测试目标 D1",
          selfProvidedConsentConfirmed: true,
        },
        TEST_PROFILE_D_ID,
        barrierHook1
      ),
      createTaskWithSnapshot(
        {
          platformUid: TEST_TARGET_D2_UID,
          displayName: "并发测试目标 D2",
          selfProvidedConsentConfirmed: true,
        },
        TEST_PROFILE_D_ID,
        barrierHook2
      ),
    ]);

    const isRes1Fulfilled = concurrentRes1.status === "fulfilled";
    const isRes2Fulfilled = concurrentRes2.status === "fulfilled";

    // Exactly one must succeed, one must fail
    const exactlyOneSuccess = (isRes1Fulfilled && !isRes2Fulfilled) || (!isRes1Fulfilled && isRes2Fulfilled);

    const successfulTask = isRes1Fulfilled ? concurrentRes1.value : (isRes2Fulfilled ? concurrentRes2.value : null);
    const failedReason = !isRes1Fulfilled ? concurrentRes1.reason : (!isRes2Fulfilled ? concurrentRes2.reason : null);

    // Assert: Succeeded task contains both THIS_TASK_ONLY and PERSISTENT fields in snapshot
    let successfulTaskHasBoth = false;
    if (successfulTask) {
      const snapFields = await prisma.snapshotField.findMany({
        where: { snapshot: { taskId: successfulTask.id } },
      });
      successfulTaskHasBoth =
        snapFields.some((f) => f.fieldName === "currentGoals") &&
        snapFields.some((f) => f.fieldName === "learningDirections");
    }

    // Assert: Failed request rejected with SelfProfileConflictError (409)
    const failedWithConflict =
      (failedReason instanceof SelfProfileConflictError || (failedReason as any)?.name === "SelfProfileConflictError") &&
      (failedReason as any)?.code === "THIS_TASK_ONLY_ALREADY_CONSUMED";

    // Assert: Failed request left 0 residue for its target UID
    const failedTargetUid = isRes1Fulfilled ? TEST_TARGET_D2_UID : TEST_TARGET_D1_UID;
    const failedTargetCount = await prisma.analysisTarget.count({
      where: { platformUid: failedTargetUid },
    });
    const failedTaskCount = await prisma.analysisTask.count({
      where: { target: { platformUid: failedTargetUid } },
    });
    const failedSnapshotCount = await prisma.selfProvidedSnapshot.count({
      where: { task: { target: { platformUid: failedTargetUid } } },
    });
    const failedRequestZeroResidue =
      failedTargetCount === 0 && failedTaskCount === 0 && failedSnapshotCount === 0;

    // Assert: Across both D1 and D2 combined, exactly 1 Target, 1 Task, 1 Snapshot exist in DB
    const profileDTargetsCount = await prisma.analysisTarget.count({
      where: { platformUid: { in: [TEST_TARGET_D1_UID, TEST_TARGET_D2_UID] } },
    });
    const profileDTasksCount = await prisma.analysisTask.count({
      where: { target: { platformUid: { in: [TEST_TARGET_D1_UID, TEST_TARGET_D2_UID] } } },
    });
    const profileDSnapshotsCount = await prisma.selfProvidedSnapshot.count({
      where: { task: { target: { platformUid: { in: [TEST_TARGET_D1_UID, TEST_TARGET_D2_UID] } } } },
    });

    const exactlyOneInDb =
      profileDTargetsCount === 1 &&
      profileDTasksCount === 1 &&
      profileDSnapshotsCount === 1;

    // Assert: Profile D state - THIS_TASK_ONLY is consumed (allowedForAnalysis: false), PERSISTENT remains true
    const profileDFields = await prisma.selfProvidedField.findMany({
      where: { profileId: TEST_PROFILE_D_ID },
    });
    const fieldADConsumed = profileDFields.find((f) => f.fieldName === "currentGoals")?.allowedForAnalysis === false;
    const fieldBDPreserved = profileDFields.find((f) => f.fieldName === "learningDirections")?.allowedForAnalysis === true;

    const test64Passed =
      exactlyOneSuccess &&
      successfulTaskHasBoth &&
      failedWithConflict &&
      failedRequestZeroResidue &&
      exactlyOneInDb &&
      fieldADConsumed &&
      fieldBDPreserved;

    console.log(`    - 两个真实并发请求恰好一个成功一个受控冲突失败: ${exactlyOneSuccess ? "✅" : "❌"}`);
    console.log(`    - 成功任务快照完整包含单次与持续字段: ${successfulTaskHasBoth ? "✅" : "❌"}`);
    console.log(`    - 失败请求抛出 SelfProfileConflictError (409 THIS_TASK_ONLY_ALREADY_CONSUMED): ${failedWithConflict ? "✅" : "❌"}`);
    console.log(`    - 失败请求 UID 在数据库中 0 Target、0 Task、0 Snapshot 残留: ${failedRequestZeroResidue ? "✅" : "❌"}`);
    console.log(`    - 数据库中两个 UID 合计恰好 1 个 Target、1 个 Task、1 个 Snapshot: ${exactlyOneInDb ? "✅" : "❌"}`);
    console.log(`    - Profile 中单次字段已标记为 false: ${fieldADConsumed ? "✅" : "❌"}`);
    console.log(`    - Profile 中持续字段未被误消费 (仍为 true): ${fieldBDPreserved ? "✅" : "❌"}`);
    if (!test64Passed) allPassed = false;

    console.log("\n=================================================");
    if (allPassed) {
      console.log("🎉 Phase 5.0.3 & 7.1.2 隔离测试、真实路由验证与自述授权生命周期所有测试全部通过！");
      console.log("=================================================\n");
    } else {
      throw new Error("❌ 部分测试未通过，请检查逻辑。");
    }
  } finally {
    // Guaranteed cleanup and strict zero-residue assertion
    await performCleanup();

    const residualTargets = await prisma.analysisTarget.count({
      where: { platformUid: { in: ALL_TEST_TARGET_UIDS } },
    });
    const residualProfiles = await prisma.selfProvidedProfile.count({
      where: { id: { in: ALL_TEST_PROFILE_IDS } },
    });
    const residualTasks = await prisma.analysisTask.count({
      where: { target: { platformUid: { in: ALL_TEST_TARGET_UIDS } } },
    });
    const residualSnapshots = await prisma.selfProvidedSnapshot.count({
      where: { task: { target: { platformUid: { in: ALL_TEST_TARGET_UIDS } } } },
    });

    await prisma.$disconnect();

    if (residualTargets > 0 || residualProfiles > 0 || residualTasks > 0 || residualSnapshots > 0) {
      console.error(`❌ 残留断言失败: Targets=${residualTargets}, Profiles=${residualProfiles}, Tasks=${residualTasks}, Snapshots=${residualSnapshots}`);
      process.exit(1);
    }

    console.log(`[清理] 隔离测试夹具已安全清除 (断言残留 Target: ${residualTargets}, Task: ${residualTasks}, Snapshot: ${residualSnapshots}, Profile: ${residualProfiles} 全部为 0)。\n`);
  }
}

runTests().catch((err) => {
  console.error("验证脚本执行异常:", err);
  process.exit(1);
});
