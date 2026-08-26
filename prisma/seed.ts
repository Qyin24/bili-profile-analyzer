import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting idempotent demo seeding for Phase 5.0...");

  const DEMO_UID = "demo_space_202688";

  // Only locate and delete the specific demo target and its cascading tasks/dataSourceRuns
  const existingDemoTarget = await prisma.analysisTarget.findUnique({
    where: { platformUid: DEMO_UID },
  });

  if (existingDemoTarget) {
    await prisma.analysisTarget.delete({
      where: { id: existingDemoTarget.id },
    });
    console.log(`Cleaned previous demo target: ${existingDemoTarget.displayName} (UID: ${DEMO_UID})`);
  }

  // Create demo target
  const target = await prisma.analysisTarget.create({
    data: {
      platform: "BILIBILI",
      platformUid: DEMO_UID,
      displayName: "演示分析目标 (Demo YJ)",
    },
  });

  console.log(`Created target: ${target.displayName} (ID: ${target.id})`);

  // Ensure default SelfProvidedProfile exists
  let selfProfile = await prisma.selfProvidedProfile.findFirst({
    include: { fields: true },
  });

  if (!selfProfile) {
    selfProfile = await prisma.selfProvidedProfile.create({
      data: {
        fields: {
          create: [
            {
              fieldName: "currentGoals",
              value: "希望梳理近期的科技学习脉络，构建系统化的全栈 AI 知识体系",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldName: "learningDirections",
              value: "大模型应用架构、全栈工程、数据可视化、系统设计",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldName: "careerOrMajor",
              value: "软件工程师 / 终身学习者",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldName: "interestTags",
              value: "开源生态, 开发者工具, 人工智能, 界面美学",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldName: "questionsForAnalysis",
              value: "我的内容关注重点是否过度集中？有哪些前沿方向值得拓展？",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldName: "additionalContext",
              value: "用于本地学习偏好探索，不包含私密敏感数据",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
          ],
        },
      },
      include: { fields: true },
    });
    console.log(`Created default local SelfProvidedProfile (ID: ${selfProfile.id})`);
  }

  // Task 1: COMPLETED with outcome = FULL and SelfProvidedSnapshot
  const task1 = await prisma.analysisTask.create({
    data: {
      targetId: target.id,
      taskStatus: "COMPLETED",
      pipelineStage: "REPORT",
      outcome: "FULL",
      progress: 100,
      currentStageMessage: "示例分析报告已生成并固化演示快照",
      completedAt: new Date("2026-08-25T10:15:02Z"),
      createdAt: new Date("2026-08-25T10:14:20Z"),
      dataSourceRuns: {
        create: [
          { sourceName: "演示基础资料", status: "SUCCEEDED", recordsCount: 1, message: "演示基础信息准备完成" },
          { sourceName: "演示关注样本", status: "SUCCEEDED", recordsCount: 99, message: "加载 99 条模拟关注样本" },
          { sourceName: "演示动态样本", status: "SUCCEEDED", recordsCount: 18, message: "加载 18 条模拟动态样本" },
        ],
      },
      selfProvidedSnapshot: {
        create: {
          fields: {
            create: [
              {
                fieldName: "currentGoals",
                value: "希望梳理近期的科技学习脉络，构建系统化的全栈 AI 知识体系",
                consentScope: "PERSISTENT_ACROSS_TASKS",
              },
              {
                fieldName: "learningDirections",
                value: "大模型应用架构、全栈工程、数据可视化、系统设计",
                consentScope: "PERSISTENT_ACROSS_TASKS",
              },
              {
                fieldName: "careerOrMajor",
                value: "软件工程师 / 终身学习者",
                consentScope: "PERSISTENT_ACROSS_TASKS",
              },
            ],
          },
        },
      },
    },
  });

  console.log(`Created Task 1 (FULL) with Snapshot: ID ${task1.id}`);

  // Task 2: COMPLETED with outcome = PARTIAL (Degradation mode)
  const task2 = await prisma.analysisTask.create({
    data: {
      targetId: target.id,
      taskStatus: "COMPLETED",
      pipelineStage: "REPORT",
      outcome: "PARTIAL",
      progress: 100,
      currentStageMessage: "演示降级完成（模拟关注列表私密，基于模拟动态与自述生成）",
      completedAt: new Date("2026-08-22T16:30:45Z"),
      createdAt: new Date("2026-08-22T16:30:10Z"),
      dataSourceRuns: {
        create: [
          { sourceName: "演示基础资料", status: "SUCCEEDED", recordsCount: 1, message: "演示基础信息准备完成" },
          { sourceName: "演示关注样本", status: "SKIPPED_UNAVAILABLE", recordsCount: 0, message: "模拟关注私密，已跳过" },
          { sourceName: "演示动态样本", status: "SUCCEEDED", recordsCount: 18, message: "加载 18 条模拟动态样本" },
        ],
      },
    },
  });

  console.log(`Created Task 2 (PARTIAL): ID ${task2.id}`);

  // Task 3: CANCELLED with outcome = NONE
  const task3 = await prisma.analysisTask.create({
    data: {
      targetId: target.id,
      taskStatus: "CANCELLED",
      pipelineStage: "COLLECT",
      outcome: "NONE",
      progress: 15,
      currentStageMessage: "用户手动取消了任务",
      createdAt: new Date("2026-08-21T09:00:00Z"),
    },
  });

  console.log(`Created Task 3 (CANCELLED): ID ${task3.id}`);

  console.log("✅ Seeding completed successfully without affecting non-demo targets!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
