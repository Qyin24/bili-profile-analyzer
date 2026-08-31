/**
 * BiliProfile Analyzer — Phase 7: Evidence Namespace, Citation Integrity & Exploratory Persona Test Suite
 *
 * Verifies:
 * TEST 1: PROFILE + CONTENT Isolation (PROFILE -> ev_profile_01, CONTENT -> ev_item_01, ev_item_02...)
 * TEST 2: Continuous Content Indexing (8 items -> ev_item_01 ~ ev_item_08 strictly)
 * TEST 3: Valid Evidence passes validator cleanly
 * TEST 4: Dangling Evidence (ev_item_99) fails validator
 * TEST 5: Duplicate Evidence within a finding fails validator
 * TEST 6: Empty Evidence array fails validator
 * TEST 7: PROFILE-only citation on TOPIC_INTERPRETATION fails validator
 * TEST 8: Weak Signal restraint (1 anime / 1 learning item not inflated to lifelong persona)
 * TEST 9: Cross-domain pattern discovery with exact evidence attribution
 * TEST 10: Evidence Drawer content snapshot resolution (title, desc, tags, author, matchedTopics)
 * TEST 11: Evidence Namespace Integrity (ev_profile_* vs ev_item_*)
 * TEST 12: Citation Theater resistance and structural attributions
 */

import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
} from "../../src/lib/processing/pipeline";
import {
  generateMockAiAnalysis,
  validateAiAnalysisResult,
  AiAnalysisResult,
} from "../../src/lib/ai";
import { buildAnalysisViewModel } from "../../src/lib/analysis-view-model";
import { PublicSourceRecord, DeterministicReportInput } from "../../src/types/processing";

async function runEvidenceIntegritySuite() {
  console.log("=================================================");
  console.log("🧪 Phase 7: Evidence 证据链与 AI 人物画像质量深度测试套件");
  console.log("=================================================\n");

  let allPassed = true;

  // -------------------------------------------------------------------------
  // TEST 1: PROFILE + CONTENT 隔离 (PROFILE -> ev_profile_01, CONTENT -> ev_item_01...)
  // -------------------------------------------------------------------------
  console.log("[TEST 1] PROFILE + CONTENT 隔离测试...");
  const recordsWithProfile: PublicSourceRecord[] = [
    {
      sourceRecordId: "prof_01",
      sourceType: "PROFILE",
      title: "测试用户空间",
      description: "这是测试用户的公开个人主页简介",
      tags: [],
    },
    {
      sourceRecordId: "rec_c1",
      sourceType: "CONTENT",
      title: "TypeScript 高级类型系统",
      description: "深入类型体操与工程实战",
      tags: ["科技", "编程", "typescript"],
    },
    {
      sourceRecordId: "rec_c2",
      sourceType: "CONTENT",
      title: "深入浅出大模型 Agent 工作流",
      description: "探讨 Multi-Agent 架构设计",
      tags: ["科技", "AI"],
    },
  ];

  const analysis1 = runDeterministicAnalysis(recordsWithProfile);
  const reportInput1 = buildDeterministicReportInput(analysis1);

  const profileEv = reportInput1.evidence.find((e) => e.id === "ev_profile_01");
  const item1Ev = reportInput1.evidence.find((e) => e.id === "ev_item_01");
  const item2Ev = reportInput1.evidence.find((e) => e.id === "ev_item_02");
  const item0Ev = reportInput1.evidence.find((e) => e.id === "ev_item_00");

  const pass1 =
    profileEv !== undefined &&
    profileEv.type === "PROFILE_ITEM" &&
    item1Ev !== undefined &&
    item1Ev.type === "CONTENT_ITEM" &&
    item1Ev.label.includes("TypeScript") &&
    item2Ev !== undefined &&
    item2Ev.label.includes("大模型") &&
    item0Ev === undefined &&
    reportInput1.contentItems?.length === 2 &&
    reportInput1.contentItems[0].evidenceId === "ev_item_01" &&
    reportInput1.contentItems[0].sourceType === "CONTENT";

  console.log(`  - PROFILE 获得专属 ID (ev_profile_01, type=PROFILE_ITEM): ${profileEv ? "✅" : "❌"}`);
  console.log(`  - CONTENT 从 ev_item_01 开始编号且指向真实内容: ${item1Ev?.label.includes("TypeScript") ? "✅" : "❌"}`);
  console.log(`  - contentItems 中不包含 PROFILE: ${reportInput1.contentItems?.length === 2 ? "✅" : "❌"}`);
  if (!pass1) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 2: 连续内容索引 (8 items -> ev_item_01 ~ ev_item_08, no gaps)
  // -------------------------------------------------------------------------
  console.log("\n[TEST 2] 连续内容索引测试 (8 条内容 strictly ev_item_01 ~ ev_item_08)...");
  const eightContentRecords: PublicSourceRecord[] = [
    { sourceRecordId: "p_1", sourceType: "PROFILE", title: "User Profile", description: "Bio" },
    { sourceRecordId: "c_1", sourceType: "CONTENT", title: "TS Architecture", description: "D1", tags: ["科技"] },
    { sourceRecordId: "c_2", sourceType: "CONTENT", title: "Agent System", description: "D2", tags: ["AI"] },
    { sourceRecordId: "c_3", sourceType: "CONTENT", title: "Zelda Shrine", description: "D3", tags: ["游戏"] },
    { sourceRecordId: "c_4", sourceType: "CONTENT", title: "Black Myth Boss", description: "D4", tags: ["游戏"] },
    { sourceRecordId: "f_1", sourceType: "FOLLOW", title: "Open Source Follow", description: "D5", tags: ["开源"] },
    { sourceRecordId: "f_2", sourceType: "FOLLOW", title: "Hardcore Game Follow", description: "D6", tags: ["单机"] },
    { sourceRecordId: "c_5", sourceType: "CONTENT", title: "Anime Guide", description: "D7", tags: ["动漫"] },
    { sourceRecordId: "c_6", sourceType: "CONTENT", title: "Cognitive Class", description: "D8", tags: ["学习"] },
  ];

  const analysis2 = runDeterministicAnalysis(eightContentRecords);
  const reportInput2 = buildDeterministicReportInput(analysis2);

  const contentItemIds = reportInput2.contentItems?.map((c) => c.evidenceId) ?? [];
  const expectedIds = [
    "ev_item_01",
    "ev_item_02",
    "ev_item_03",
    "ev_item_04",
    "ev_item_05",
    "ev_item_06",
    "ev_item_07",
    "ev_item_08",
  ];

  const pass2 =
    JSON.stringify(contentItemIds) === JSON.stringify(expectedIds) &&
    reportInput2.evidence.some((e) => e.id === "ev_profile_01");

  console.log(`  - 8条记录严格映射 ev_item_01 ~ ev_item_08: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
  if (!pass2) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 3 & 4 & 5 & 6 & 7: Validator Hardening
  // -------------------------------------------------------------------------
  console.log("\n[TEST 3~7] Validator 硬约束校验测试...");

  const validAiResult: AiAnalysisResult = {
    schemaVersion: "ai-analysis-result/v1",
    provider: "MOCK",
    summary: "有效画像分析摘要测试，涵盖了技术与游戏的核心证据。",
    findings: [
      {
        id: "finding_1",
        category: "TOPIC_INTERPRETATION",
        statement: "【工程架构与技术机制】\n\n正文详细分析了 TypeScript 与大模型 Agent 工作流。",
        evidenceIds: ["ev_item_01", "ev_item_02", "ev_topic_tech_ai"],
      },
    ],
    limitations: ["方法论局限性说明"],
  };

  // TEST 3: Valid result
  const val3 = validateAiAnalysisResult(validAiResult, reportInput2);
  console.log(`  - [TEST 3] 合法真实 Evidence 校验通过: ${val3.valid ? "✅ 通过" : "❌ 失败"}`);
  if (!val3.valid) allPassed = false;

  // TEST 4: Dangling Evidence
  const danglingResult: AiAnalysisResult = {
    ...validAiResult,
    findings: [
      {
        id: "finding_dangling",
        category: "TOPIC_INTERPRETATION",
        statement: "引用不存在的证据",
        evidenceIds: ["ev_item_99"],
      },
    ],
  };
  const val4 = validateAiAnalysisResult(danglingResult, reportInput2);
  console.log(`  - [TEST 4] 悬空 Evidence (ev_item_99) 被坚决拦截: ${!val4.valid ? "✅ 成功拦截" : "❌ 未拦截"}`);
  if (val4.valid) allPassed = false;

  // TEST 5: Duplicate Evidence within a single finding
  const duplicateResult: AiAnalysisResult = {
    ...validAiResult,
    findings: [
      {
        id: "finding_dup",
        category: "TOPIC_INTERPRETATION",
        statement: "包含重复证据引用",
        evidenceIds: ["ev_item_01", "ev_item_01"],
      },
    ],
  };
  const val5 = validateAiAnalysisResult(duplicateResult, reportInput2);
  console.log(`  - [TEST 5] 重复 Evidence (ev_item_01 x 2) 被坚决拦截: ${!val5.valid ? "✅ 成功拦截" : "❌ 未拦截"}`);
  if (val5.valid) allPassed = false;

  // TEST 6: Empty Evidence Array
  const emptyEvResult: AiAnalysisResult = {
    ...validAiResult,
    findings: [
      {
        id: "finding_empty",
        category: "TOPIC_INTERPRETATION",
        statement: "缺少证据",
        evidenceIds: [],
      },
    ],
  };
  const val6 = validateAiAnalysisResult(emptyEvResult, reportInput2);
  console.log(`  - [TEST 6] 空 evidenceIds 数组被坚决拦截: ${!val6.valid ? "✅ 成功拦截" : "❌ 未拦截"}`);
  if (val6.valid) allPassed = false;

  // TEST 7: PROFILE-only citation on TOPIC_INTERPRETATION
  const profileOnlyResult: AiAnalysisResult = {
    ...validAiResult,
    findings: [
      {
        id: "finding_profile_only",
        category: "TOPIC_INTERPRETATION",
        statement: "把主页资料当作内容兴趣分析",
        evidenceIds: ["ev_profile_01"],
      },
    ],
  };
  const val7 = validateAiAnalysisResult(profileOnlyResult, reportInput2);
  console.log(`  - [TEST 7] 纯 TOPIC finding 仅引用 ev_profile_01 被拦截: ${!val7.valid ? "✅ 成功拦截" : "❌ 未拦截"}`);
  if (val7.valid) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 8 & 9: Mock Provider Exploratory Persona, Weak Signal Restraint & Cross-Domain
  // -------------------------------------------------------------------------
  console.log("\n[TEST 8~9] Mock Provider 动态画像、弱信号克制与跨领域模式测试...");
  const mockAiOutput = await generateMockAiAnalysis(reportInput2);
  const valMock = validateAiAnalysisResult(mockAiOutput, reportInput2);

  // Check weak signal restraint
  const weakSignalFinding = mockAiOutput.findings.find(
    (f) => f.evidenceIds.includes("ev_item_07") || f.evidenceIds.includes("ev_item_08")
  );
  const weakSignalRestraint =
    weakSignalFinding !== undefined &&
    weakSignalFinding.statement.includes("弱信号") &&
    weakSignalFinding.statement.includes("不足以");

  // Check cross domain pattern
  const crossDomainFinding = mockAiOutput.findings.find(
    (f) =>
      (f.evidenceIds.includes("ev_item_01") || f.evidenceIds.includes("ev_item_02")) &&
      (f.evidenceIds.includes("ev_item_03") || f.evidenceIds.includes("ev_item_04"))
  );
  const crossDomainValid =
    crossDomainFinding !== undefined &&
    crossDomainFinding.statement.includes("跨领域") &&
    crossDomainFinding.statement.includes("规则");

  console.log(`  - [TEST 8] 弱信号审慎克制（单条动漫/学习不升级为稳定人格）: ${weakSignalRestraint ? "✅" : "❌"}`);
  console.log(`  - [TEST 9] 跨领域规则解构洞察（代码系统+游戏机制并置）: ${crossDomainValid ? "✅" : "❌"}`);
  console.log(`  - Mock 生成结果完整通过严格校验器: ${valMock.valid ? "✅" : "❌"}`);
  if (!valMock.valid || !weakSignalRestraint || !crossDomainValid) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 10: Evidence Drawer Snapshot Resolution (Analysis View Model)
  // -------------------------------------------------------------------------
  console.log("\n[TEST 10] Evidence Drawer 内容快照解析测试...");
  const mockTask: any = {
    id: "task_test_01",
    targetId: "target_01",
    target: { displayName: "测试UP主", platformUid: "123456" },
    taskStatus: "COMPLETED",
    pipelineStage: "REPORT",
    progress: 100,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  const mockDetReportResponse: any = {
    taskId: "task_test_01",
    artifactId: "det_art_01",
    schemaVersion: "deterministic-report/v1",
    taxonomyVersion: "1.0.0",
    report: reportInput2,
  };

  const mockAiResponse: any = {
    taskId: "task_test_01",
    artifactId: "ai_art_01",
    schemaVersion: "ai-analysis-result/v1",
    provider: "MOCK",
    analysis: mockAiOutput,
  };

  const viewModel = buildAnalysisViewModel(mockTask, mockDetReportResponse, mockAiResponse);

  const pass10 =
    viewModel.type === "SUCCESS" &&
    viewModel.deterministicReport.contentItemsMap["ev_item_01"] !== undefined &&
    viewModel.deterministicReport.contentItemsMap["ev_item_01"].title === "TS Architecture" &&
    viewModel.deterministicReport.contentItemsMap["ev_item_01"].description === "D1" &&
    viewModel.deterministicReport.contentItemsMap["ev_item_01"].tags.includes("科技") &&
    viewModel.deterministicReport.evidenceMap["ev_profile_01"] !== undefined;

  console.log(`  - View-Model 成功装配 contentItemsMap 与 evidenceMap: ${pass10 ? "✅" : "❌"}`);
  if (!pass10) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 11: Evidence Namespace Integrity (PROFILE vs CONTENT)
  // -------------------------------------------------------------------------
  console.log("\n[TEST 11] Evidence Namespace 完整性验证...");
  const allEvKeys = Object.keys(viewModel.type === "SUCCESS" ? viewModel.deterministicReport.evidenceMap : {});
  const profileKeys = allEvKeys.filter((k) => k.startsWith("ev_profile_"));
  const itemKeys = allEvKeys.filter((k) => k.startsWith("ev_item_"));

  const pass11 = profileKeys.length === 1 && itemKeys.length === 8;
  console.log(`  - 命名空间完全隔离 (Profile Keys: ${profileKeys.length}, Item Keys: ${itemKeys.length}): ${pass11 ? "✅" : "❌"}`);
  if (!pass11) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 12: Citation Theater Regression
  // -------------------------------------------------------------------------
  console.log("\n[TEST 12] Citation Theater 结构与归因校验测试...");
  let citationAttributionClean = true;
  for (const finding of mockAiOutput.findings) {
    // Ensure every cited ev_item_* is valid and has matching content in context
    for (const evId of finding.evidenceIds) {
      if (evId.startsWith("ev_item_")) {
        const item = reportInput2.contentItems?.find((c) => c.evidenceId === evId);
        if (!item) {
          citationAttributionClean = false;
        }
      }
    }
  }

  console.log(`  - 全部 finding 的 evidenceIds 均有真实 ContentItem 锚定: ${citationAttributionClean ? "✅" : "❌"}`);
  if (!citationAttributionClean) allPassed = false;

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 Phase 7 全部 12 项测试用例全部顺利通过！");
    console.log("=================================================");
  } else {
    console.error("❌ Phase 7 测试存在失败项，请检查！");
    process.exit(1);
  }
}

runEvidenceIntegritySuite().catch((err) => {
  console.error("测试执行异常:", err);
  process.exit(1);
});
