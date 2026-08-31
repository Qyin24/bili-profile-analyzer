/**
 * BiliProfile Analyzer — Phase 6.0 & 6.1: AI Analysis Contract, Provider Registry & Fail-Closed Test Suite
 *
 * Verifies:
 * 1. Deterministic reproducibility: Identical DeterministicReportInput yields 100% identical AiAnalysisResult.
 * 2. Evidence traceability: Every finding cites existing, valid evidence IDs from the input (zero hallucinated evidence).
 * 3. Data gaps & limitation preservation: Empty samples, unclassified records, PARTIAL/UNAVAILABLE sources produce accurate findings and limitations.
 * 4. Zero sensitive/sentinel leakage: Raw body sentinels, self-profile fields, snapshot values, and credentials never enter AI output.
 * 5. Strict validator defense & Error Sanitization (Phase 6.0.1):
 *    - Rejects unknown fields without echoing key names in error messages.
 *    - Rejects dangling evidence IDs without echoing ID values in error messages.
 *    - Rejects illegal categories/providers without echoing values in error messages.
 *    - Rejects sensitive inference keywords without echoing uncontrolled inputs.
 *    - Rejects duplicate finding IDs, invalid schemaVersions.
 *    - Mock provider throws fixed errors on invalid input or output without leaking errors array or sentinel tokens.
 * 6. Provider Registry & Fail-Closed Boundaries (Phase 6.1):
 *    - Default entrypoint and explicit MOCK entrypoint produce 100% identical outputs.
 *    - Future/unsupported providers (GEMINI, OPENAI, empty string, non-string, unknown sentinel) fail explicitly.
 *    - Errors from unknown providers never echo provider names, input content, or stack details.
 *    - Fail-closed: Never silently falls back to MOCK when an unsupported provider is requested.
 * 7. Global fetch calls count is strictly 0.
 *
 * Safety:
 * - Pure local execution (zero LLM SDK, zero external network, zero SQLite mutations).
 */

import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
} from "../../src/lib/processing/pipeline";
import {
  generateMockAiAnalysis,
  validateAiAnalysisResult,
  generateAiAnalysis,
  getAiProvider,
  mockAiProvider,
  AI_ANALYSIS_SCHEMA_VERSION,
  AiAnalysisResult,
} from "../../src/lib/ai";
import { PublicSourceRecord } from "../../src/types/processing";

async function runAiContractVerification() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 6.0 & 6.1 离线 AI 分析契约与 Provider Registry 测试");
  console.log("=================================================\n");

  let allPassed = true;

  // Intercept global fetch to strictly ensure zero network activity
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: unknown[]) => {
    fetchCallCount++;
    throw new Error("AI Contract test violation: network fetch attempted!");
  };

  try {
    // -------------------------------------------------------------------------
    // Test Fixtures Setup
    // -------------------------------------------------------------------------
    const SENTINEL_RAW_TEXT = "SENTINEL_RAW_BODY_CONFIDENTIAL_1234567890";
    const sampleRecordsStandard: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_g1",
        sourceType: "CONTENT",
        title: "黑神话悟空全流程速通攻略",
        description: `包含保密敏感正文：${SENTINEL_RAW_TEXT}`,
        tags: ["游戏", "单机游戏"],
      },
      {
        sourceRecordId: "rec_g2",
        sourceType: "CONTENT",
        title: "原神探索与角色配队",
        tags: ["游戏"],
      },
      {
        sourceRecordId: "rec_t1",
        sourceType: "CONTENT",
        title: "大语言模型原理与实践",
        tags: ["科技", "AI"],
      },
    ];

    const analysisStandard = runDeterministicAnalysis(sampleRecordsStandard);
    const reportInputStandard = buildDeterministicReportInput(analysisStandard);

    // -------------------------------------------------------------------------
    // Test 1: Deterministic Reproducibility
    // -------------------------------------------------------------------------
    console.log("[测试 1] 严格确定性：同一 DeterministicReportInput 多次生成 AiAnalysisResult 完全一致...");
    const aiRes1 = await generateMockAiAnalysis(reportInputStandard);
    const aiRes2 = await generateMockAiAnalysis(reportInputStandard);
    const json1 = JSON.stringify(aiRes1);
    const json2 = JSON.stringify(aiRes2);

    const val1 = validateAiAnalysisResult(aiRes1, reportInputStandard);

    const pass1 =
      json1 === json2 &&
      val1.valid &&
      aiRes1.schemaVersion === AI_ANALYSIS_SCHEMA_VERSION &&
      aiRes1.provider === "MOCK";

    console.log(`  - 两次生成序列化 JSON 完全匹配: ${json1 === json2 ? "✅" : "❌"}`);
    console.log(`  - 结果契约校验通过: ${val1.valid ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Evidence Traceability (Zero Hallucinated Evidence)
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 证据链可追溯性：每个 finding 必须引用报告中真实存在的 evidenceId...");
    const validEvIdSet = new Set(reportInputStandard.evidence.map((e) => e.id));

    let allFindingsHaveValidEvidence = aiRes1.findings.length > 0;
    for (const finding of aiRes1.findings) {
      if (!finding.evidenceIds || finding.evidenceIds.length === 0) {
        allFindingsHaveValidEvidence = false;
        break;
      }
      for (const evId of finding.evidenceIds) {
        if (!validEvIdSet.has(evId)) {
          allFindingsHaveValidEvidence = false;
          break;
        }
      }
    }

    const pass2 = allFindingsHaveValidEvidence;
    console.log(`  - 全部 finding (${aiRes1.findings.length} 项) 的 evidenceId 均在输入报告中存在: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Data Gaps & Limitation Preservation
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 数据局限性保真：空样本、纯未分类、PARTIAL/UNAVAILABLE 产生准确局限性说明...");

    // Case 3a: Empty input
    const emptyAnalysis = runDeterministicAnalysis([]);
    const emptyReportInput = buildDeterministicReportInput(emptyAnalysis);
    const emptyAiRes = await generateMockAiAnalysis(emptyReportInput);
    const valEmpty = validateAiAnalysisResult(emptyAiRes, emptyReportInput);

    const pass3a =
      valEmpty.valid &&
      emptyAiRes.summary.includes("未能匹配到预设分类词表") &&
      emptyAiRes.limitations.length > 0;

    console.log(`  - [3a] 零样本生成中性说明与局限性: ${pass3a ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3a) allPassed = false;

    // Case 3b: Unclassified records
    const unclassRecords: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_unclass_1",
        sourceType: "CONTENT",
        title: "纯生僻未收录文本",
        tags: ["生僻标签XYZ"],
      },
    ];
    const unclassAnalysis = runDeterministicAnalysis(unclassRecords);
    const unclassReportInput = buildDeterministicReportInput(unclassAnalysis);
    const unclassAiRes = await generateMockAiAnalysis(unclassReportInput);
    const valUnclass = validateAiAnalysisResult(unclassAiRes, unclassReportInput);

    const pass3b =
      valUnclass.valid &&
      unclassAiRes.limitations.some((l) => l.includes("未命中预设主题词表"));

    console.log(`  - [3b] 纯未分类样本保留未分类局限性说明: ${pass3b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3b) allPassed = false;

    // Case 3c: PARTIAL / UNAVAILABLE sources
    const partialRecords: PublicSourceRecord[] = [
      {
        sourceRecordId: "rec_part_1",
        sourceType: "PROFILE",
        availability: "PARTIAL",
        title: "部分受限主页",
      },
      {
        sourceRecordId: "rec_unavail_1",
        sourceType: "FOLLOW",
        availability: "UNAVAILABLE",
        title: "隐私不可用关注列表",
      },
    ];
    const partialAnalysis = runDeterministicAnalysis(partialRecords);
    const partialReportInput = buildDeterministicReportInput(partialAnalysis);
    const partialAiRes = await generateMockAiAnalysis(partialReportInput);
    const valPartial = validateAiAnalysisResult(partialAiRes, partialReportInput);

    const hasSourceLimitationFinding = partialAiRes.findings.some(
      (f) => f.category === "SOURCE_LIMITATION"
    );

    const pass3c =
      valPartial.valid &&
      hasSourceLimitationFinding &&
      partialAiRes.limitations.some((l) => l.includes("受限或不可用"));

    console.log(`  - [3c] 受限数据源生成 SOURCE_LIMITATION 解读项并保留局限性: ${pass3c ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3c) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: Zero Sensitive/Sentinel Leakage
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 敏感字段与哨兵文本零泄露验证...");
    const aiSerialized = JSON.stringify(aiRes1);

    const pass4 =
      !aiSerialized.includes(SENTINEL_RAW_TEXT) &&
      !aiSerialized.includes("SnapshotField") &&
      !aiSerialized.includes("currentGoals") &&
      !aiSerialized.includes("learningDirections") &&
      !aiSerialized.includes("customPrompt") &&
      !aiSerialized.includes("SESSDATA") &&
      !aiSerialized.includes("Cookie") &&
      !aiSerialized.includes("bili_jct");

    console.log(`  - 原始长正文哨兵与自述/凭据标记零泄露: ${pass4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Strict Validator Defense & Error Desensitization (Phase 6.0.1)
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 严格校验器防御与错误脱敏测试 (Phase 6.0.1)...");

    // Case 5a: Unknown root field name is a unique sentinel string
    const SENTINEL_ROOT_KEY = "SENTINEL_UNKNOWN_ROOT_KEY_9981";
    const badRootResult = {
      ...aiRes1,
      [SENTINEL_ROOT_KEY]: "BOGUS_VALUE",
    };
    const valBadRoot = validateAiAnalysisResult(badRootResult, reportInputStandard);
    const errBadRootStr = JSON.stringify(valBadRoot.errors);
    const pass5a =
      !valBadRoot.valid &&
      valBadRoot.errors.includes("AI 分析结果根对象包含未知字段") &&
      !errBadRootStr.includes(SENTINEL_ROOT_KEY);

    console.log(`  - [5a] 根对象未知字段拦截且零哨兵回显: ${pass5a ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5a) allPassed = false;

    // Case 5b: Unknown finding field name is a unique sentinel string
    const SENTINEL_FINDING_KEY = "SENTINEL_UNKNOWN_FINDING_KEY_9982";
    const badFindingResult = {
      ...aiRes1,
      findings: [
        {
          ...aiRes1.findings[0],
          [SENTINEL_FINDING_KEY]: "BOGUS_VALUE",
        },
      ],
    };
    const valBadFinding = validateAiAnalysisResult(badFindingResult, reportInputStandard);
    const errBadFindingStr = JSON.stringify(valBadFinding.errors);
    const pass5b =
      !valBadFinding.valid &&
      valBadFinding.errors.includes("findings[0] 包含未知字段") &&
      !errBadFindingStr.includes(SENTINEL_FINDING_KEY);

    console.log(`  - [5b] Finding 未知字段拦截且零哨兵回显: ${pass5b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5b) allPassed = false;

    // Case 5c: Dangling evidenceId value is a unique sentinel string
    const SENTINEL_DANGLING_EVID = "SENTINEL_DANGLING_EVID_9983";
    const badEvidenceResult: AiAnalysisResult = {
      ...aiRes1,
      findings: [
        {
          id: "finding_hallucinated",
          category: "TOPIC_INTERPRETATION",
          statement: "虚假推断",
          evidenceIds: [SENTINEL_DANGLING_EVID],
        },
      ],
    };
    const valBadEvidence = validateAiAnalysisResult(badEvidenceResult, reportInputStandard);
    const errBadEvStr = JSON.stringify(valBadEvidence.errors);
    const pass5c =
      !valBadEvidence.valid &&
      valBadEvidence.errors.includes("findings[0] 引用的 evidenceId 不存在于输入报告中") &&
      !errBadEvStr.includes(SENTINEL_DANGLING_EVID);

    console.log(`  - [5c] 悬空证据引用拦截且零哨兵回显: ${pass5c ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5c) allPassed = false;

    // Case 5d1: Illegal category value is a unique sentinel string
    const SENTINEL_ILLEGAL_CAT = "SENTINEL_ILLEGAL_CAT_9984";
    const badCatResult = {
      ...aiRes1,
      findings: [
        {
          ...aiRes1.findings[0],
          category: SENTINEL_ILLEGAL_CAT as any,
        },
      ],
    };
    const valBadCat = validateAiAnalysisResult(badCatResult, reportInputStandard);
    const errBadCatStr = JSON.stringify(valBadCat.errors);
    const pass5d1 =
      !valBadCat.valid &&
      valBadCat.errors.includes("findings[0] 的 category 非法") &&
      !errBadCatStr.includes(SENTINEL_ILLEGAL_CAT);

    console.log(`  - [5d1] 非法 Category 拦截且零哨兵回显: ${pass5d1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5d1) allPassed = false;

    // Case 5d2: Illegal provider value is a unique sentinel string
    const SENTINEL_ILLEGAL_PROV = "SENTINEL_ILLEGAL_PROV_9985";
    const badProviderResult = {
      ...aiRes1,
      provider: SENTINEL_ILLEGAL_PROV as any,
    };
    const valBadProvider = validateAiAnalysisResult(badProviderResult, reportInputStandard);
    const errBadProvStr = JSON.stringify(valBadProvider.errors);
    const pass5d2 =
      !valBadProvider.valid &&
      valBadProvider.errors.includes("provider 非法") &&
      !errBadProvStr.includes(SENTINEL_ILLEGAL_PROV);

    console.log(`  - [5d2] 非法 Provider 拦截且零哨兵回显: ${pass5d2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5d2) allPassed = false;

    // Case 5e: Illegal DeterministicReportInput containing sentinel in generateMockAiAnalysis
    const SENTINEL_DIRTY_INPUT = "SENTINEL_DIRTY_INPUT_REPORT_9986";
    const dirtyReportInput = {
      ...reportInputStandard,
      [SENTINEL_DIRTY_INPUT]: "BOGUS",
    } as any;

    let mockErrorThrown = false;
    let mockErrorMessage = "";
    try {
      await generateMockAiAnalysis(dirtyReportInput);
    } catch (err: any) {
      mockErrorThrown = true;
      mockErrorMessage = err instanceof Error ? err.message : String(err);
    }

    const pass5e =
      mockErrorThrown &&
      mockErrorMessage === "DeterministicReportInput validation failed" &&
      !mockErrorMessage.includes(SENTINEL_DIRTY_INPUT);

    console.log(`  - [5e] Mock Provider 输入校验拦截抛出受控错误且零回显: ${pass5e ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5e) allPassed = false;

    // Case 5f: Duplicate finding IDs
    const duplicateFindingResult: AiAnalysisResult = {
      ...aiRes1,
      findings: [
        {
          id: "finding_dup_1",
          category: "SAMPLE_RELIABILITY",
          statement: "测试 1",
          evidenceIds: [reportInputStandard.evidence[0].id],
        },
        {
          id: "finding_dup_1",
          category: "TOPIC_INTERPRETATION",
          statement: "测试 2",
          evidenceIds: [reportInputStandard.evidence[0].id],
        },
      ],
    };
    const valDuplicateFinding = validateAiAnalysisResult(duplicateFindingResult, reportInputStandard);
    const pass5f =
      !valDuplicateFinding.valid &&
      valDuplicateFinding.errors.includes("findings[1] 存在重复的 finding id");

    console.log(`  - [5f] 重复 finding ID 拦截: ${pass5f ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5f) allPassed = false;

    // Case 5g: Illegal schemaVersion
    const badVersionResult = {
      ...aiRes1,
      schemaVersion: "ai-analysis-result/v999",
    };
    const valBadVersion = validateAiAnalysisResult(badVersionResult, reportInputStandard);
    const pass5g =
      !valBadVersion.valid &&
      valBadVersion.errors.includes("schemaVersion 非法");

    console.log(`  - [5g] 非法 schemaVersion 拦截: ${pass5g ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5g) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Credential and Sensitive Token Leak Interception
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] 受保护凭据与敏感标记零泄露拦截测试...");
    const sensitiveResultSessdata: AiAnalysisResult = {
      ...aiRes1,
      summary: "包含泄露的凭据标记：SESSDATA=mock_secret_session_token",
    };
    const valSensitiveSessdata = validateAiAnalysisResult(sensitiveResultSessdata, reportInputStandard);

    const sensitiveResultCookie: AiAnalysisResult = {
      ...aiRes1,
      summary: "包含泄露的请求头信息：Cookie=bili_jct=12345",
    };
    const valSensitiveCookie = validateAiAnalysisResult(sensitiveResultCookie, reportInputStandard);

    const pass6 =
      !valSensitiveSessdata.valid &&
      valSensitiveSessdata.errors.includes("AI 分析结果包含受保护的敏感标记或字段") &&
      !valSensitiveCookie.valid &&
      valSensitiveCookie.errors.includes("AI 分析结果包含受保护的敏感标记或字段");

    console.log(`  - SESSDATA 等会话凭据泄露拦截: ${!valSensitiveSessdata.valid ? "✅" : "❌"}`);
    console.log(`  - Cookie/bili_jct 等敏感标记拦截: ${!valSensitiveCookie.valid ? "✅" : "❌"}`);
    console.log(`  - 凭据安全综合判定: ${pass6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Zero Network Fetch Calls Assertion (Phase 6.0)
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] 基础测试流程零外部网络请求断言...");
    const pass7 = fetchCallCount === 0;
    console.log(`  - fetch 调用总数: ${fetchCallCount} -> ${pass7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass7) allPassed = false;

    // =========================================================================
    // --- Phase 6.1 Additions: Provider Registry & Fail-Closed Boundary ---
    // =========================================================================
    console.log("\n[Phase 6.1 Provider Registry 与失败关闭边界专项测试]");

    // --- Test 8: Registry Resolution & Unified generateAiAnalysis ---
    console.log("\n[测试 8] Provider Registry 解析与统一入口测试...");

    // Case 8a: Default entrypoint vs explicit MOCK entrypoint are 100% equal
    const aiResDefault = await generateAiAnalysis(reportInputStandard);
    const aiResExplicit = await generateAiAnalysis(reportInputStandard, "MOCK");
    const jsonDefault = JSON.stringify(aiResDefault);
    const jsonExplicit = JSON.stringify(aiResExplicit);

    const pass8a =
      jsonDefault === jsonExplicit &&
      aiResDefault.schemaVersion === AI_ANALYSIS_SCHEMA_VERSION &&
      aiResDefault.provider === "MOCK";

    console.log(`  - [8a] 默认入口与显式 MOCK 入口输出完全一致: ${pass8a ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8a) allPassed = false;

    // Case 8b: Output passes validateAiAnalysisResult
    const valUnified = validateAiAnalysisResult(aiResDefault, reportInputStandard);
    const pass8b = valUnified.valid;

    console.log(`  - [8b] 统一入口输出通过 validateAiAnalysisResult: ${pass8b ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8b) allPassed = false;

    // Case 8c: Future placeholder & invalid providers fail explicitly (No silent fallback!)
    const invalidProviderCases = [
      { name: "GEMINI", input: "GEMINI", expectedErr: "Unsupported AI provider" },
      { name: "OPENAI", input: "OPENAI", expectedErr: "Unsupported AI provider" },
      { name: "空字符串", input: "", expectedErr: "Invalid AI provider" },
      { name: "空白字符串", input: "   ", expectedErr: "Invalid AI provider" },
      { name: "非字符串 (null)", input: null, expectedErr: "Invalid AI provider" },
      { name: "非字符串 (number)", input: 12345, expectedErr: "Invalid AI provider" },
    ];

    let pass8c = true;
    for (const c of invalidProviderCases) {
      let errCaught = false;
      let errMsg = "";
      try {
        await generateAiAnalysis(reportInputStandard, c.input as any);
      } catch (err: any) {
        errCaught = true;
        errMsg = err instanceof Error ? err.message : String(err);
      }

      const casePassed = errCaught && errMsg === c.expectedErr;
      if (!casePassed) {
        pass8c = false;
      }
      console.log(`    * [8c.${c.name}] 拦截拒绝 (期望 '${c.expectedErr}', 实际得到 '${errMsg}'): ${casePassed ? "✅" : "❌"}`);
    }
    if (!pass8c) allPassed = false;

    // Case 8d: Unique sentinel provider string rejection & zero echo
    const SENTINEL_UNKNOWN_PROVIDER = "SENTINEL_UNKNOWN_PROVIDER_NAME_8888";
    let sentinelProvErrorThrown = false;
    let sentinelProvErrorMsg = "";
    try {
      await generateAiAnalysis(reportInputStandard, SENTINEL_UNKNOWN_PROVIDER);
    } catch (err: any) {
      sentinelProvErrorThrown = true;
      sentinelProvErrorMsg = err instanceof Error ? err.message : String(err);
    }

    const pass8d =
      sentinelProvErrorThrown &&
      sentinelProvErrorMsg === "Unsupported AI provider" &&
      !sentinelProvErrorMsg.includes(SENTINEL_UNKNOWN_PROVIDER) &&
      !sentinelProvErrorMsg.includes("SnapshotField");

    console.log(`  - [8d] 哨兵 Provider 请求受控拦截且零回显: ${pass8d ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8d) allPassed = false;

    // Case 8e: Direct getAiProvider unit check
    const directMock = getAiProvider();
    const directMockExplicit = getAiProvider("MOCK");
    let getAiProvErr = false;
    let getAiProvErrMsg = "";
    try {
      getAiProvider(SENTINEL_UNKNOWN_PROVIDER);
    } catch (err: any) {
      getAiProvErr = true;
      getAiProvErrMsg = err instanceof Error ? err.message : String(err);
    }

    const pass8e =
      directMock === mockAiProvider &&
      directMockExplicit === mockAiProvider &&
      getAiProvErr &&
      getAiProvErrMsg === "Unsupported AI provider" &&
      !getAiProvErrMsg.includes(SENTINEL_UNKNOWN_PROVIDER);

    console.log(`  - [8e] getAiProvider 纯注册中心单元测试 (MOCK 命中, 未知失败关闭): ${pass8e ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8e) allPassed = false;

    // Case 8f: Fetch calls remain strictly 0 even with invalid/unsupported provider calls
    const pass8f = fetchCallCount === 0;
    console.log(`  - [8f] 全程包括未知 Provider 探针测试 fetch 调用总数: ${fetchCallCount} -> ${pass8f ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8f) allPassed = false;

    console.log("\n=================================================");
    if (allPassed) {
      console.log("🎉 Phase 6.0 & 6.1 离线 AI 分析契约、Provider Registry 与失败关闭测试全部通过！");
      console.log("=================================================\n");
    } else {
      console.error("❌ 部分测试未通过，请检查。");
      console.log("=================================================\n");
      process.exit(1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runAiContractVerification().catch((err) => {
  console.error("AI 契约测试脚本异常:", err);
  process.exit(1);
});
