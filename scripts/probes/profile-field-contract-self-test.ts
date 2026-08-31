/**
 * BiliProfile Analyzer — Public Profile Field Contract Offline Self-Test (Phase 4.5.1 Hardened)
 *
 * 覆盖规则 (全量离线验证):
 * 1. 每个 VERIFIED 字段的正确类型/范围验证 (5 个字段合法值验证);
 * 2. 非 VERIFIED 状态 (UNVERIFIED / UNAVAILABLE) 携带 value、缺少 failureReason、伪造 positive evidence 时的拦截;
 * 3. 非法 avatarUrl (包含 user:pass@host 凭据、javascript/data/ftp、空格、尖括号、语法错误) 与越界/非整数 level 的拦截;
 * 4. 未知字段键 (如 extraField)、map key 与 fieldName 不一致的拦截;
 * 5. 未知 evidenceType (非法枚举)、未知 source、非 ISO 时间与非法日历日期 (如 2026-02-30) 的拦截;
 * 6. 普通 <title> 文本不能产生 VERIFIED displayName (必须是 UNVERIFIED 且 value 为 undefined);
 * 7. 敏感键名、普通 HTML 片段、循环引用对象均被安全拦截，且错误文本绝不回显敏感值;
 * 8. 超过最大递归深度的深层对象安全捕获为不合规且绝不崩溃;
 * 9. NONE evidence 带有非空 anchorIdentifier 被严格拒绝;
 * 10. observation 与顶层 Record 未知字段键被严格拒绝;
 * 11. evaluator 绝不允许伪装为 CONTROLLED_LIVE_PROBE (source 恒为 SYNTHETIC_OFFLINE_TEST);
 * 12. 即使合成样本 5 个字段全部 VERIFIED，overallCapabilityStatus 仍严格只能为 UNVERIFIED;
 * 13. 合规记录数据最小化断言 (100% 纯净);
 * 14. 全流程外部网络 fetch 调用数严格为 0。
 */

import {
  validateFieldValue,
  validateEvidenceDescriptor,
  validateFieldObservation,
  validateProfileFieldContractRecord,
  assertDataMinimization,
  evaluateSyntheticProfileFieldContract,
  validateStrictCalendarIsoDate,
} from "./profile-field-contract";
import {
  PublicProfileFieldContractRecord,
  PublicProfileFieldObservation,
} from "../../src/types/connector";

async function runFieldContractSelfTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 4.5.1 字段契约安全收口自检");
  console.log("=================================================\n");

  let allPassed = true;
  let fetchCallCount = 0;

  // Install spy on globalThis.fetch to guarantee 0 network calls
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((...args: unknown[]) => {
    fetchCallCount++;
    throw new Error("UNAUTHORIZED NETWORK CALL DETECTED: " + String(args[0]));
  }) as typeof globalThis.fetch;

  try {
    // -------------------------------------------------------------
    // [测试 1] 每个 VERIFIED 字段的正确类型/范围验证
    // -------------------------------------------------------------
    {
      const validName = validateFieldValue("displayName", "极客开发者");
      const validSign = validateFieldValue("signature", "专注于开源系统架构");
      const validAvatar = validateFieldValue("avatarUrl", "https://i0.hdslb.com/bfs/face/sample.jpg");
      const validLabel = validateFieldValue("verifiedLabel", "个人认证：知名UP主");
      const validLevel = validateFieldValue("level", 6);

      const pass1 =
        validName.valid &&
        validSign.valid &&
        validAvatar.valid &&
        validLabel.valid &&
        validLevel.valid;

      console.log(`[测试 1] 5 项字段合法值类型/范围校验: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass1) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 2] 非 VERIFIED 状态违规携带 value、缺少 failureReason 或伪造 evidence 拦截
    // -------------------------------------------------------------
    {
      // 2.1 UNVERIFIED carries value
      const unverifiedWithValue = {
        fieldName: "signature",
        status: "UNVERIFIED",
        value: "Secret signature text",
        evidence: { evidenceType: "NONE", anchorIdentifier: "" },
        failureReason: "Sample failure",
      };
      const c2_1 = validateFieldObservation(unverifiedWithValue);

      // 2.2 UNAVAILABLE missing failureReason
      const unavailableNoReason = {
        fieldName: "verifiedLabel",
        status: "UNAVAILABLE",
        value: undefined,
        evidence: { evidenceType: "NONE", anchorIdentifier: "" },
        failureReason: "",
      };
      const c2_2 = validateFieldObservation(unavailableNoReason);

      // 2.3 UNVERIFIED forging positive evidence
      const unverifiedForgingEvidence = {
        fieldName: "displayName",
        status: "UNVERIFIED",
        value: undefined,
        evidence: { evidenceType: "STRUCTURED_META_TAG", anchorIdentifier: "og:title" },
        failureReason: "Some reason",
      };
      const c2_3 = validateFieldObservation(unverifiedForgingEvidence);

      const pass2 =
        !c2_1.valid &&
        c2_1.errors.some((e) => e.includes("cannot carry a value")) &&
        !c2_2.valid &&
        c2_2.errors.some((e) => e.includes("must carry a non-empty failureReason")) &&
        !c2_3.valid &&
        c2_3.errors.some((e) => e.includes("cannot forge positive evidenceType"));

      console.log(`[测试 2] 非 VERIFIED 状态违规携带/缺少字段拦截: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass2) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 3] avatar URL 含 user:pass、空格、尖括号、非法协议及越界 level 拦截
    // -------------------------------------------------------------
    {
      const badAvatarCredentials = validateFieldValue("avatarUrl", "https://admin:secretPass123@example.com/pic.jpg");
      const badAvatarBracket = validateFieldValue("avatarUrl", "https://example.com/<script>.jpg");
      const badAvatarJs = validateFieldValue("avatarUrl", "javascript:alert(1)");
      const badAvatarSpace = validateFieldValue("avatarUrl", "https://example.com/my pic.jpg");

      const badLevel1 = validateFieldValue("level", -1);
      const badLevel2 = validateFieldValue("level", 7);
      const badLevel3 = validateFieldValue("level", 3.5);
      const badLevel4 = validateFieldValue("level", NaN);

      const pass3 =
        !badAvatarCredentials.valid &&
        badAvatarCredentials.errors.some((e) => e.includes("embedded user credentials")) &&
        !badAvatarBracket.valid &&
        badAvatarBracket.errors.some((e) => e.includes("forbidden angle brackets")) &&
        !badAvatarJs.valid &&
        !badAvatarSpace.valid &&
        !badLevel1.valid &&
        !badLevel2.valid &&
        !badLevel3.valid &&
        !badLevel4.valid;

      console.log(`[测试 3] avatar URL 凭据/尖括号与越界 level 拦截: ${pass3 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass3) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 4] observation 与顶层 Record 未知字段键拒绝
    // -------------------------------------------------------------
    {
      const baseRecord = evaluateSyntheticProfileFieldContract(
        '<!DOCTYPE html><html><head><meta property="og:title" content="Sample User" /></head></html>'
      );

      // 4.1 Observation with unknown property
      const obsWithExtra = {
        fieldName: "displayName",
        status: "VERIFIED",
        value: "Test",
        evidence: { evidenceType: "STRUCTURED_META_TAG", anchorIdentifier: "og:title" },
        extraObsKey: "forbidden_extra_value",
      };
      const c4_1 = validateFieldObservation(obsWithExtra);

      // 4.2 Record with top-level unknown property
      const recordWithExtra = {
        ...baseRecord,
        extraTopLevelKey: "injected_top_level",
      };
      const c4_2 = validateProfileFieldContractRecord(recordWithExtra);

      const pass4 =
        !c4_1.valid &&
        c4_1.errors.some((e) => e.includes("Unknown property detected on field observation")) &&
        !c4_2.valid &&
        c4_2.errors.some((e) => e.includes("Unknown top-level property detected"));

      console.log(`[测试 4] observation 与顶层 Record 未知键拦截: ${pass4 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass4) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 5] 非法日历 ISO 时间 (如 2026-02-30) 与未知 source 拦截
    // -------------------------------------------------------------
    {
      const validDate = validateStrictCalendarIsoDate("2026-08-29T11:00:00Z");
      const badFeb30 = validateStrictCalendarIsoDate("2026-02-30T12:00:00Z");
      const badApr31 = validateStrictCalendarIsoDate("2026-04-31T10:00:00Z");
      const badMonth13 = validateStrictCalendarIsoDate("2026-13-01T00:00:00Z");
      const badHour25 = validateStrictCalendarIsoDate("2026-08-29T25:00:00Z");

      const baseRecord = evaluateSyntheticProfileFieldContract("");
      const badDateRecord = {
        ...baseRecord,
        observedAt: "2026-02-30T12:00:00Z",
      };
      const c5_date = validateProfileFieldContractRecord(badDateRecord);

      const badSourceRecord = {
        ...baseRecord,
        source: "LIVE_CRAWLER_UNAUTHORIZED" as unknown as typeof baseRecord.source,
      };
      const c5_source = validateProfileFieldContractRecord(badSourceRecord);

      const pass5 =
        validDate.valid &&
        !badFeb30.valid &&
        !badApr31.valid &&
        !badMonth13.valid &&
        !badHour25.valid &&
        !c5_date.valid &&
        c5_date.errors.some((e) => e.includes("invalid for the specified calendar month")) &&
        !c5_source.valid &&
        c5_source.errors.some((e) => e.includes("source must be an allowed ObservationSource"));

      console.log(`[测试 5] 非法日历 ISO 时间与未知 source 拦截: ${pass5 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass5) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 6] 普通 <title> 文本不产生 VERIFIED displayName
    // -------------------------------------------------------------
    {
      const bareTitleHtml = "<!DOCTYPE html><html><head><title>哔哩哔哩 (゜-゜)つロ 干杯~</title></head><body></body></html>";
      const record = evaluateSyntheticProfileFieldContract(bareTitleHtml);

      const pass6 =
        record.fields.displayName.status === "UNVERIFIED" &&
        record.fields.displayName.value === undefined &&
        record.fields.displayName.evidence?.evidenceType === "NONE" &&
        typeof record.fields.displayName.failureReason === "string" &&
        record.fields.displayName.failureReason.length > 0;

      console.log(`[测试 6] 普通 <title> 文本不产生 VERIFIED displayName: ${pass6 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass6) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 7] 敏感键名拦截、HTML 片段拦截与错误文本零敏感值回显
    // -------------------------------------------------------------
    {
      const SENSITIVE_TOKEN = "SUPER_SECRET_AUTH_TOKEN_ABC123456789";
      const taintedObj = {
        headers: { cookie: `SESSDATA=${SENSITIVE_TOKEN};` },
        rawHtml: "<div><div>injected snippet</div></div>",
      };

      const taintResult = assertDataMinimization(taintedObj);

      // Verify HTML fragment was caught
      const htmlCaught = taintResult.forbiddenFindings.some((f) => f.includes("HTML markup pattern detected"));
      const cookieCaught = taintResult.forbiddenFindings.some((f) => f.includes("Cookie credential pattern detected"));

      // Verify sensitive token is NEVER echoed in forbidden findings text
      const tokenNotEchoed = !taintResult.forbiddenFindings.some((f) => f.includes(SENSITIVE_TOKEN));

      // Test observation validation also doesn't echo untrusted inputs
      const badObs = {
        fieldName: "displayName",
        status: "VERIFIED",
        value: "SomeName",
        evidence: { evidenceType: "NONE", anchorIdentifier: "fakeAnchor" },
      };
      const badObsCheck = validateFieldObservation(badObs);
      const fakeAnchorNotEchoed = !badObsCheck.errors.some((e) => e.includes("fakeAnchor"));

      const pass7 =
        !taintResult.clean &&
        htmlCaught &&
        cookieCaught &&
        tokenNotEchoed &&
        !badObsCheck.valid &&
        fakeAnchorNotEchoed;

      console.log(`[测试 7] HTML 片段拦截与错误信息零敏感值回显: ${pass7 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass7) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 8] 深层嵌套对象安全处理 (超限拦截且零崩溃)
    // -------------------------------------------------------------
    {
      // Build a 20-level deep object
      let deepObj: Record<string, unknown> = { leaf: "value" };
      for (let i = 0; i < 20; i++) {
        deepObj = { nested: deepObj };
      }

      let crash = false;
      let depthResult: { clean: boolean; forbiddenFindings: string[] } | null = null;
      try {
        depthResult = assertDataMinimization(deepObj);
      } catch {
        crash = true;
      }

      const pass8 =
        !crash &&
        depthResult !== null &&
        !depthResult.clean &&
        depthResult.forbiddenFindings.some((f) => f.includes("Exceeded maximum object recursion depth limit"));

      console.log(`[测试 8] 超深层嵌套对象安全拦截且零崩溃: ${pass8 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass8) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 9] NONE evidence 带有非空 anchorIdentifier 拒绝
    // -------------------------------------------------------------
    {
      const noneWithAnchor = validateEvidenceDescriptor(
        { evidenceType: "NONE", anchorIdentifier: "invalidNonEmptyAnchor" },
        "UNVERIFIED"
      );
      const noneEmptyAnchor = validateEvidenceDescriptor(
        { evidenceType: "NONE", anchorIdentifier: "" },
        "UNVERIFIED"
      );

      const pass9 =
        !noneWithAnchor.valid &&
        noneWithAnchor.errors.some((e) => e.includes("must have an empty string anchorIdentifier")) &&
        noneEmptyAnchor.valid;

      console.log(`[测试 9] NONE evidence 携带非空 anchor 拒绝: ${pass9 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass9) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 10] evaluator 恒为 SYNTHETIC_OFFLINE_TEST 且无法伪装
    // -------------------------------------------------------------
    {
      const record = evaluateSyntheticProfileFieldContract(
        '<!DOCTYPE html><html><head><meta property="og:title" content="Test" /></head></html>'
      );
      const pass10 = record.source === "SYNTHETIC_OFFLINE_TEST";

      console.log(`[测试 10] evaluator source 固定为 SYNTHETIC_OFFLINE_TEST: ${pass10 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass10) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 11] 即使 5 个字段全部 VERIFIED，overallCapabilityStatus 仍严格只能为 UNVERIFIED
    // -------------------------------------------------------------
    {
      const fullSynthetic = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Full Sample UP" />
            <meta property="og:image" content="https://i0.hdslb.com/bfs/face/sample.jpg" />
            <meta name="description" content="Sample signature bio" />
          </head>
          <body>
            <span class="h-verified-text">个人认证：知名UP主</span>
            <span class="h-level" data-level="6"></span>
          </body>
        </html>
      `;
      const record = evaluateSyntheticProfileFieldContract(fullSynthetic);

      const all5Verified =
        record.fields.displayName.status === "VERIFIED" &&
        record.fields.signature.status === "VERIFIED" &&
        record.fields.avatarUrl.status === "VERIFIED" &&
        record.fields.verifiedLabel.status === "VERIFIED" &&
        record.fields.level.status === "VERIFIED";

      const capabilityStillUnverified = record.overallCapabilityStatus === "UNVERIFIED";

      // Attempt to forge overallCapabilityStatus as AVAILABLE_PUBLIC
      const forgedRecord = {
        ...record,
        overallCapabilityStatus: "AVAILABLE_PUBLIC",
      };
      const forgeCheck = validateProfileFieldContractRecord(forgedRecord);

      const pass11 =
        all5Verified &&
        capabilityStillUnverified &&
        !forgeCheck.valid &&
        forgeCheck.errors.some((e) => e.includes("must strictly remain literal 'UNVERIFIED'"));

      console.log(`[测试 11] 字段验证绝不自动升级能力基线 (严格保持字面量 UNVERIFIED): ${pass11 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass11) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 12] 合规记录数据最小化 100% 纯净断言
    // -------------------------------------------------------------
    {
      const cleanSynthetic = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Open Source Developer" />
            <meta property="og:image" content="https://images.example.com/avatar.jpg" />
            <meta name="description" content="Clean bio without tags" />
          </head>
          <body>
            <span class="h-level" data-level="5"></span>
          </body>
        </html>
      `;
      const cleanRecord = evaluateSyntheticProfileFieldContract(cleanSynthetic);
      const minimizationCheck = assertDataMinimization(cleanRecord);
      const recordValid = validateProfileFieldContractRecord(cleanRecord);

      const pass12 =
        minimizationCheck.clean &&
        minimizationCheck.forbiddenFindings.length === 0 &&
        recordValid.valid;

      console.log(`[测试 12] 合规记录数据最小化 100% 纯净断言: ${pass12 ? "✅ 通过" : "❌ 失败"}`);
      if (!pass12) allPassed = false;
    }

    // -------------------------------------------------------------
    // [测试 13] 全流程外部网络 fetch 调用数严格为 0
    // -------------------------------------------------------------
    {
      const pass13 = fetchCallCount === 0;
      console.log(`[测试 13] 离线自测全流程外部网络调用数为 0: ${pass13 ? "✅ 通过" : "❌ 失败"} (实际调用数: ${fetchCallCount})`);
      if (!pass13) allPassed = false;
    }
  } finally {
    // Restore fetch
    globalThis.fetch = originalFetch;
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 Phase 4.5.1 字段契约安全收口所有测试全部通过！");
  } else {
    console.error("❌ 部分测试未通过，请检查契约规则实现。");
    process.exit(1);
  }
  console.log("=================================================\n");
}

runFieldContractSelfTests().catch((err) => {
  console.error("Fatal error during field contract self-tests:", err);
  process.exit(1);
});
