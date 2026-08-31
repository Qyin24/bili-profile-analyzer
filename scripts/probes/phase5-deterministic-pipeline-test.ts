/**
 * BiliProfile Analyzer — Phase 5.2.2 Deterministic Pipeline & Report Input Verification Suite
 *
 * Verifies:
 * a. Strict determinism: identical input yields identical output.
 * b. Blank/invalid records safely dropped and correctly tracked in diagnostics.
 * c. Duplicate sourceRecordIds are deduplicated.
 * d. Tags and text keywords generate traceable EvidenceRef.
 * e. Unmatched content remains unclassified (zero hallucination).
 * f. PARTIAL and UNAVAILABLE sources preserve incomplete source diagnostics (even with analyzable text).
 * g. Topic shares sum correctly (sum = 1.0) and zero-sample inputs never produce NaN or Infinity.
 * h. Shannon entropy ground truth math verification.
 * i. Zero network calls (fetch count is 0).
 * j. Output contains zero self-profile fields.
 *
 * Phase 5.2.1 Additions:
 * k. Single record matching multiple topics ("游戏" + "动漫") ratio precision.
 * l. Multiple multi-topic records: assert sum(topicDistribution[].share) == 1.0 (+-0.0001).
 * m. PARTIAL record with valid analyzable tags still produces SOURCE_DATA_PARTIAL warning.
 * n. UNAVAILABLE record with valid analyzable text still produces SOURCE_DATA_UNAVAILABLE warning.
 * o. Invalid sourceType does not enter CONTENT, does not enter sourceCoverage, and logs INVALID_SOURCE_TYPE code.
 * p. Explicit invalid availability (e.g. "BOGUS") and invalid observedAt log stable diagnostics.
 * q. Unique sentinel body text is never leaked into output JSON.
 *
 * Phase 5.2.2 Additions (Report Input & Evidence Package):
 * r. Identical DeterministicAnalysisResult builds deeply equal DeterministicReportInput.
 * s. Output is JSON-serializable with zero NaN / Infinity.
 * t. Every observation references valid, existing evidence IDs (zero dangling references).
 * u. Topic distribution, top topic, and diversity observations trace back to evidence with exact unit "比例（0–1）".
 * v. Zero-sample / unclassified-only inputs produce clear limitations and no false conclusions, with accurate sample phrasing.
 * w. PARTIAL / UNAVAILABLE sources reliably generate source limitation observations.
 * x. Sentinel strings and self-profile fields are never leaked into report input.
 * y. Validator explicitly catches and rejects illegal report inputs (dangling evidence, duplicates, non-finite numbers, bad schemaVersion).
 * z1. Quality warning message sentinel text is never propagated to report input (code only).
 * z2. Pure INVALID_OBSERVED_AT generates DATA_QUALITY observation and does NOT generate SOURCE_LIMITATION.
 * z3. Validator strictly rejects illegal category, illegal type, non-scalar value, invalid unit, and invalid sourceKey.
 */

import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
  validateDeterministicReportInput,
} from "../../src/lib/processing/pipeline";
import {
  PublicSourceRecord,
  DeterministicReportInput,
  DeterministicAnalysisResult,
  REPORT_INPUT_SCHEMA_VERSION,
} from "../../src/types/processing";
import { TAXONOMY_VERSION } from "../../src/lib/processing/taxonomy";

async function runPipelineVerification() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 5.2.2 确定性报告输入与证据包测试");
  console.log("=================================================\n");

  let allPassed = true;

  // Intercept global fetch to strictly ensure zero network activity
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: unknown[]) => {
    fetchCallCount++;
    throw new Error("Pipeline test violation: network fetch attempted!");
  };

  try {
    // --- Test Data Fixtures ---
    const sampleRecords: PublicSourceRecord[] = [
      {
        sourceRecordId: "vid_101",
        sourceType: "CONTENT",
        title: "黑神话悟空全章节速通实况解说",
        description: "挑战全流程无伤通关攻略，单机动作RPG巅峰体验",
        tags: ["游戏", "单机游戏", "黑神话", "速通"],
        authorName: "游戏攻略君",
        sourceUrl: "https://example.com/video/101",
        availability: "AVAILABLE",
      },
      {
        sourceRecordId: "vid_102",
        sourceType: "CONTENT",
        title: "2026年最新AI大模型架构与TypeScript开发实战",
        description: "深入剖析深度学习与人工智能前端框架编程",
        tags: ["科技", "AI", "人工智能", "编程", "typescript"],
        authorName: "科技前沿社",
        sourceUrl: "https://example.com/video/102",
        availability: "AVAILABLE",
      },
      {
        sourceRecordId: "fol_201",
        sourceType: "FOLLOW",
        title: "动漫番剧推荐与新番漫评",
        description: "专注二次元国创、漫画手办与声优专栏",
        tags: ["动漫", "番剧", "新番"],
        authorName: "新番导航员",
        sourceUrl: "https://example.com/space/201",
        availability: "AVAILABLE",
      },
      {
        sourceRecordId: "fol_202",
        sourceType: "FOLLOW",
        title: "吉他弹唱与流行音乐编曲教学",
        description: "分享乐器演奏、翻唱与经典歌曲精选",
        tags: ["音乐", "吉他", "流行音乐"],
        authorName: "音乐工坊",
        sourceUrl: "https://example.com/space/202",
        availability: "AVAILABLE",
      },
      {
        sourceRecordId: "fol_203",
        sourceType: "FOLLOW",
        title: "高效自学方法论与读书成长笔记",
        description: "科学思维模型与认知升级自学教程",
        tags: ["学习", "成长", "思维", "科普"],
        authorName: "思维进阶馆",
        sourceUrl: "https://example.com/space/203",
        availability: "AVAILABLE",
      },
      {
        sourceRecordId: "fol_204",
        sourceType: "FOLLOW",
        title: "纯手工木工与户外露营日常记录",
        description: "山野生活、做饭烹饪与萌宠生活记录",
        tags: ["生活", "日常", "美食", "露营"],
        authorName: "山居日记",
        sourceUrl: "https://example.com/space/204",
        availability: "AVAILABLE",
      },
    ];

    // --- Test a: Strict Determinism ---
    console.log("[测试 a] 严格确定性：同一输入多次运行输出完全一致...");
    const resA1 = runDeterministicAnalysis(sampleRecords);
    const resA2 = runDeterministicAnalysis(sampleRecords);
    const jsonA1 = JSON.stringify(resA1);
    const jsonA2 = JSON.stringify(resA2);
    const passA = jsonA1 === jsonA2 && resA1.topicDistribution.length > 0;
    console.log(`  - 两次独立执行的序列化 JSON 完全匹配: ${passA ? "✅ 通过" : "❌ 失败"}`);
    if (!passA) allPassed = false;

    // --- Test b: Safe Drop of Invalid/Blank Records ---
    console.log("\n[测试 b] 无效/空白记录安全过滤与 Diagnostics 统计...");
    const malformedInput: PublicSourceRecord[] = [
      null as any,
      { sourceType: "CONTENT", sourceRecordId: "" } as any, // Missing sourceRecordId
      { sourceRecordId: "blank_1", sourceType: "CONTENT", title: "", description: "", tags: [], availability: "AVAILABLE" },
      { sourceRecordId: "valid_1", sourceType: "CONTENT", title: "正常原神游戏攻略", tags: ["游戏"] },
    ];
    const resB = runDeterministicAnalysis(malformedInput);
    const passB =
      resB.diagnostics.inputCount === 4 &&
      resB.diagnostics.droppedInvalidCount === 3 &&
      resB.recordCounts.analyzed === 1 &&
      resB.diagnostics.dropReasons.some((r) => r.code === "MISSING_SOURCE_RECORD_ID") &&
      resB.diagnostics.dropReasons.some((r) => r.code === "NO_ANALYZABLE_TEXT");
    console.log(`  - 无效记录已拦截 (droppedCount=${resB.diagnostics.droppedInvalidCount}): ${passB ? "✅ 通过" : "❌ 失败"}`);
    if (!passB) allPassed = false;

    // --- Test c: Deduplication by (sourceType + sourceRecordId) ---
    console.log("\n[测试 c] 重复来源记录基于 (sourceType + sourceRecordId) 去重...");
    const duplicateInput: PublicSourceRecord[] = [
      { sourceRecordId: "dup_101", sourceType: "CONTENT", title: "原神游戏视频 A", tags: ["游戏"] },
      { sourceRecordId: "dup_101", sourceType: "CONTENT", title: "原神游戏视频 B（重复）", tags: ["游戏"] },
      { sourceRecordId: "dup_101", sourceType: "FOLLOW", title: "同名博主（不同类型保留）", tags: ["游戏"] },
    ];
    const resC = runDeterministicAnalysis(duplicateInput);
    const passC =
      resC.diagnostics.deduplicatedCount === 1 &&
      resC.diagnostics.cleanedCount === 2 &&
      resC.diagnostics.dropReasons.some((r) => r.code === "DUPLICATE_RECORD");
    console.log(`  - 重复记录去重成功 (dedupCount=${resC.diagnostics.deduplicatedCount}, cleaned=${resC.diagnostics.cleanedCount}): ${passC ? "✅ 通过" : "❌ 失败"}`);
    if (!passC) allPassed = false;

    // --- Test d: Traceable EvidenceRef for TAG and KEYWORD ---
    console.log("\n[测试 d] 标签 (TAG) 与文本关键词 (KEYWORD) 均产生可追溯 EvidenceRef...");
    const mixedMatchInput: PublicSourceRecord[] = [
      {
        sourceRecordId: "tag_sample",
        sourceType: "CONTENT",
        title: "无相关标题",
        tags: ["动漫"],
        sourceUrl: "https://example.com/anime",
      },
      {
        sourceRecordId: "kw_sample",
        sourceType: "CONTENT",
        title: "深度探讨人工智能的前沿发展",
        tags: ["未分类标签"],
        sourceUrl: "https://example.com/tech",
      },
    ];
    const resD = runDeterministicAnalysis(mixedMatchInput);
    const tagEvidence = resD.evidenceRefs.find((e) => e.matchType === "TAG" && e.matchedTopicId === "anime");
    const kwEvidence = resD.evidenceRefs.find((e) => (e.matchType === "KEYWORD" || e.matchType === "TITLE" || e.matchType === "DESCRIPTION") && e.matchedTopicId === "tech_ai");
    const passD =
      tagEvidence !== undefined &&
      tagEvidence.sourceRecordId === "tag_sample" &&
      kwEvidence !== undefined &&
      kwEvidence.sourceRecordId === "kw_sample";
    console.log(`  - TAG 证据追溯: ${tagEvidence ? "✅" : "❌"} (term=${tagEvidence?.matchedTerm})`);
    console.log(`  - KEYWORD/TITLE 证据追溯: ${kwEvidence ? "✅" : "❌"} (term=${kwEvidence?.matchedTerm})`);
    if (!passD) allPassed = false;

    // --- Test e: Zero Hallucination (Unmatched remains UNCLASSIFIED) ---
    console.log("\n[测试 e] 未命中词表的记录保持未分类（零幻觉、不强行归类）...");
    const unclassifiedInput: PublicSourceRecord[] = [
      {
        sourceRecordId: "unclass_1",
        sourceType: "CONTENT",
        title: "一些完全生僻专有名词的未知文本 xyz123",
        description: "没有任何主题关键词匹配",
        tags: ["abcdefg"],
      },
    ];
    const resE = runDeterministicAnalysis(unclassifiedInput);
    const passE =
      resE.recordCounts.unclassified === 1 &&
      resE.topicDistribution.length === 0 &&
      resE.recordCounts.analyzed === 0;
    console.log(`  - 未分类统计准确: unclassified=${resE.recordCounts.unclassified}: ${passE ? "✅ 通过" : "❌ 失败"}`);
    if (!passE) allPassed = false;

    // --- Test f: PARTIAL / UNAVAILABLE sources diagnostic preservation ---
    console.log("\n[测试 f] PARTIAL 与 UNAVAILABLE 状态保留数据不足说明...");
    const partialInput: PublicSourceRecord[] = [
      {
        sourceRecordId: "part_1",
        sourceType: "FOLLOW",
        availability: "PARTIAL",
        title: "受限的关注列表",
      },
      {
        sourceRecordId: "unavail_1",
        sourceType: "PROFILE",
        availability: "UNAVAILABLE",
      },
    ];
    const resF = runDeterministicAnalysis(partialInput);
    const passF =
      resF.diagnostics.sourceTypeStats.FOLLOW.partial === 1 &&
      resF.diagnostics.sourceTypeStats.PROFILE.unavailable === 1 &&
      resF.diagnostics.qualityWarnings.some((w) => w.code === "SOURCE_DATA_PARTIAL") &&
      resF.diagnostics.qualityWarnings.some((w) => w.code === "SOURCE_DATA_UNAVAILABLE");
    console.log(`  - 受限来源诊断标记完整保留: ${passF ? "✅ 通过" : "❌ 失败"}`);
    if (!passF) allPassed = false;

    // --- Test g: Topic share sums and zero-sample safety (No NaN / Infinity) ---
    console.log("\n[测试 g] 空输入与零样本安全计算（无 NaN / Infinity）...");
    const resEmpty = runDeterministicAnalysis([]);
    const passGEmpty =
      !isNaN(resEmpty.diversityMetrics.shannonEntropy) &&
      !isNaN(resEmpty.diversityMetrics.normalizedEntropy) &&
      !isNaN(resEmpty.diversityMetrics.topTopicShare) &&
      isFinite(resEmpty.diversityMetrics.shannonEntropy) &&
      isFinite(resEmpty.diversityMetrics.normalizedEntropy) &&
      resEmpty.diversityMetrics.diversityLevel === "INSUFFICIENT_DATA";
    console.log(`  - 空输入防 NaN/Infinity: ${passGEmpty ? "✅ 通过" : "❌ 失败"}`);
    if (!passGEmpty) allPassed = false;

    // --- Test h: Shannon Entropy Ground Truth Math Verification ---
    console.log("\n[测试 h] 已知小样本 Shannon Entropy 与 Normalized Entropy 数值验证...");
    const evenRecords: PublicSourceRecord[] = [
      { sourceRecordId: "g1", sourceType: "CONTENT", tags: ["游戏"] },
      { sourceRecordId: "g2", sourceType: "CONTENT", tags: ["游戏"] },
      { sourceRecordId: "t1", sourceType: "CONTENT", tags: ["科技"] },
      { sourceRecordId: "t2", sourceType: "CONTENT", tags: ["科技"] },
      { sourceRecordId: "a1", sourceType: "CONTENT", tags: ["动漫"] },
      { sourceRecordId: "a2", sourceType: "CONTENT", tags: ["动漫"] },
    ];
    const resH = runDeterministicAnalysis(evenRecords);
    const expectedEntropy = Number(Math.log(3).toFixed(4));
    const passH =
      resH.diversityMetrics.topicCount === 3 &&
      Math.abs(resH.diversityMetrics.shannonEntropy - expectedEntropy) < 0.001 &&
      resH.diversityMetrics.normalizedEntropy === 1.0 &&
      resH.diversityMetrics.diversityLevel === "HIGH";
    console.log(`  - 理论熵=${expectedEntropy}, 计算熵=${resH.diversityMetrics.shannonEntropy}, 归一化熵=${resH.diversityMetrics.normalizedEntropy} (等级: ${resH.diversityMetrics.diversityLevel}): ${passH ? "✅ 通过" : "❌ 失败"}`);
    if (!passH) allPassed = false;

    // --- Test i: Zero Network Fetch Calls ---
    console.log("\n[测试 i] 全流程零外部网络请求断言...");
    const passI = fetchCallCount === 0;
    console.log(`  - fetch 调用总数: ${fetchCallCount} -> ${passI ? "✅ 通过" : "❌ 失败"}`);
    if (!passI) allPassed = false;

    // --- Test j: Zero Self-Profile / Secret Leakage in Output ---
    console.log("\n[测试 j] 结果输出中绝不包含自述字段与长文本泄露...");
    const resultJson = JSON.stringify(resA1);
    const passJ =
      !resultJson.includes("currentGoals") &&
      !resultJson.includes("learningDirections") &&
      !resultJson.includes("customPrompt") &&
      !resultJson.includes("SnapshotField") &&
      resA1.taxonomyVersion === TAXONOMY_VERSION;
    console.log(`  - 输出干净脱敏且包含版本号 (${resA1.taxonomyVersion}): ${passJ ? "✅ 通过" : "❌ 失败"}`);
    if (!passJ) allPassed = false;

    // =========================================================================
    // --- Phase 5.2.1 Regression Tests ---
    // =========================================================================
    console.log("\n[Phase 5.2.1 专项回归测试]");

    // --- Test k: Single Record Matching Multiple Topics ("游戏" + "动漫") ---
    console.log("\n[测试 k] 单条记录命中多主题 (游戏 + 动漫) 统计口径精确验证...");
    const multiTopicSingleRecord: PublicSourceRecord[] = [
      {
        sourceRecordId: "multi_1",
        sourceType: "CONTENT",
        title: "动漫番剧与主机游戏双重体验",
        tags: ["游戏", "动漫"],
      },
    ];
    const resK = runDeterministicAnalysis(multiTopicSingleRecord);
    const gameTopic = resK.topicDistribution.find((t) => t.topicId === "games");
    const animeTopic = resK.topicDistribution.find((t) => t.topicId === "anime");
    const sumShareK = resK.topicDistribution.reduce((acc, t) => acc + t.share, 0);
    const expectedEntropyK = Number(Math.log(2).toFixed(4)); // ln(2) ≈ 0.6931

    const passK =
      resK.topicDistribution.length === 2 &&
      gameTopic?.recordCount === 1 &&
      Math.abs((gameTopic?.share ?? 0) - 0.5) <= 0.0001 &&
      animeTopic?.recordCount === 1 &&
      Math.abs((animeTopic?.share ?? 0) - 0.5) <= 0.0001 &&
      Math.abs(sumShareK - 1.0) <= 0.0001 &&
      Math.abs(resK.diversityMetrics.topTopicShare - 0.5) <= 0.0001 &&
      Math.abs(resK.diversityMetrics.shannonEntropy - expectedEntropyK) <= 0.001 &&
      resK.diversityMetrics.normalizedEntropy === 1.0;

    console.log(`  - 游戏 share=${gameTopic?.share}, 动漫 share=${animeTopic?.share}, share 总和=${sumShareK}`);
    console.log(`  - topTopicShare=${resK.diversityMetrics.topTopicShare}, entropy=${resK.diversityMetrics.shannonEntropy}, normEntropy=${resK.diversityMetrics.normalizedEntropy}`);
    console.log(`  - 多主题单记录口径判定: ${passK ? "✅ 通过" : "❌ 失败"}`);
    if (!passK) allPassed = false;

    // --- Test l: Multiple Multi-Topic Records (Sum of shares = 1.0) ---
    console.log("\n[测试 l] 复杂多条多主题样本占比总和精确为 1.0 (<= 0.0001)...");
    const complexMultiRecords: PublicSourceRecord[] = [
      { sourceRecordId: "c1", sourceType: "CONTENT", tags: ["游戏", "动漫", "音乐"] },
      { sourceRecordId: "c2", sourceType: "CONTENT", tags: ["科技", "学习"] },
      { sourceRecordId: "c3", sourceType: "FOLLOW", tags: ["生活", "美食", "体育"] },
      { sourceRecordId: "c4", sourceType: "FOLLOW", tags: ["财经", "商业"] },
      { sourceRecordId: "c5", sourceType: "CONTENT", tags: ["娱乐", "电影"] },
    ];
    const resL = runDeterministicAnalysis(complexMultiRecords);
    const sumShareL = resL.topicDistribution.reduce((acc, t) => acc + t.share, 0);
    const passL = Math.abs(sumShareL - 1.0) <= 0.0001;
    console.log(`  - 主题总数=${resL.topicDistribution.length}, 占比总和=${sumShareL.toFixed(6)}: ${passL ? "✅ 通过" : "❌ 失败"}`);
    if (!passL) allPassed = false;

    // --- Test m: PARTIAL with Analyzable Tags Still Produces Warning ---
    console.log("\n[测试 m] PARTIAL 来源即便带有效标签也必产生 SOURCE_DATA_PARTIAL 警告...");
    const partialWithTags: PublicSourceRecord[] = [
      {
        sourceRecordId: "part_valid_tag",
        sourceType: "CONTENT",
        availability: "PARTIAL",
        tags: ["游戏", "黑神话"],
      },
    ];
    const resM = runDeterministicAnalysis(partialWithTags);
    const passM =
      resM.diagnostics.qualityWarnings.some((w) => w.code === "SOURCE_DATA_PARTIAL") &&
      resM.diagnostics.sourceTypeStats.CONTENT.partial === 1;
    console.log(`  - PARTIAL 质量警告生成: ${passM ? "✅ 通过" : "❌ 失败"}`);
    if (!passM) allPassed = false;

    // --- Test n: UNAVAILABLE with Analyzable Text Still Produces Warning ---
    console.log("\n[测试 n] UNAVAILABLE 来源即便带文本也必产生 SOURCE_DATA_UNAVAILABLE 警告...");
    const unavailWithText: PublicSourceRecord[] = [
      {
        sourceRecordId: "unavail_text",
        sourceType: "PROFILE",
        availability: "UNAVAILABLE",
        title: "不可用账号的残余文本",
      },
    ];
    const resN = runDeterministicAnalysis(unavailWithText);
    const passN =
      resN.diagnostics.qualityWarnings.some((w) => w.code === "SOURCE_DATA_UNAVAILABLE") &&
      resN.diagnostics.sourceTypeStats.PROFILE.unavailable === 1;
    console.log(`  - UNAVAILABLE 质量警告生成: ${passN ? "✅ 通过" : "❌ 失败"}`);
    if (!passN) allPassed = false;

    // --- Test o: Invalid sourceType Rejected (No Silent Fallback to CONTENT) ---
    console.log("\n[测试 o] 非法 sourceType 被严格丢弃 (不静默降级为 CONTENT)...");
    const invalidSourceTypeInput: PublicSourceRecord[] = [
      {
        sourceRecordId: "bogus_st_1",
        sourceType: "BOGUS_TYPE" as any,
        title: "非法类型测试视频",
        tags: ["游戏"],
      },
      {
        sourceRecordId: "bogus_st_2",
        sourceType: undefined as any,
        title: "缺少类型测试视频",
        tags: ["游戏"],
      },
    ];
    const resO = runDeterministicAnalysis(invalidSourceTypeInput);
    const contentCoverage = resO.sourceCoverage.find((sc) => sc.sourceType === "CONTENT");
    const passO =
      resO.diagnostics.droppedInvalidCount === 2 &&
      contentCoverage?.recordCount === 0 &&
      resO.diagnostics.dropReasons.some((r) => r.code === "INVALID_SOURCE_TYPE");
    console.log(`  - 非法 sourceType 拦截 (dropped=${resO.diagnostics.droppedInvalidCount}, CONTENT count=${contentCoverage?.recordCount}): ${passO ? "✅ 通过" : "❌ 失败"}`);
    if (!passO) allPassed = false;

    // --- Test p: Explicit Invalid Availability and Invalid observedAt Diagnostics ---
    console.log("\n[测试 p] 显式非法 availability 丢弃拦截与非法 observedAt 归一化诊断...");
    const invalidFieldsInput: PublicSourceRecord[] = [
      {
        sourceRecordId: "inv_avail_1",
        sourceType: "CONTENT",
        availability: "INVALID_STATUS" as any,
        tags: ["游戏"],
      },
      {
        sourceRecordId: "inv_date_1",
        sourceType: "CONTENT",
        observedAt: "invalid-date",
        tags: ["动漫"],
      },
    ];
    const resP = runDeterministicAnalysis(invalidFieldsInput);
    const passP =
      resP.diagnostics.dropReasons.some((r) => r.code === "INVALID_AVAILABILITY") &&
      resP.diagnostics.qualityWarnings.some((w) => w.code === "INVALID_OBSERVED_AT");
    console.log(`  - 非法 availability 与 observedAt 诊断生成: ${passP ? "✅ 通过" : "❌ 失败"}`);
    if (!passP) allPassed = false;

    // --- Test q: Sentinel Long Body Text Zero Leakage ---
    console.log("\n[测试 q] 强化验证：超长正文敏感文本绝不泄露至输出 JSON...");
    const SENTINEL_SECRET = "SENTINEL_LONG_BODY_SECRET_9876543210_PRIVATE_CONTENT";
    const sentinelInput: PublicSourceRecord[] = [
      {
        sourceRecordId: "sentinel_rec_1",
        sourceType: "CONTENT",
        title: "普通科技视频",
        description: `这是一篇包含保密正文的长文本说明：${SENTINEL_SECRET}，用于测试输出脱敏`,
        tags: ["科技", "人工智能"],
      },
    ];
    const resQ = runDeterministicAnalysis(sentinelInput);
    const repSentinelQ = buildDeterministicReportInput(resQ);
    const jsonQ = JSON.stringify(repSentinelQ);
    const passQ = !jsonQ.includes(SENTINEL_SECRET);
    console.log(`  - 哨兵文本零泄露验证 (${SENTINEL_SECRET.slice(0, 20)}...): ${passQ ? "✅ 通过" : "❌ 失败"}`);
    if (!passQ) allPassed = false;

    // =========================================================================
    // --- Phase 5.2.2 Dedicated Report Input & Evidence Package Tests ---
    // =========================================================================
    console.log("\n[Phase 5.2.2 报告输入与证据包专项测试]");

    // --- Test r: Identical DeterministicAnalysisResult builds deeply equal DeterministicReportInput ---
    console.log("\n[测试 r] 相同分析结果多次构建报告输入，深度相等且确定性...");
    const repR1 = buildDeterministicReportInput(resA1);
    const repR2 = buildDeterministicReportInput(resA1);
    const jsonR1 = JSON.stringify(repR1);
    const jsonR2 = JSON.stringify(repR2);
    const valR1 = validateDeterministicReportInput(repR1);
    const passR = jsonR1 === jsonR2 && valR1.valid && repR1.schemaVersion === REPORT_INPUT_SCHEMA_VERSION;
    console.log(`  - 多次构建 JSON 深度相等: ${jsonR1 === jsonR2 ? "✅" : "❌"}, 校验结果: ${valR1.valid ? "✅" : "❌"}`);
    if (!passR) allPassed = false;

    // --- Test s: Output is JSON-serializable with zero NaN / Infinity ---
    console.log("\n[测试 s] 输出完全可 JSON 序列化，且绝无 NaN / Infinity...");
    const valS = validateDeterministicReportInput(repR1);
    const passS =
      valS.valid &&
      !jsonR1.includes("NaN") &&
      !jsonR1.includes("Infinity") &&
      !jsonR1.includes("-Infinity");
    console.log(`  - 无 NaN/Infinity 且通过校验: ${passS ? "✅ 通过" : "❌ 失败"}`);
    if (!passS) allPassed = false;

    // --- Test t: Every observation references existing evidence IDs (Zero Dangling) ---
    console.log("\n[测试 t] 每个 observation 必须引用实际存在的 evidenceId（无悬空引用）...");
    const evIdSet = new Set(repR1.evidence.map((e) => e.id));
    const allRefsExist = repR1.observations.every(
      (obs) => obs.evidenceIds.length > 0 && obs.evidenceIds.every((id) => evIdSet.has(id))
    );
    console.log(`  - 观察项数量: ${repR1.observations.length}, 证据项数量: ${repR1.evidence.length}`);
    console.log(`  - 所有观察引用的证据全部存在: ${allRefsExist ? "✅ 通过" : "❌ 失败"}`);
    if (!allRefsExist) allPassed = false;

    // --- Test u: Traceable Evidence for Top Topic, Distribution, Diversity with exact unit semantics ---
    console.log("\n[测试 u] 修复验证：主题分布、最高主题和多样性观察均精准追溯至对应证据，且单位为'比例（0–1）'...");
    const obsTop = repR1.observations.find((o) => o.category === "TOP_TOPIC");
    const obsDist = repR1.observations.find((o) => o.category === "TOPIC_DISTRIBUTION");
    const obsDiv = repR1.observations.find((o) => o.category === "DIVERSITY");
    const evTopShare = repR1.evidence.find((e) => e.id === "ev_top_topic_share");
    const evNormEntropy = repR1.evidence.find((e) => e.id === "ev_norm_entropy");

    // obsDist must exist and reference at least one valid TOPIC_SHARE evidence
    const obsDistEvidences = obsDist
      ? obsDist.evidenceIds.map((id) => repR1.evidence.find((e) => e.id === id))
      : [];
    const hasTopicShareEv = obsDistEvidences.some(
      (ev) => ev !== undefined && ev.type === "TOPIC_SHARE"
    );

    // Validate TOPIC_SHARE unit and value
    const allTopicShareUnitsValid = repR1.evidence
      .filter((e) => e.type === "TOPIC_SHARE")
      .every((e) => e.unit === "比例（0–1）");

    const allTopicShareValuesMatch = resA1.topicDistribution.every((topic) => {
      const matchedEv = repR1.evidence.find((e) => e.id === `ev_topic_${topic.topicId}`);
      return matchedEv !== undefined && matchedEv.value === topic.share;
    });

    const passU =
      obsTop !== undefined &&
      obsDist !== undefined &&
      obsDiv !== undefined &&
      evTopShare !== undefined &&
      evNormEntropy !== undefined &&
      obsTop.evidenceIds.includes("ev_top_topic_share") &&
      obsDiv.evidenceIds.includes("ev_norm_entropy") &&
      hasTopicShareEv &&
      allTopicShareUnitsValid &&
      allTopicShareValuesMatch &&
      evTopShare.value === resA1.diversityMetrics.topTopicShare &&
      evTopShare.unit === "比例（0–1）";

    console.log(`  - 最高主题引用 ev_top_topic_share: ${obsTop?.evidenceIds.includes("ev_top_topic_share") ? "✅" : "❌"}`);
    console.log(`  - 最高主题证据数值与单位正确 (${evTopShare?.value}, unit=${evTopShare?.unit}): ${evTopShare?.value === resA1.diversityMetrics.topTopicShare && evTopShare?.unit === "比例（0–1）" ? "✅" : "❌"}`);
    console.log(`  - 多样性观察引用 ev_norm_entropy: ${obsDiv?.evidenceIds.includes("ev_norm_entropy") ? "✅" : "❌"}`);
    console.log(`  - 主题分布引用 TOPIC_SHARE 证据: ${hasTopicShareEv ? "✅" : "❌"}`);
    console.log(`  - TOPIC_SHARE 全部单位为'比例（0–1）'且数值匹配: ${allTopicShareUnitsValid && allTopicShareValuesMatch ? "✅" : "❌"}`);
    console.log(`  - 核心指标可追溯性综合判定: ${passU ? "✅ 通过" : "❌ 失败"}`);
    if (!passU) allPassed = false;

    // --- Test v: Zero-Sample / Unclassified Inputs produce limitations, accurate sample phrasing, and no false conclusions ---
    console.log("\n[测试 v] 零样本/纯未分类输入产生局限性说明、准确样本规模文案，杜绝虚假偏好...");
    const repEmpty = buildDeterministicReportInput(resEmpty);
    const valEmpty = validateDeterministicReportInput(repEmpty);
    const obsNoTopicEmpty = repEmpty.observations.find((o) => o.id === "obs_no_topic");
    const hasFalseTopic = repEmpty.observations.some((o) => o.id === "obs_top_topic");

    // Test with legal but unclassified input (resE)
    const repE = buildDeterministicReportInput(resE);
    const valE = validateDeterministicReportInput(repE);
    const obsSampleE = repE.observations.find((o) => o.id === "obs_sample_size");
    const obsNoTopicE = repE.observations.find((o) => o.id === "obs_no_topic");
    const samplePhrasingCorrect = obsSampleE?.statement.includes("0 条产生有效主题匹配并进入主题统计");

    const passV =
      valEmpty.valid &&
      obsNoTopicEmpty !== undefined &&
      !hasFalseTopic &&
      repEmpty.limitations.length > 0 &&
      valE.valid &&
      obsNoTopicE !== undefined &&
      samplePhrasingCorrect === true;

    console.log(`  - 零样本报告校验: ${valEmpty.valid ? "✅" : "❌"}, 杜绝虚假最高主题: ${!hasFalseTopic ? "✅" : "❌"}`);
    console.log(`  - 未分类输入报告校验: ${valE.valid ? "✅" : "❌"}, 包含 obs_no_topic: ${obsNoTopicE ? "✅" : "❌"}`);
    console.log(`  - 样本规模准确文案判定 (${obsSampleE?.statement}): ${samplePhrasingCorrect ? "✅ 通过" : "❌ 失败"}`);
    if (!passV) allPassed = false;

    // --- Test w: PARTIAL / UNAVAILABLE sources reliably generate source limitation observations ---
    console.log("\n[测试 w] 带 PARTIAL / UNAVAILABLE 质量信号时稳定产生来源受限说明...");
    const repF = buildDeterministicReportInput(resF);
    const valF = validateDeterministicReportInput(repF);
    const obsLimitation = repF.observations.find((o) => o.category === "SOURCE_LIMITATION");
    const evPartial = repF.evidence.find((e) => e.type === "SOURCE_STATUS");
    const passW =
      valF.valid &&
      obsLimitation !== undefined &&
      evPartial !== undefined &&
      obsLimitation.evidenceIds.includes(evPartial.id);
    console.log(`  - 来源受限观察项: ${obsLimitation ? "✅" : "❌"}, 受限证据项: ${evPartial ? "✅" : "❌"}, 追溯一致: ${passW ? "✅ 通过" : "❌ 失败"}`);
    if (!passW) allPassed = false;

    // --- Test x: Sentinel Long Body Text & Self-Profile Zero Leakage into Report Input ---
    console.log("\n[测试 x] 强化验证：哨兵字符串与自述字段绝不泄露至报告输入对象...");
    const repQ = buildDeterministicReportInput(resQ);
    const jsonRepQ = JSON.stringify(repQ);
    const valQ = validateDeterministicReportInput(repQ);
    const passX =
      valQ.valid &&
      !jsonRepQ.includes(SENTINEL_SECRET) &&
      !jsonRepQ.includes("currentGoals") &&
      !jsonRepQ.includes("learningDirections") &&
      !jsonRepQ.includes("customPrompt") &&
      !jsonRepQ.includes("SnapshotField");
    console.log(`  - 报告输入脱敏与零泄露验证: ${passX ? "✅ 通过" : "❌ 失败"}`);
    if (!passX) allPassed = false;

    // --- Test y: Validator explicitly rejects illegal report inputs ---
    console.log("\n[测试 y] 校验器能明确拦截非法报告输入（悬空证据引用、重复ID、非有限数值、非法版本）...");

    // Case 1: Dangling evidence ID
    const badInput1: DeterministicReportInput = {
      ...repR1,
      observations: [
        {
          id: "obs_dangling",
          category: "TOPIC_DISTRIBUTION",
          statement: "测试悬空引用",
          evidenceIds: ["ev_non_existent_id_999"],
        },
      ],
    };
    const valBad1 = validateDeterministicReportInput(badInput1);

    // Case 2: Duplicate evidence ID
    const badInput2: DeterministicReportInput = {
      ...repR1,
      evidence: [
        ...repR1.evidence,
        { ...repR1.evidence[0] }, // duplicate ID
      ],
    };
    const valBad2 = validateDeterministicReportInput(badInput2);

    // Case 3: Non-finite number in evidence (NaN)
    const badInput3: DeterministicReportInput = {
      ...repR1,
      evidence: [
        {
          id: "ev_nan",
          type: "METRIC",
          label: "非法数值",
          value: NaN,
        },
      ],
      observations: [
        {
          id: "obs_nan",
          category: "TOPIC_DISTRIBUTION",
          statement: "非法数值测试",
          evidenceIds: ["ev_nan"],
        },
      ],
    };
    const valBad3 = validateDeterministicReportInput(badInput3);

    // Case 4: Invalid schemaVersion
    const badInput4: DeterministicReportInput = {
      ...repR1,
      schemaVersion: "invalid-version-v999" as any,
    };
    const valBad4 = validateDeterministicReportInput(badInput4);

    const passY =
      !valBad1.valid &&
      valBad1.errors.some((e) => e.includes("不存在于 evidence 列表中")) &&
      !valBad2.valid &&
      valBad2.errors.some((e) => e.includes("重复的 evidence id")) &&
      !valBad3.valid &&
      valBad3.errors.some((e) => e.includes("非有限数值")) &&
      !valBad4.valid &&
      valBad4.errors.some((e) => e.includes("schemaVersion 非法"));

    console.log(`  - 悬空证据拦截: ${!valBad1.valid ? "✅" : "❌"}`);
    console.log(`  - 重复ID拦截: ${!valBad2.valid ? "✅" : "❌"}`);
    console.log(`  - 非有限数值拦截: ${!valBad3.valid ? "✅" : "❌"}`);
    console.log(`  - 非法schemaVersion拦截: ${!valBad4.valid ? "✅" : "❌"}`);
    console.log(`  - 校验器防御能力综合判定: ${passY ? "✅ 通过" : "❌ 失败"}`);
    if (!passY) allPassed = false;

    // --- Test z1: Quality Warning Message Sentinel String Never Propagates ---
    console.log("\n[测试 z1] 强化验证：qualityWarning.message 哨兵字符串绝不带入报告输入对象...");
    const SENTINEL_WARN_MSG = "SENTINEL_DIRTY_WARNING_MSG_9988776655_SECRET";
    const syntheticWarnResult: DeterministicAnalysisResult = {
      ...resA1,
      diagnostics: {
        ...resA1.diagnostics,
        qualityWarnings: [
          {
            code: "INVALID_OBSERVED_AT",
            message: SENTINEL_WARN_MSG,
          },
        ],
      },
    };
    const repZ1 = buildDeterministicReportInput(syntheticWarnResult);
    const jsonRepZ1 = JSON.stringify(repZ1);
    const passZ1 =
      !jsonRepZ1.includes(SENTINEL_WARN_MSG) &&
      repZ1.evidence.some((e) => e.id === "ev_warn_invalid_observed_at" && e.value === "INVALID_OBSERVED_AT");
    console.log(`  - qualityWarning.message 零泄露验证 (${SENTINEL_WARN_MSG.slice(0, 20)}...): ${passZ1 ? "✅ 通过" : "❌ 失败"}`);
    if (!passZ1) allPassed = false;

    // --- Test z2: Pure INVALID_OBSERVED_AT generates DATA_QUALITY and NOT SOURCE_LIMITATION ---
    console.log("\n[测试 z2] 纯时间格式警告仅生成 DATA_QUALITY，绝不误生成 SOURCE_LIMITATION...");
    const pureTimeWarnResult: DeterministicAnalysisResult = {
      ...resA1,
      diagnostics: {
        ...resA1.diagnostics,
        sourceTypeStats: {
          PROFILE: { total: 1, available: 1, partial: 0, unavailable: 0 },
          CONTENT: { total: 4, available: 4, partial: 0, unavailable: 0 },
          FAVORITE: { total: 0, available: 0, partial: 0, unavailable: 0 },
          LIKE: { total: 0, available: 0, partial: 0, unavailable: 0 },
          FOLLOW: { total: 1, available: 1, partial: 0, unavailable: 0 },
        },
        qualityWarnings: [
          {
            code: "INVALID_OBSERVED_AT",
            message: "时间格式非法",
          },
        ],
      },
    };
    const repZ2 = buildDeterministicReportInput(pureTimeWarnResult);
    const valZ2 = validateDeterministicReportInput(repZ2);
    const hasDataQuality = repZ2.observations.some((o) => o.category === "DATA_QUALITY");
    const hasSourceLimitation = repZ2.observations.some((o) => o.category === "SOURCE_LIMITATION");
    const passZ2 = valZ2.valid && hasDataQuality && !hasSourceLimitation;
    console.log(`  - 生成 DATA_QUALITY 观察: ${hasDataQuality ? "✅" : "❌"}, 杜绝误生成 SOURCE_LIMITATION: ${!hasSourceLimitation ? "✅" : "❌"}`);
    if (!passZ2) allPassed = false;

    // --- Test z3: Strict Whitelist & Scalar Validation in validateDeterministicReportInput ---
    console.log("\n[测试 z3] 校验器严密拒绝非法 category、非法 type、非标量 value 与非字符串元数据 (包含 sourceKey)...");

    // Case a: Illegal Observation Category
    const badCatReport: DeterministicReportInput = {
      ...repR1,
      observations: [{ ...repR1.observations[0], category: "BOGUS_CATEGORY" as any }],
    };
    const valBadCat = validateDeterministicReportInput(badCatReport);

    // Case b: Illegal Evidence Type
    const badTypeReport: DeterministicReportInput = {
      ...repR1,
      evidence: [{ ...repR1.evidence[0], type: "BOGUS_TYPE" as any }],
    };
    const valBadType = validateDeterministicReportInput(badTypeReport);

    // Case c: Null / Object / Array Evidence Value
    const badValueReport1: DeterministicReportInput = {
      ...repR1,
      evidence: [{ ...repR1.evidence[0], value: null as any }],
    };
    const valBadVal1 = validateDeterministicReportInput(badValueReport1);

    const badValueReport2: DeterministicReportInput = {
      ...repR1,
      evidence: [{ ...repR1.evidence[0], value: { nested: "object" } as any }],
    };
    const valBadVal2 = validateDeterministicReportInput(badValueReport2);

    const badValueReport3: DeterministicReportInput = {
      ...repR1,
      evidence: [{ ...repR1.evidence[0], value: ["array"] as any }],
    };
    const valBadVal3 = validateDeterministicReportInput(badValueReport3);

    // Case d: Non-string unit
    const badUnitReport: DeterministicReportInput = {
      ...repR1,
      evidence: [{ ...repR1.evidence[0], unit: 12345 as any }],
    };
    const valBadUnit = validateDeterministicReportInput(badUnitReport);

    // Case e: Non-string sourceKey
    const badSourceKeyReport: DeterministicReportInput = {
      ...repR1,
      evidence: [{ ...repR1.evidence[0], sourceKey: 12345 as any }],
    };
    const valBadSourceKey = validateDeterministicReportInput(badSourceKeyReport);

    // Case f: Non-string in limitations or warningCodes
    const badLimReport: DeterministicReportInput = {
      ...repR1,
      limitations: ["正常文本", 99999 as any],
    };
    const valBadLim = validateDeterministicReportInput(badLimReport);

    const badCodeReport: DeterministicReportInput = {
      ...repR1,
      diagnosticsSummary: {
        ...repR1.diagnosticsSummary,
        warningCodes: ["VALID_CODE", 88888 as any],
      },
    };
    const valBadCode = validateDeterministicReportInput(badCodeReport);

    const passZ3 =
      !valBadCat.valid && valBadCat.errors.some((e) => e.includes("category 'BOGUS_CATEGORY' 非法")) &&
      !valBadType.valid && valBadType.errors.some((e) => e.includes("type 'BOGUS_TYPE' 非法")) &&
      !valBadVal1.valid && valBadVal1.errors.some((e) => e.includes("value 为 null 或 undefined")) &&
      !valBadVal2.valid && valBadVal2.errors.some((e) => e.includes("必须为标量")) &&
      !valBadVal3.valid && valBadVal3.errors.some((e) => e.includes("必须为标量")) &&
      !valBadUnit.valid && valBadUnit.errors.some((e) => e.includes("unit 必须为字符串")) &&
      !valBadSourceKey.valid && valBadSourceKey.errors.some((e) => e.includes("sourceKey 必须为字符串")) &&
      !valBadLim.valid && valBadLim.errors.some((e) => e.includes("limitations[1] 必须为字符串")) &&
      !valBadCode.valid && valBadCode.errors.some((e) => e.includes("diagnosticsSummary.warningCodes[1] 必须为字符串"));

    console.log(`  - 非法 category 拦截: ${!valBadCat.valid ? "✅" : "❌"}`);
    console.log(`  - 非法 type 拦截: ${!valBadType.valid ? "✅" : "❌"}`);
    console.log(`  - 非标量 value (null/obj/arr) 拦截: ${!valBadVal1.valid && !valBadVal2.valid && !valBadVal3.valid ? "✅" : "❌"}`);
    console.log(`  - 非字符串 unit 拦截: ${!valBadUnit.valid ? "✅" : "❌"}`);
    console.log(`  - 非字符串 sourceKey 拦截: ${!valBadSourceKey.valid ? "✅" : "❌"}`);
    console.log(`  - 非字符串 limitations/codes 拦截: ${!valBadLim.valid && !valBadCode.valid ? "✅" : "❌"}`);
    console.log(`  - 严格校验器综合防御判定: ${passZ3 ? "✅ 通过" : "❌ 失败"}`);
    if (!passZ3) allPassed = false;

    // --- Test z4: Strict Rejection of Any Unknown or Extra Fields (Phase 5.2.3.2) ---
    console.log("\n[测试 z4] 严格结构校验：严密拒绝根对象、观察项、证据项及诊断摘要中的任何未知多余字段...");

    // Extra field in root object
    const extraRootReport = {
      ...repR1,
      unknownRootProp: "EXTRA_ROOT_VALUE",
    };
    const valExtraRoot = validateDeterministicReportInput(extraRootReport);

    // Extra field in observation
    const extraObsReport = {
      ...repR1,
      observations: [
        {
          ...repR1.observations[0],
          unknownObsProp: "EXTRA_OBS_VALUE",
        },
      ],
    };
    const valExtraObs = validateDeterministicReportInput(extraObsReport);

    // Extra field in evidence
    const extraEvReport = {
      ...repR1,
      evidence: [
        {
          ...repR1.evidence[0],
          unknownEvProp: "EXTRA_EV_VALUE",
        },
      ],
    };
    const valExtraEv = validateDeterministicReportInput(extraEvReport);

    // Extra field in diagnosticsSummary
    const extraDsReport = {
      ...repR1,
      diagnosticsSummary: {
        ...repR1.diagnosticsSummary,
        unknownDsProp: "EXTRA_DS_VALUE",
      },
    };
    const valExtraDs = validateDeterministicReportInput(extraDsReport);

    const passZ4 =
      !valExtraRoot.valid && valExtraRoot.errors.some((e) => e.includes("根对象包含未知或非法的多余字段: 'unknownRootProp'")) &&
      !valExtraObs.valid && valExtraObs.errors.some((e) => e.includes("包含未知或非法的多余字段: 'unknownObsProp'")) &&
      !valExtraEv.valid && valExtraEv.errors.some((e) => e.includes("包含未知或非法的多余字段: 'unknownEvProp'")) &&
      !valExtraDs.valid && valExtraDs.errors.some((e) => e.includes("diagnosticsSummary 包含未知或非法的多余字段: 'unknownDsProp'"));

    console.log(`  - 根对象未知字段拦截: ${!valExtraRoot.valid ? "✅" : "❌"}`);
    console.log(`  - observation 未知字段拦截: ${!valExtraObs.valid ? "✅" : "❌"}`);
    console.log(`  - evidence 未知字段拦截: ${!valExtraEv.valid ? "✅" : "❌"}`);
    console.log(`  - diagnosticsSummary 未知字段拦截: ${!valExtraDs.valid ? "✅" : "❌"}`);
    console.log(`  - 严格未知字段白名单防御综合判定: ${passZ4 ? "✅ 通过" : "❌ 失败"}`);
    if (!passZ4) allPassed = false;

    console.log("\n=================================================");
    if (allPassed) {
      console.log("🎉 Phase 5.2.2 & 5.2.3.2 确定性报告输入与证据包测试全部通过！");
      console.log("=================================================\n");
    } else {
      console.error("❌ 部分确定性流水线或报告输入测试未通过，请检查。");
      console.log("=================================================\n");
      process.exit(1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runPipelineVerification().catch((err) => {
  console.error("确定性流水线验证脚本异常:", err);
  process.exit(1);
});
