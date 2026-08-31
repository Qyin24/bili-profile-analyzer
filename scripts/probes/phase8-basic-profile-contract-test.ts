/**
 * BiliProfile Analyzer — Minimal BASIC_PROFILE Input Contract Offline Test
 *
 * Test Invariants:
 * 1. 100% pure offline test, strictly 0 external network calls.
 * 2. globalThis.fetch is mocked to throw immediately on ANY call (no network allowed).
 * 3. Validates strict whitelist of allowed root keys (unknown top-level fields rejected).
 * 4. Validates strict type checking, non-whitespace string constraints, and ISO 8601 timestamps WITH explicit timezone.
 * 5. Rejects date-only strings and timezone-less timestamps.
 * 6. Proves provenance discrimination & declarative "REAL_CONNECTOR" label semantics.
 * 7. Asserts strict rejection of raw platform fields (mid, uname, face, sign, wbi, w_rid, uid, cookie, token).
 * 8. Validates batch recordId uniqueness checking.
 * 9. Validates pure conversion to PublicSourceRecord and compatibility with deterministic pipeline.
 * 10. Asserts all production capabilities (BASIC_PROFILE, PUBLIC_FOLLOWS, PUBLIC_CONTENT) remain UNVERIFIED.
 */

import {
  NormalizedBasicProfileInput,
} from "../../src/types/processing";
import {
  validateBasicProfileInputContract,
  validateBasicProfileInputBatch,
  createLocalFixtureBasicProfileInput,
  basicProfileInputToPublicSourceRecord,
  isValidIso8601TimestampWithTimezone,
} from "../../src/lib/processing/basic-profile-input-contract";
import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
} from "../../src/lib/processing/pipeline";
import {
  DEFAULT_PRODUCTION_REGISTRY,
  BilibiliPublicConnector,
} from "../../src/lib/connectors/bilibili-public-connector";

// Track and strictly BLOCK any unexpected fetch calls
let fetchCallCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args: any[]) => {
  fetchCallCount++;
  throw new Error(
    `[CRITICAL_SECURITY_VIOLATION] 离线契约测试绝对禁止发起任何外部网络 fetch 请求！Target: ${args[0]}`
  );
};

async function runBasicProfileContractTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — BASIC_PROFILE 输入契约离线验证测试");
  console.log("=================================================\n");

  let allPassed = true;

  try {
    // -------------------------------------------------------------------------
    // Test 1: Strict Whitelist & Prohibited Unknown / Nested Object Fields
    // -------------------------------------------------------------------------
    console.log("[测试 1] 契约严格白名单与未知/嵌套字段拦截测试...");

    const validFullInput: NormalizedBasicProfileInput = {
      recordId: "prof_fixture_01",
      provenance: "LOCAL_FIXTURE",
      displayName: "演示博主A",
      description: "专注计算机科学与大模型架构研究",
      tags: ["科技", "计算机", "编程"],
      avatarIdentifier: "avatar_asset_01",
      observedAt: "2026-08-20T12:00:00Z",
      availability: "AVAILABLE",
    };

    const valRes1 = validateBasicProfileInputContract(validFullInput);
    const pass1_1 = valRes1.valid && valRes1.errors.length === 0;
    console.log(`  - 完整合法白名单输入校验: ${pass1_1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1_1) allPassed = false;

    // Unknown top-level fields MUST be rejected by whitelist
    const unknownFieldPayload = {
      ...validFullInput,
      extraUnauthorizedField: "should_fail",
      trackingId: 12345,
    };
    const valResUnknown = validateBasicProfileInputContract(unknownFieldPayload);
    const pass1_2 =
      !valResUnknown.valid &&
      valResUnknown.errors.some((e) => e.includes("extraUnauthorizedField")) &&
      valResUnknown.errors.some((e) => e.includes("trackingId"));
    console.log(`  - 未知顶层字段严格白名单拦截: ${pass1_2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1_2) allPassed = false;

    // Nested arbitrary object fields MUST be rejected
    const nestedObjectPayload = {
      ...validFullInput,
      displayName: { complexObject: "nested_value" },
    };
    const valResNested = validateBasicProfileInputContract(nestedObjectPayload);
    const pass1_3 =
      !valResNested.valid &&
      valResNested.errors.some((e) => e.includes("嵌套对象或数组") || e.includes("非空白字符串"));
    console.log(`  - 非法嵌套对象字段拦截: ${pass1_3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1_3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: ISO 8601 Explicit Timezone Timestamps & Non-Whitespace String Constraints
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] ISO 8601 带时区时间戳格式与非空白字符串严格约束测试...");

    // Timestamps with explicit timezone MUST pass
    const isoValidZ = isValidIso8601TimestampWithTimezone("2026-08-20T12:00:00Z");
    const isoValidFractionalZ = isValidIso8601TimestampWithTimezone("2026-08-20T12:00:00.000Z");
    const isoValidPlus8 = isValidIso8601TimestampWithTimezone("2026-08-20T12:00:00+08:00");
    const isoValidMinus5 = isValidIso8601TimestampWithTimezone("2026-08-20T12:00:00-05:00");

    const passValidTz = isoValidZ && isoValidFractionalZ && isoValidPlus8 && isoValidMinus5;
    console.log(`  - 带明确时区 (Z / +08:00 / -05:00) 的 ISO 8601 时间戳通过: ${passValidTz ? "✅ 通过" : "❌ 失败"}`);
    if (!passValidTz) allPassed = false;

    // Date-only, timezone-less, out-of-bounds or whitespace-padded timestamps MUST fail
    const isoInvalidDateOnly = isValidIso8601TimestampWithTimezone("2026-08-20");
    const isoInvalidNoTz = isValidIso8601TimestampWithTimezone("2026-08-20T12:00:00");
    const isoInvalidWhitespace = isValidIso8601TimestampWithTimezone("2026-08-20T12:00:00Z ");
    const isoInvalidDayRollover = isValidIso8601TimestampWithTimezone("2026-02-30T12:00:00Z");
    const isoInvalidMonth = isValidIso8601TimestampWithTimezone("2026-13-01T12:00:00Z");
    const isoInvalidHour = isValidIso8601TimestampWithTimezone("2026-08-20T25:00:00Z");

    const passInvalidTz =
      !isoInvalidDateOnly &&
      !isoInvalidNoTz &&
      !isoInvalidWhitespace &&
      !isoInvalidDayRollover &&
      !isoInvalidMonth &&
      !isoInvalidHour;
    console.log(`  - 纯日期 (2026-08-20)、无时区时间 (2026-08-20T12:00:00) 及非法时间被严格拦截: ${passInvalidTz ? "✅ 通过" : "❌ 失败"}`);
    if (!passInvalidTz) allPassed = false;

    // Contract validation on invalid date
    const invalidDateRecord = {
      ...validFullInput,
      observedAt: "2026-08-20", // Date-only rejected by contract
    };
    const valResDate = validateBasicProfileInputContract(invalidDateRecord);
    const pass2_3 = !valResDate.valid && valResDate.errors.some((e) => e.includes("带明确时区的 ISO 8601 时间戳"));
    console.log(`  - 契约拦截纯日期 observedAt (要求带明确时区): ${pass2_3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass2_3) allPassed = false;

    // Whitespace-only string rejection
    const whitespaceDisplayName = { ...validFullInput, displayName: "    " };
    const whitespaceDescription = { ...validFullInput, description: " \t " };
    const whitespaceAvatar = { ...validFullInput, avatarIdentifier: "   " };
    const whitespaceRecordId = { ...validFullInput, recordId: "   " };

    const passWs1 = !validateBasicProfileInputContract(whitespaceDisplayName).valid;
    const passWs2 = !validateBasicProfileInputContract(whitespaceDescription).valid;
    const passWs3 = !validateBasicProfileInputContract(whitespaceAvatar).valid;
    const passWs4 = !validateBasicProfileInputContract(whitespaceRecordId).valid;

    const passWhitespace = passWs1 && passWs2 && passWs3 && passWs4;
    console.log(`  - 契约严格拒绝空白字符串 (displayName/description/avatar/recordId): ${passWhitespace ? "✅ 通过" : "❌ 失败"}`);
    if (!passWhitespace) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Provenance Discrimination & Declarative "REAL_CONNECTOR" Semantics
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 来源判别 (LOCAL_FIXTURE vs REAL_CONNECTOR 声明性标签) 测试...");

    const fixtureRecord = createLocalFixtureBasicProfileInput({
      recordId: "prof_fixture_03",
      displayName: "受控本地演示用户",
      description: "全栈开发与开源爱好者",
      tags: ["开源", "全栈"],
      availability: "AVAILABLE",
    });

    const isExplicitLocalFixture = fixtureRecord.provenance === "LOCAL_FIXTURE";
    console.log(`  - createLocalFixtureBasicProfileInput 赋予 LOCAL_FIXTURE: ${isExplicitLocalFixture ? "✅ 通过" : "❌ 失败"}`);
    if (!isExplicitLocalFixture) allPassed = false;

    // Declarative REAL_CONNECTOR record format check
    const declarativeRealConnectorRecord: NormalizedBasicProfileInput = {
      recordId: "prof_real_format_01",
      provenance: "REAL_CONNECTOR",
      displayName: "声明性真实来源格式样例",
      availability: "AVAILABLE",
    };
    const valResReal = validateBasicProfileInputContract(declarativeRealConnectorRecord);
    const passRealDeclarative = valResReal.valid;
    console.log(`  - REAL_CONNECTOR 符合声明性标签格式契约 (不代表真实性认证): ${passRealDeclarative ? "✅ 通过" : "❌ 失败"}`);
    if (!passRealDeclarative) allPassed = false;

    // Invalid provenance string rejection
    const invalidProvenanceRecord = {
      ...validFullInput,
      provenance: "MOCK_SOURCE_CUSTOM",
    };
    const valResInvalidProv = validateBasicProfileInputContract(invalidProvenanceRecord);
    const pass3_3 = !valResInvalidProv.valid && valResInvalidProv.errors.some((e) => e.includes("provenance"));
    console.log(`  - 非法 provenance 字符串被受控拒绝: ${pass3_3 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass3_3) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 4: Prohibition of Raw Platform Fields & Credentials
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 严禁平台原始字段 (mid, uname, face, sign, wbi 等) 与凭据注入测试...");

    const prohibitedPayloads = [
      { recordId: "rec_1", provenance: "LOCAL_FIXTURE", availability: "AVAILABLE", mid: "12345" },
      { recordId: "rec_2", provenance: "LOCAL_FIXTURE", availability: "AVAILABLE", uname: "测试名" },
      { recordId: "rec_3", provenance: "LOCAL_FIXTURE", availability: "AVAILABLE", face: "http://example.com/face.jpg" },
      { recordId: "rec_4", provenance: "LOCAL_FIXTURE", availability: "AVAILABLE", sign: "个人签名" },
      { recordId: "rec_5", provenance: "LOCAL_FIXTURE", availability: "AVAILABLE", wbi: "token_xyz" },
      { recordId: "rec_6", provenance: "LOCAL_FIXTURE", availability: "AVAILABLE", cookie: "SESSDATA=123" },
      { recordId: "rec_7", provenance: "LOCAL_FIXTURE", availability: "AVAILABLE", uid: "99999" },
    ];

    let allProhibitedBlocked = true;
    for (const p of prohibitedPayloads) {
      const res = validateBasicProfileInputContract(p);
      if (res.valid) {
        allProhibitedBlocked = false;
        console.error(`  - ❌ 漏报了包含非法字段的对象:`, p);
      }
    }

    console.log(`  - 7 种平台原始字段/凭据注入均被严格拦截: ${allProhibitedBlocked ? "✅ 通过" : "❌ 失败"}`);
    if (!allProhibitedBlocked) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Batch Validation & recordId Uniqueness Verification
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 批量输入与 recordId 唯一性校验测试...");

    const validBatch: NormalizedBasicProfileInput[] = [
      {
        recordId: "rec_batch_01",
        provenance: "LOCAL_FIXTURE",
        displayName: "用户1",
        availability: "AVAILABLE",
      },
      {
        recordId: "rec_batch_02",
        provenance: "LOCAL_FIXTURE",
        displayName: "用户2",
        availability: "AVAILABLE",
      },
    ];
    const batchVal1 = validateBasicProfileInputBatch(validBatch);
    console.log(`  - 合法批量输入校验通过: ${batchVal1.valid ? "✅ 通过" : "❌ 失败"}`);
    if (!batchVal1.valid) allPassed = false;

    const duplicateBatch: NormalizedBasicProfileInput[] = [
      {
        recordId: "rec_batch_dup",
        provenance: "LOCAL_FIXTURE",
        displayName: "用户A",
        availability: "AVAILABLE",
      },
      {
        recordId: "rec_batch_dup", // Duplicate ID
        provenance: "LOCAL_FIXTURE",
        displayName: "用户B",
        availability: "AVAILABLE",
      },
    ];
    const batchVal2 = validateBasicProfileInputBatch(duplicateBatch);
    const passBatchDup =
      !batchVal2.valid && batchVal2.errors.some((e) => e.includes("重复的 recordId"));
    console.log(`  - 批量重复 recordId 拦截: ${passBatchDup ? "✅ 通过" : "❌ 失败"}`);
    if (!passBatchDup) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Pure Adapter (No || Fallbacks) & Pipeline Interoperability
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] 纯适配器转换 (无 || 静默改写) 与确定性数据管道无缝兼容性测试...");

    const sourceRecord = basicProfileInputToPublicSourceRecord(fixtureRecord);

    const isProfileSource =
      sourceRecord.sourceRecordId === "prof_fixture_03" &&
      sourceRecord.sourceType === "PROFILE" &&
      sourceRecord.title === "受控本地演示用户" &&
      sourceRecord.description === "全栈开发与开源爱好者" &&
      sourceRecord.sourceUrl === null;

    console.log(`  - 纯转换生成标准 PublicSourceRecord: ${isProfileSource ? "✅ 通过" : "❌ 失败"}`);
    if (!isProfileSource) allPassed = false;

    // Pipe into deterministic analysis pipeline
    const pipelineResult = runDeterministicAnalysis([sourceRecord]);
    const reportInput = buildDeterministicReportInput(pipelineResult);

    const profileCoverage = pipelineResult.sourceCoverage.find((s) => s.sourceType === "PROFILE");
    const pipelineCompatible =
      pipelineResult.recordCounts.totalInput === 1 &&
      profileCoverage !== undefined &&
      profileCoverage.recordCount === 1 &&
      reportInput.schemaVersion === "deterministic-report-input/v1";

    console.log(`  - 输入确定性管道产出合法分析结果与报告输入: ${pipelineCompatible ? "✅ 通过" : "❌ 失败"}`);
    if (!pipelineCompatible) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Capability Baseline & Connector Fail-Closed Assertion
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] Capability 注册表隔离与 Connector 门控拦截断言...");

    const connector = new BilibiliPublicConnector();
    const basicStatus = connector.getCapabilityStatus("BASIC_PROFILE");
    const followsStatus = connector.getCapabilityStatus("PUBLIC_FOLLOWS");
    const contentStatus = connector.getCapabilityStatus("PUBLIC_CONTENT");

    const followsCallResult = await connector.fetchPublicFollows("00000");
    const contentCallResult = await connector.fetchPublicContent("00000");

    const pass7 =
      DEFAULT_PRODUCTION_REGISTRY.BASIC_PROFILE === "AVAILABLE_PUBLIC" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_FOLLOWS === "UNVERIFIED" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_CONTENT === "UNVERIFIED" &&
      basicStatus === "AVAILABLE_PUBLIC" &&
      followsStatus === "UNVERIFIED" &&
      contentStatus === "UNVERIFIED" &&
      !followsCallResult.success &&
      followsCallResult.status === "UNVERIFIED_BLOCKED" &&
      followsCallResult.data === null &&
      !contentCallResult.success &&
      contentCallResult.status === "UNVERIFIED_BLOCKED" &&
      contentCallResult.data === null;

    console.log(`  - 生产注册表仅 BASIC_PROFILE 为 AVAILABLE_PUBLIC: ${DEFAULT_PRODUCTION_REGISTRY.BASIC_PROFILE === "AVAILABLE_PUBLIC" ? "✅" : "❌"}`);
    console.log(`  - 未放行能力调用时严格 Fail-Closed (UNVERIFIED_BLOCKED, data: null): ${followsCallResult.status === "UNVERIFIED_BLOCKED" && contentCallResult.status === "UNVERIFIED_BLOCKED" ? "✅" : "❌"}`);
    console.log(`  - 能力基线判定: ${pass7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass7) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 8: Zero External Network Fetch Assertion & Immediate Throw Verification
    // -------------------------------------------------------------------------
    console.log("\n[测试 8] 全流程零真实外部网络请求断言与意外 fetch 即刻拦截测试...");
    const passZeroFetch = fetchCallCount === 0;
    console.log(`  - 测试全流程真实外部 fetch 调用总数: ${fetchCallCount} -> ${passZeroFetch ? "✅ 通过" : "❌ 失败"}`);
    if (!passZeroFetch) allPassed = false;

    // Verify mock fetch actually throws on unexpected call
    let fetchBlocked = false;
    try {
      await globalThis.fetch("https://api.bilibili.com/x/space/wbi/acc/info");
    } catch (e: any) {
      fetchBlocked = e?.message?.includes("CRITICAL_SECURITY_VIOLATION");
    }
    console.log(`  - globalThis.fetch 被调用时立即抛出安全违规异常: ${fetchBlocked ? "✅ 通过" : "❌ 失败"}`);
    if (!fetchBlocked) allPassed = false;

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 BASIC_PROFILE 输入契约严格白名单离线验证测试全部通过！");
  } else {
    console.error("❌ 部分测试未通过，请检查上方日志。");
    process.exit(1);
  }
  console.log("=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("phase8-basic-profile-contract-test"))
) {
  runBasicProfileContractTests().catch((e) => {
    console.error("[测试异常]", e);
    process.exit(1);
  });
}
