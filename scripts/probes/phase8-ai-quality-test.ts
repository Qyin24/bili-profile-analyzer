/**
 * BiliProfile Analyzer — Phase 8: AI Persona Reasoning Quality & Multi-Tier Epistemic Probe
 *
 * Verifies:
 * TEST 1: Strong Signal Cross-Domain Pattern Discovery (Tech + Hardcore Games -> Mechanism Deconstruction)
 * TEST 2: Weak Signal Restraint (1 Anime -> Localized observation, strictly no "二次元人格")
 * TEST 3: Disconfirming Evidence Awareness (Tech + Casual Entertainment -> Multi-track reality acknowledged)
 * TEST 4: Source & Temporal Independence (Single author / same day clustering recognized as burst interest)
 * TEST 5: Unknown / Dispersed Input Handling (Random topics -> acknowledges traces insufficient for stable hypothesis)
 * TEST 6: Minimal Sufficient Evidence Alignment (Zero dangling, zero duplicates, non-empty, strict alignment)
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
import { PublicSourceRecord } from "../../src/types/processing";

async function runPhase8QualityProbe() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 8: AI 人物画像推理质量与认识论探针测试");
  console.log("=================================================\n");

  let allPassed = true;

  // -------------------------------------------------------------------------
  // TEST 1: 强信号跨领域模式提炼
  // -------------------------------------------------------------------------
  console.log("[TEST 1] 强信号跨领域模式提炼测试 (技术 + 硬核单机游戏)...");
  const recordsTest1: PublicSourceRecord[] = [
    { sourceRecordId: "t1", sourceType: "CONTENT", title: "TypeScript 高级类型与架构设计实战指南", tags: ["科技", "编程", "typescript"] },
    { sourceRecordId: "t2", sourceType: "CONTENT", title: "深入浅出大模型架构与 Agent 工作流系统", tags: ["科技", "AI", "agent"] },
    { sourceRecordId: "g1", sourceType: "CONTENT", title: "塞尔达传说王国之泪：海拉鲁全神庙解谜与路线推荐", tags: ["游戏", "单机", "解谜"] },
    { sourceRecordId: "g2", sourceType: "CONTENT", title: "黑神话悟空全隐藏 Boss 机制打法全解析", tags: ["游戏", "单机", "boss"] },
  ];

  const analysis1 = runDeterministicAnalysis(recordsTest1);
  const input1 = buildDeterministicReportInput(analysis1);
  const aiOutput1 = await generateMockAiAnalysis(input1);
  const val1 = validateAiAnalysisResult(aiOutput1, input1);

  const crossDomainFinding = aiOutput1.findings.find(
    (f) =>
      f.statement.includes("跨领域") ||
      f.statement.includes("机制") ||
      f.statement.includes("系统") ||
      f.statement.includes("解构")
  );

  const pass1 =
    val1.valid &&
    crossDomainFinding !== undefined &&
    !crossDomainFinding.statement.includes("二次元人格") &&
    crossDomainFinding.evidenceIds.length >= 2;

  console.log(`  - 契约验证合法: ${val1.valid ? "✅" : "❌"}`);
  console.log(`  - 成功发现跨领域共同机制与规则解构线索: ${crossDomainFinding ? "✅" : "❌"}`);
  if (!pass1) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 2: 弱信号动漫不人格化
  // -------------------------------------------------------------------------
  console.log("\n[TEST 2] 弱信号动漫审慎克制测试 (单条新番导视)...");
  const recordsTest2: PublicSourceRecord[] = [
    { sourceRecordId: "a1", sourceType: "CONTENT", title: "2026年夏季新番导视与口碑动画推荐", tags: ["动漫", "动画", "新番"] },
  ];

  const analysis2 = runDeterministicAnalysis(recordsTest2);
  const input2 = buildDeterministicReportInput(analysis2);
  const aiOutput2 = await generateMockAiAnalysis(input2);
  const val2 = validateAiAnalysisResult(aiOutput2, input2);

  const findingText2 = aiOutput2.findings.map((f) => f.statement).join("\n");
  const summaryText2 = aiOutput2.summary;
  const fullText2 = `${summaryText2}\n${findingText2}`;

  const noPersonalityLabel =
    !fullText2.includes("二次元人格") &&
    !fullText2.includes("资深二次元") &&
    !fullText2.includes("长期动漫爱好者");

  const recognizesWeakSignal =
    fullText2.includes("弱信号") ||
    fullText2.includes("局部") ||
    fullText2.includes("不足以判断") ||
    fullText2.includes("偶发");

  const pass2 = val2.valid && noPersonalityLabel && recognizesWeakSignal;
  console.log(`  - 契约验证合法: ${val2.valid ? "✅" : "❌"}`);
  console.log(`  - 杜绝单样本人格化 (无二次元人格定性): ${noPersonalityLabel ? "✅" : "❌"}`);
  console.log(`  - 明确指出弱信号局限性与观察边界: ${recognizesWeakSignal ? "✅" : "❌"}`);
  if (!pass2) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 3: 反证与矛盾共存
  // -------------------------------------------------------------------------
  console.log("\n[TEST 3] 反证场景测试 (深度技术 + 轻松娱乐碎片内容)...");
  const recordsTest3: PublicSourceRecord[] = [
    { sourceRecordId: "t1", sourceType: "CONTENT", title: "TypeScript 高级类型系统工程实战", tags: ["科技", "编程"] },
    { sourceRecordId: "t2", sourceType: "CONTENT", title: "深入浅出 Transformer 核心机制", tags: ["科技", "AI"] },
    { sourceRecordId: "c1", sourceType: "CONTENT", title: "搞笑日常轻松一刻短视频精选", tags: ["生活", "搞笑", "短视频"] },
    { sourceRecordId: "c2", sourceType: "CONTENT", title: "周末美食探店与娱乐吐槽", tags: ["生活", "娱乐", "美食"] },
  ];

  const analysis3 = runDeterministicAnalysis(recordsTest3);
  const input3 = buildDeterministicReportInput(analysis3);
  const aiOutput3 = await generateMockAiAnalysis(input3);
  const val3 = validateAiAnalysisResult(aiOutput3, input3);

  const fullText3 = `${aiOutput3.summary}\n${aiOutput3.findings.map((f) => f.statement).join("\n")}`;
  const acknowledgesDisconfirming =
    fullText3.includes("反证") ||
    fullText3.includes("反例") ||
    fullText3.includes("双轨") ||
    fullText3.includes("松紧") ||
    fullText3.includes("不能简单用单一");

  const pass3 = val3.valid && acknowledgesDisconfirming;
  console.log(`  - 契约验证合法: ${val3.valid ? "✅" : "❌"}`);
  console.log(`  - 成功捕获娱乐碎片反证并主动修正单一假说: ${acknowledgesDisconfirming ? "✅" : "❌"}`);
  if (!pass3) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 4: 时间与来源独立性审视
  // -------------------------------------------------------------------------
  console.log("\n[TEST 4] 来源与时间聚集性测试 (同一作者同日集中发布)...");
  const recordsTest4: PublicSourceRecord[] = [
    { sourceRecordId: "s1", sourceType: "CONTENT", title: "系统架构第1讲", tags: ["科技"], authorName: "架构大牛", observedAt: "2026-08-30 10:00" },
    { sourceRecordId: "s2", sourceType: "CONTENT", title: "系统架构第2讲", tags: ["科技"], authorName: "架构大牛", observedAt: "2026-08-30 10:00" },
    { sourceRecordId: "s3", sourceType: "CONTENT", title: "系统架构第3讲", tags: ["科技"], authorName: "架构大牛", observedAt: "2026-08-30 10:00" },
  ];

  const analysis4 = runDeterministicAnalysis(recordsTest4);
  const input4 = buildDeterministicReportInput(analysis4);
  const aiOutput4 = await generateMockAiAnalysis(input4);
  const val4 = validateAiAnalysisResult(aiOutput4, input4);

  const fullText4 = `${aiOutput4.summary}\n${aiOutput4.findings.map((f) => f.statement).join("\n")}`;
  const recognizesClustering =
    fullText4.includes("聚集") ||
    fullText4.includes("同源") ||
    fullText4.includes("集中") ||
    fullText4.includes("阶段性") ||
    fullText4.includes("独立性");

  const pass4 = val4.valid && recognizesClustering;
  console.log(`  - 契约验证合法: ${val4.valid ? "✅" : "❌"}`);
  console.log(`  - 识别同源/集中爆发特征（不简单等同于独立重复证据）: ${recognizesClustering ? "✅" : "❌"}`);
  if (!pass4) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 5: Unknown / 随机发散无模式
  // -------------------------------------------------------------------------
  console.log("\n[TEST 5] 允许不知道 (Unknown) 随机离散样本测试...");
  const recordsTest5: PublicSourceRecord[] = [
    { sourceRecordId: "r1", sourceType: "CONTENT", title: "汽车发动机火花塞更换教程", tags: ["汽车"] },
    { sourceRecordId: "r2", sourceType: "CONTENT", title: "阳台多肉植物无土栽培修剪指南", tags: ["园艺"] },
    { sourceRecordId: "r3", sourceType: "CONTENT", title: "中东古代历史通识小故事", tags: ["人文"] },
  ];

  const analysis5 = runDeterministicAnalysis(recordsTest5);
  const input5 = buildDeterministicReportInput(analysis5);
  const aiOutput5 = await generateMockAiAnalysis(input5);
  const val5 = validateAiAnalysisResult(aiOutput5, input5);

  const fullText5 = `${aiOutput5.summary}\n${aiOutput5.findings.map((f) => f.statement).join("\n")}`;
  const allowsUnknown =
    fullText5.includes("不足以") ||
    fullText5.includes("离散") ||
    fullText5.includes("发散") ||
    fullText5.includes("缺乏") ||
    fullText5.includes("克制");

  const pass5 = val5.valid && allowsUnknown;
  console.log(`  - 契约验证合法: ${val5.valid ? "✅" : "❌"}`);
  console.log(`  - 离散数据下主动保持克制并承认不确定性: ${allowsUnknown ? "✅" : "❌"}`);
  if (!pass5) allPassed = false;

  // -------------------------------------------------------------------------
  // TEST 6: Evidence 对齐与最小充分性
  // -------------------------------------------------------------------------
  console.log("\n[TEST 6] Evidence 对齐与最小充分集合校验...");
  let allFindingsEvidenceAligned = true;

  const testOutputs = [aiOutput1, aiOutput2, aiOutput3, aiOutput4, aiOutput5];
  const testInputs = [input1, input2, input3, input4, input5];

  for (let i = 0; i < testOutputs.length; i++) {
    const out = testOutputs[i];
    const inp = testInputs[i];
    const allowedSet = new Set([
      ...inp.evidence.map((e) => e.id),
      ...(inp.contentItems ?? []).map((c) => c.evidenceId),
    ]);

    for (const f of out.findings) {
      if (!Array.isArray(f.evidenceIds) || f.evidenceIds.length === 0) {
        allFindingsEvidenceAligned = false;
        break;
      }
      const seen = new Set<string>();
      for (const evId of f.evidenceIds) {
        if (!allowedSet.has(evId) || seen.has(evId)) {
          allFindingsEvidenceAligned = false;
          break;
        }
        seen.add(evId);
      }
    }
  }

  const pass6 = allFindingsEvidenceAligned;
  console.log(`  - 全部 5 个测试用例 Findings 中的 evidenceIds 均非空、无重复且 100% 存在于输入白名单: ${pass6 ? "✅" : "❌"}`);
  if (!pass6) allPassed = false;

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 Phase 8: 全部 6 项 AI 推理质量与认知探针测试全部顺利通过！");
    console.log("=================================================");
  } else {
    console.error("❌ Phase 8 测试存在失败项，请排查！");
    process.exit(1);
  }
}

runPhase8QualityProbe().catch((err) => {
  console.error("Phase 8 测试执行异常:", err);
  process.exit(1);
});
