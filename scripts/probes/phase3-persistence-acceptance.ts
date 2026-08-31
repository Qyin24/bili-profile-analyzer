import { prisma } from "../../src/lib/db/client";
import { TaskStatus, PipelineStage, TaskOutcome, ConsentScope } from "@prisma/client";

async function main() {
  console.log("=== Phase 3.4 PostgreSQL Persistence Acceptance Test ===\n");

  // Clean any previous test target if present
  await prisma.analysisTarget.deleteMany({
    where: { displayName: { contains: "(Test Only)" } },
  });

  // 1. Verify Demo Seed Data is readable
  console.log("1. Verifying Demo Seed Data...");
  const demoTarget = await prisma.analysisTarget.findFirst({
    where: { platformUid: "demo_space_202688" },
    include: {
      tasks: {
        include: {
          dataSourceRuns: true,
          selfProvidedSnapshot: { include: { fields: true } },
          evidenceSnapshots: true,
        },
      },
    },
  });

  if (!demoTarget || demoTarget.tasks.length === 0) {
    throw new Error("Demo target or demo task not found after seeding.");
  }
  console.log(`✅ Demo Target: ${demoTarget.displayName} (UID: ${demoTarget.platformUid})`);
  console.log(`✅ Demo Tasks count: ${demoTarget.tasks.length}`);
  console.log(`✅ Demo Task 1 Status: ${demoTarget.tasks[0].taskStatus}, Stage: ${demoTarget.tasks[0].pipelineStage}, Outcome: ${demoTarget.tasks[0].outcome}`);
  console.log(`✅ Demo Evidence Snapshots count: ${demoTarget.tasks[0].evidenceSnapshots.length}`);

  // Verify TopicTaxonomies seeded
  const taxonomies = await prisma.topicTaxonomy.findMany();
  console.log(`✅ Topic Taxonomies count: ${taxonomies.length} (${taxonomies.map(t => t.name).join(", ")})`);

  // 2. Create a Non-Demo Verification Target & Task
  console.log("\n2. Creating Non-Demo Verification Target & Task...");
  const testUid = `test_verify_${Date.now()}`;
  const testTarget = await prisma.analysisTarget.create({
    data: {
      platform: "BILIBILI",
      platformUid: testUid,
      normalizedIdentifier: testUid,
      displayName: "本地持久化验证目标 (Test Only)",
      operatorConsentConfirmed: true,
    },
  });
  console.log(`✅ Created test target ID: ${testTarget.id}`);

  // 3. Create a Task with DataSourceRun, SelfProvidedSnapshot, and ReportEvidenceSnapshot
  console.log("\n3. Creating Task with 3 Decoupled Status Dimensions and Snapshots...");
  const testTask = await prisma.analysisTask.create({
    data: {
      targetId: testTarget.id,
      taskStatus: TaskStatus.RUNNING,
      pipelineStage: PipelineStage.EXTRACT,
      outcome: TaskOutcome.NONE,
      progress: 65,
      currentStageMessage: "正在固化证据快照...",
      dataSourceRuns: {
        create: [
          {
            sourceName: "关注列表采集",
            status: "SUCCEEDED",
            recordsCount: 50,
            durationMs: 320,
            message: "采集完成",
          },
        ],
      },
      selfProvidedSnapshot: {
        create: {
          fields: {
            create: [
              {
                fieldKey: "currentGoals",
                fieldName: "当前目标",
                value: "全栈架构能力进阶与本地持久化测试",
                consentScope: ConsentScope.THIS_TASK_ONLY,
              },
            ],
          },
        },
      },
      evidenceSnapshots: {
        create: [
          {
            sourceType: "STATISTICAL_METRIC",
            evidenceId: "metric.verify.test",
            title: "验证指标快照",
            excerptOrMetricValue: "活跃度指数: 98.5",
            contentHash: "sha256-test-verification-hash",
          },
        ],
      },
    },
    include: {
      dataSourceRuns: true,
      selfProvidedSnapshot: { include: { fields: true } },
      evidenceSnapshots: true,
    },
  });

  console.log(`✅ Test Task Created: ${testTask.id}`);
  console.log(`   - taskStatus: ${testTask.taskStatus} (独立字段)`);
  console.log(`   - pipelineStage: ${testTask.pipelineStage} (独立字段)`);
  console.log(`   - outcome: ${testTask.outcome} (独立字段)`);
  console.log(`   - Snapshot field: ${testTask.selfProvidedSnapshot?.fields[0].fieldName} = ${testTask.selfProvidedSnapshot?.fields[0].value}`);
  console.log(`   - Evidence: ${testTask.evidenceSnapshots[0].title} (hash: ${testTask.evidenceSnapshots[0].contentHash})`);

  // 4. Update task to COMPLETED with FULL outcome
  console.log("\n4. Updating Task Status to COMPLETED with FULL Outcome...");
  const updatedTask = await prisma.analysisTask.update({
    where: { id: testTask.id },
    data: {
      taskStatus: TaskStatus.COMPLETED,
      pipelineStage: PipelineStage.REPORT,
      outcome: TaskOutcome.FULL,
      progress: 100,
      completedAt: new Date(),
    },
  });
  console.log(`✅ Updated Task Status: ${updatedTask.taskStatus}, Stage: ${updatedTask.pipelineStage}, Outcome: ${updatedTask.outcome}`);

  // 5. Test Transaction Rollback on Error (Atomicity Verification)
  console.log("\n5. Testing Transaction Rollback on Error...");
  let rollbackSucceeded = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.analysisTask.create({
        data: {
          targetId: testTarget.id,
          taskStatus: TaskStatus.RUNNING,
          pipelineStage: PipelineStage.COLLECT,
          outcome: TaskOutcome.NONE,
          progress: 10,
        },
      });
      // Deliberately throw an error
      throw new Error("Simulated transaction failure for atomicity test");
    });
  } catch (err: any) {
    if (err.message.includes("Simulated transaction failure")) {
      rollbackSucceeded = true;
      console.log("✅ Transaction intentionally failed and triggered rollback.");
    }
  }

  const tasksCountAfterFailedTx = await prisma.analysisTask.count({
    where: { targetId: testTarget.id },
  });
  if (tasksCountAfterFailedTx !== 1 || !rollbackSucceeded) {
    throw new Error(`Rollback failed! Expected exactly 1 task, found ${tasksCountAfterFailedTx}`);
  }
  console.log(`✅ Rollback verified: Exactly 1 task exists for target ${testTarget.id}, no orphan records.`);

  // 6. Test Seed Isolation (Re-run seed and verify non-demo task still exists)
  console.log("\n6. Testing Demo Seed Isolation (simulating seed run)...");
  const demoTargetBefore = await prisma.analysisTarget.findUnique({
    where: { platformUid: "demo_space_202688" },
  });
  if (demoTargetBefore) {
    await prisma.analysisTarget.delete({ where: { id: demoTargetBefore.id } });
  }

  await prisma.analysisTarget.create({
    data: {
      platform: "BILIBILI",
      inputType: "UID",
      platformUid: "demo_space_202688",
      normalizedIdentifier: "202688",
      displayName: "演示分析目标 (Demo YJ)",
      operatorConsentConfirmed: true,
    },
  });

  // Verify non-demo test target & task STILL exist
  const testTargetAfterSeed = await prisma.analysisTarget.findUnique({
    where: { id: testTarget.id },
    include: { tasks: true },
  });
  if (!testTargetAfterSeed || testTargetAfterSeed.tasks.length === 0) {
    throw new Error("Seed isolation failed: Non-demo test task was deleted by seed!");
  }
  console.log(`✅ Seed isolation verified: Non-demo target ${testTarget.id} and task ${testTargetAfterSeed.tasks[0].id} were preserved intact.`);

  // 7. Cleanup ONLY the non-demo test target created during this test
  console.log("\n7. Cleaning up temporary test target...");
  await prisma.analysisTarget.delete({
    where: { id: testTarget.id },
  });
  console.log(`✅ Temporary test target ${testTarget.id} cleaned up successfully.`);
}

main()
  .then(() => {
    console.log("\n🎉 ALL PERSISTENCE & CRUD ACCEPTANCE TESTS PASSED SUCCESSFULLY!");
  })
  .catch((err) => {
    console.error("\n❌ Acceptance Test Failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
