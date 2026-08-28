import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting idempotent demo seeding for Phase 3.1...");

  // 1. Seed Controlled TopicTaxonomy
  const taxonomies = [
    {
      code: "TECH_DIGITAL",
      name: "技术与数码",
      color: "#4E878C",
      description: "软件工程、计算机系统、数码硬件评测与前沿科技",
      version: "1.0.0",
    },
    {
      code: "KNOWLEDGE_EDU",
      name: "知识学习",
      color: "#D4A373",
      description: "学科辅导、公开课、英语提升、方法论与学术科普",
      version: "1.0.0",
    },
    {
      code: "ENTERTAINMENT",
      name: "影视娱乐",
      color: "#9C7A97",
      description: "电影解说、动画动漫、剧集讨论与流行文化",
      version: "1.0.0",
    },
    {
      code: "LIFESTYLE",
      name: "生活方式",
      color: "#C27D66",
      description: "居家好物、美食烹饪、旅行记录与日常随笔",
      version: "1.0.0",
    },
    {
      code: "MUSIC_ART",
      name: "音乐艺术",
      color: "#6D9DC5",
      description: "指弹吉他、乐理精讲、现场演出与视听艺术",
      version: "1.0.0",
    },
    {
      code: "SPORTS",
      name: "体育运动",
      color: "#5B8E7D",
      description: "羽毛球战术步伐、体能训练与赛事分析",
      version: "1.0.0",
    },
  ];

  for (const tax of taxonomies) {
    await prisma.topicTaxonomy.upsert({
      where: { code: tax.code },
      update: {
        name: tax.name,
        color: tax.color,
        description: tax.description,
        version: tax.version,
        isEnabled: true,
      },
      create: {
        code: tax.code,
        name: tax.name,
        color: tax.color,
        description: tax.description,
        version: tax.version,
        isEnabled: true,
      },
    });
  }
  console.log(`✅ Seeded ${taxonomies.length} TopicTaxonomies.`);

  // 2. Seed Fictional Demo AnalysisTarget
  const DEMO_UID = "demo_space_202688";

  const existingDemoTarget = await prisma.analysisTarget.findUnique({
    where: { platformUid: DEMO_UID },
  });

  if (existingDemoTarget) {
    await prisma.analysisTarget.delete({
      where: { id: existingDemoTarget.id },
    });
    console.log(`Cleaned previous demo target: ${existingDemoTarget.displayName} (UID: ${DEMO_UID})`);
  }

  const target = await prisma.analysisTarget.create({
    data: {
      platform: "BILIBILI",
      inputType: "UID",
      platformUid: DEMO_UID,
      normalizedIdentifier: "202688",
      displayName: "演示分析目标 (Demo YJ)",
      operatorConsentConfirmed: true,
    },
  });
  console.log(`✅ Created demo target: ${target.displayName} (ID: ${target.id})`);

  // 3. Ensure Default SelfProvidedProfile exists with 6 fields
  let selfProfile = await prisma.selfProvidedProfile.findFirst({
    include: { fields: true },
  });

  if (!selfProfile) {
    selfProfile = await prisma.selfProvidedProfile.create({
      data: {
        fields: {
          create: [
            {
              fieldKey: "currentGoals",
              fieldName: "当前目标",
              value: "希望梳理近期的科技学习脉络，构建系统化的全栈 AI 知识体系",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldKey: "learningDirections",
              fieldName: "学习方向",
              value: "大模型应用架构, 全栈工程, 数据可视化, 系统设计",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldKey: "careerOrMajor",
              fieldName: "专业职业",
              value: "软件工程师 / 终身学习者",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldKey: "interestTags",
              fieldName: "兴趣标签",
              value: "开源生态, 开发者工具, 人工智能, 界面美学",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldKey: "questionsForAnalysis",
              fieldName: "分析问题",
              value: "我的内容关注重点是否过度集中？有哪些前沿方向值得拓展？",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
            {
              fieldKey: "additionalContext",
              fieldName: "补充背景",
              value: "用于本地学习偏好探索，不包含私密敏感数据",
              allowedForAnalysis: true,
              consentScope: "PERSISTENT_ACROSS_TASKS",
            },
          ],
        },
      },
      include: { fields: true },
    });
    console.log(`✅ Created default local SelfProvidedProfile (ID: ${selfProfile.id})`);
  }

  // 4. Seed 1 Demo AnalysisTask (COMPLETED / REPORT / FULL)
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
          { sourceName: "演示基础资料", status: "SUCCEEDED", recordsCount: 1, durationMs: 180, message: "演示基础信息准备完成" },
          { sourceName: "演示关注样本", status: "SUCCEEDED", recordsCount: 99, durationMs: 820, message: "演示关注条目处理完毕" },
          { sourceName: "演示动态样本", status: "SUCCEEDED", recordsCount: 18, durationMs: 460, message: "演示动态样本处理完毕" },
        ],
      },
      selfProvidedSnapshot: {
        create: {
          fields: {
            create: [
              {
                fieldKey: "currentGoals",
                fieldName: "当前目标",
                value: "希望梳理近期的科技学习脉络，构建系统化的全栈 AI 知识体系",
                consentScope: "PERSISTENT_ACROSS_TASKS",
              },
              {
                fieldKey: "learningDirections",
                fieldName: "学习方向",
                value: "大模型应用架构, 全栈工程, 数据可视化, 系统设计",
                consentScope: "PERSISTENT_ACROSS_TASKS",
              },
            ],
          },
        },
      },
      evidenceSnapshots: {
        create: [
          {
            sourceType: "SELF_REPORTED",
            evidenceId: "self_profile.currentGoals",
            title: "示例自述目标",
            excerptOrMetricValue: "希望梳理近期的科技学习脉络，构建系统化的全栈 AI 知识体系",
            contentHash: "sha256-a9f8b2c1d3...",
          },
          {
            sourceType: "STATISTICAL_METRIC",
            evidenceId: "metric.topic.TECH_DIGITAL",
            title: "技术与数码分类统计",
            excerptOrMetricValue: "关注条目数: 28 人, 占比: 28.3%",
            contentHash: "sha256-b7e4f1a2c9...",
          },
        ],
      },
    },
  });

  console.log(`✅ Seeded demo task: ${task1.id} for target ${target.displayName}`);
  console.log("🎉 Idempotent demo seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
