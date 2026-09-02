/**
 * Controlled test-data cleanup — deterministic local integration test.
 *
 * Validates the cleanup core (src/lib/test-cleanup.ts) WITHOUT the Next runtime:
 *  - A) test task + children + exclusive test target  => full cascade + target delete
 *  - B) two test tasks sharing one test target          => reference-count gate (target kept
 *        until the LAST task is removed)
 *  - C) real user task (isTest=false)                    => NotTestTaskError (FORBIDDEN)
 *
 * Run:  npx tsx scripts/probes/test-controlled-cleanup-e2e.ts
 * Pre:  local DATABASE_URL + prisma db push (isTest columns present)
 */

import { resolve } from "path";
import { prisma } from "../../src/lib/prisma";
import { cleanupTestTask, NotTestTaskError } from "../../src/lib/test-cleanup";

// Load local .env (DATABASE_URL) for the Prisma client.
try {
  // Node >= 20.6
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    resolve(process.cwd(), ".env")
  );
} catch {
  // best-effort; rely on already-exported env
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

const TEST_UID_A = "9900000001";
const TEST_UID_B = "9900000002";
const REAL_UID = "9900000003";

async function createTestTask(uid: string, alsoTargetIsTest = true) {
  const target = await prisma.analysisTarget.create({
    data: {
      platform: "BILIBILI",
      platformUid: uid,
      displayName: `E2E-${uid}`,
      isTest: alsoTargetIsTest,
    },
  });
  const task = await prisma.analysisTask.create({
    data: { targetId: target.id, taskStatus: "PENDING", isTest: true },
  });
  return { targetId: target.id, taskId: task.id };
}

async function seedChildren(taskId: string) {
  await prisma.dataSourceRun.create({
    data: { taskId, sourceName: "BASIC_PROFILE", status: "SUCCEEDED", recordsCount: 1 },
  });
  await prisma.deterministicReportArtifact.create({
    data: {
      taskId,
      schemaVersion: "1.0.0",
      taxonomyVersion: "1.0.0",
      reportData: "{}",
    },
  });
  await prisma.aiAnalysisArtifact.create({
    data: {
      taskId,
      provider: "MOCK",
      schemaVersion: "1.0.0",
      reportSchemaVersion: "1.0.0",
      taxonomyVersion: "1.0.0",
      analysisData: "{}",
    },
  });
  await prisma.rawRecord.create({
    data: {
      taskId,
      sourceType: "BASIC_PROFILE",
      sourceIdentifier: "x",
      payload: "{}",
      contentHash: "deadbeef",
    },
  });
  await prisma.metric.create({
    data: { taskId, metricName: "totalInput", numericValue: 1 },
  });
}

async function countChildren(taskId: string) {
  const [ds, dr, ai, rr, mt] = await Promise.all([
    prisma.dataSourceRun.count({ where: { taskId } }),
    prisma.deterministicReportArtifact.count({ where: { taskId } }),
    prisma.aiAnalysisArtifact.count({ where: { taskId } }),
    prisma.rawRecord.count({ where: { taskId } }),
    prisma.metric.count({ where: { taskId } }),
  ]);
  return ds + dr + ai + rr + mt;
}

async function main() {
  console.log("\n=== Scenario A: cascade delete + exclusive target delete ===");
  const a = await createTestTask(TEST_UID_A);
  await seedChildren(a.taskId);
  assert((await countChildren(a.taskId)) === 5, "5 child records seeded for test task");
  const resA = await cleanupTestTask(a.taskId);
  assert(resA.deletedTaskId === a.taskId, "returns deleted taskId");
  assert(resA.deletedTargetId === a.targetId, "returns deleted targetId (exclusive)");
  assert(resA.skippedTarget === false, "target NOT skipped");
  assert((await prisma.analysisTask.findUnique({ where: { id: a.taskId } })) === null, "task row gone");
  assert((await countChildren(a.taskId)) === 0, "all child rows cascaded away");
  assert((await prisma.analysisTarget.findUnique({ where: { id: a.targetId } })) === null, "target row gone");

  console.log("\n=== Scenario B: reference-count gate (shared target) ===");
  const bTarget = await prisma.analysisTarget.create({
    data: { platform: "BILIBILI", platformUid: TEST_UID_B, displayName: `E2E-${TEST_UID_B}`, isTest: true },
  });
  const b1 = await prisma.analysisTask.create({
    data: { targetId: bTarget.id, taskStatus: "PENDING", isTest: true },
  });
  const b2 = await prisma.analysisTask.create({
    data: { targetId: bTarget.id, taskStatus: "PENDING", isTest: true },
  });
  const resB1 = await cleanupTestTask(b1.id);
  assert(resB1.skippedTarget === true, "target skipped while another task references it");
  assert(resB1.deletedTargetId === null, "target NOT deleted (still referenced)");
  assert((await prisma.analysisTask.findUnique({ where: { id: b1.id } })) === null, "first task gone");
  assert((await prisma.analysisTask.findUnique({ where: { id: b2.id } })) !== null, "second task still present");
  assert((await prisma.analysisTarget.findUnique({ where: { id: bTarget.id } })) !== null, "target still present");
  const resB2 = await cleanupTestTask(b2.id);
  assert(resB2.deletedTargetId === bTarget.id, "target deleted after last task removed");
  assert((await prisma.analysisTarget.findUnique({ where: { id: bTarget.id } })) === null, "target gone");

  console.log("\n=== Scenario C: real user task (isTest=false) is protected ===");
  const realTarget = await prisma.analysisTarget.create({
    data: { platform: "BILIBILI", platformUid: REAL_UID, displayName: `REAL-${REAL_UID}`, isTest: false },
  });
  const realTask = await prisma.analysisTask.create({
    data: { targetId: realTarget.id, taskStatus: "PENDING", isTest: false },
  });
  let threw = false;
  try {
    await cleanupTestTask(realTask.id);
  } catch (e) {
    threw = e instanceof NotTestTaskError;
  }
  assert(threw, "cleanupTestTask throws NotTestTaskError on isTest=false task");
  assert((await prisma.analysisTask.findUnique({ where: { id: realTask.id } })) !== null, "real task NOT deleted");
  assert((await prisma.analysisTarget.findUnique({ where: { id: realTarget.id } })) !== null, "real target NOT deleted");
  // tidy up the deliberately-created real row (precise id, local dev only)
  await prisma.analysisTarget.delete({ where: { id: realTarget.id } });

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
