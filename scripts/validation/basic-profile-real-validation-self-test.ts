/**
 * BiliProfile Analyzer — Phase 8.2.1 Real Validation Gate Comprehensive Offline Self-Test
 *
 * Test Invariants:
 * 1. 100% pure offline test (strictly 0 real network calls).
 * 2. globalThis.fetch is mocked and any unexpected call throws immediately.
 * 3. All audit writes during self-test go to an isolated temporary directory; docs/validation/ is NEVER touched.
 * 4. Verifies recursive Buffer-hash & directory existence immutability of docs/validation/ before and after test suite.
 * 5. Full restoration of process.env state upon completion.
 * 6. Verifies streaming reader 64 KiB cap and missing res.body fail-closed behavior (SAFETY_BOUNDARY_VIOLATION).
 * 7. Verifies bodyFormat enum and zero raw response header / UID / URL / payload / markup / error message persistence.
 * 8. Verifies error categories: ENVIRONMENT_FAILURE, AUTHENTICATION_REQUIRED, ACCESS_BLOCKED, RATE_LIMITED, CONTRACT_INSUFFICIENT, SAFETY_BOUNDARY_VIOLATION, AI_STAGE_UNAVAILABLE.
 * 9. Verifies that REAL_CONNECTOR mode NEVER falls back to LOCAL_FIXTURE on any failure.
 * 10. Verifies that the real validation runner never outputs "BASIC_PROFILE 可以正式接入", but pure decision rule logic is verified across REAL_CONNECTOR / LOCAL_FIXTURE / isSuccessResponse boundaries.
 * 11. Verifies 0-fetch fail-closed enforcement for invalid UIDs (>16 digits, non-numeric, traversal) and tampered URLs.
 * 12. Verifies that error summaries and top-level exits never leak raw exception objects or raw error messages.
 * 13. Verifies that writeAuditArtifacts and evaluateValidationDecision strictly enforce static whitelist boundaries against poisoned inputs.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import {
  runBasicProfileRealValidation,
  computeAuditChainHash,
  evaluateValidationDecision,
  validateTargetUid,
  validateApprovedRequestUrl,
  writeAuditArtifacts,
  ValidationAuditReport,
} from "./basic-profile-real-validation";
import { DEFAULT_PRODUCTION_REGISTRY, BilibiliPublicConnector } from "../../src/lib/connectors/bilibili-public-connector";

// Setup strict fetch interceptor & call tracking
let mockFetchHandler: ((url: string, init?: any) => Promise<Response>) | null = null;
let lastCapturedRequestInit: RequestInit | undefined = undefined;
let lastCapturedUrl: string | undefined = undefined;
let fetchInvocationCount = 0;
let unexpectedFetchCallCount = 0;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === "string" ? input : input.toString();
  lastCapturedUrl = urlStr;
  lastCapturedRequestInit = init;
  fetchInvocationCount++;

  if (mockFetchHandler) {
    return mockFetchHandler(urlStr, init);
  }
  unexpectedFetchCallCount++;
  throw new Error(
    `[CRITICAL_SECURITY_VIOLATION] 离线自测中发生未被受控 Mock 的真实网络调用！Target: ${urlStr}`
  );
};

/**
 * Creates a mock Response with a ReadableStream body to accurately test streaming chunk limits.
 */
function createStreamMockResponse(
  chunks: Uint8Array[],
  status: number = 200,
  headersMap: Record<string, string> = { "content-type": "text/html" }
): Response {
  let chunkIndex = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(chunks[chunkIndex++]);
      } else {
        controller.close();
      }
    },
  });

  return {
    status,
    headers: {
      get: (key: string) => headersMap[key.toLowerCase()] || null,
    },
    body: stream,
    text: async () => {
      throw new Error("res.text() must NEVER be called when streaming reader is active!");
    },
  } as unknown as Response;
}

function createTextMockResponse(
  bodyText: string,
  status: number = 200,
  headersMap: Record<string, string> = { "content-type": "text/html" }
): Response {
  const encoded = new TextEncoder().encode(bodyText);
  return createStreamMockResponse([encoded], status, headersMap);
}

export interface DirectorySnapshot {
  exists: boolean;
  files: Map<string, string>;
}

/**
 * Recursively snapshots a directory recording existence and relative path -> SHA-256 Buffer hashes.
 */
export function snapshotDirectoryBuffers(dirPath: string): DirectorySnapshot {
  if (!fs.existsSync(dirPath)) {
    return { exists: false, files: new Map() };
  }

  const files = new Map<string, string>();

  function walk(currentDir: string, relBase: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const fileBuffer = fs.readFileSync(fullPath);
        const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
        files.set(relPath, hash);
      }
    }
  }

  walk(dirPath, "");
  return { exists: true, files };
}

export function compareDirectorySnapshots(
  before: DirectorySnapshot,
  after: DirectorySnapshot
): boolean {
  if (before.exists !== after.exists) return false;
  if (before.files.size !== after.files.size) return false;
  for (const [relPath, beforeHash] of before.files.entries()) {
    const afterHash = after.files.get(relPath);
    if (beforeHash !== afterHash) return false;
  }
  return true;
}

async function runValidationSelfTest() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — Phase 8.2.1 验证 Gate 综合离线自测");
  console.log("=================================================\n");

  let allPassed = true;
  const tempTestDir = path.join(os.tmpdir(), `val-test-8-2-1-${Date.now()}`);
  fs.mkdirSync(tempTestDir, { recursive: true });

  // Snapshot initial process.env state
  const initialEnvSnapshot = { ...process.env };

  // Record recursive Buffer-hash snapshot of docs/validation
  const docsValDir = path.join(process.cwd(), "docs", "validation");
  const beforeDocsSnapshot = snapshotDirectoryBuffers(docsValDir);

  try {
    // -------------------------------------------------------------------------
    // Test 1: Capability Baseline Check
    // -------------------------------------------------------------------------
    console.log("[测试 1] 生产注册表与 Connector Capability 基线隔离测试...");
    const connector = new BilibiliPublicConnector();
    const pass1 =
      DEFAULT_PRODUCTION_REGISTRY.BASIC_PROFILE === "AVAILABLE_PUBLIC" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_FOLLOWS === "UNVERIFIED" &&
      DEFAULT_PRODUCTION_REGISTRY.PUBLIC_CONTENT === "UNVERIFIED" &&
      connector.getCapabilityStatus("BASIC_PROFILE") === "AVAILABLE_PUBLIC" &&
      connector.getCapabilityStatus("PUBLIC_FOLLOWS") === "UNVERIFIED" &&
      connector.getCapabilityStatus("PUBLIC_CONTENT") === "UNVERIFIED";
    console.log(`  - 生产注册表仅 BASIC_PROFILE 为 AVAILABLE_PUBLIC，其余恒为 UNVERIFIED: ${pass1 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass1) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 2: Missing Switch -> UNAVAILABLE & ENVIRONMENT_FAILURE (0 fetch)
    // -------------------------------------------------------------------------
    console.log("\n[测试 2] 缺少环境变量时安全阻断与 UNAVAILABLE 判定 (0 fetch)...");
    delete process.env.RUN_REAL_BASIC_PROFILE_VALIDATION;
    delete process.env.BASIC_PROFILE_VALIDATION_TARGET_UID;

    const startFetchCount = fetchInvocationCount;
    const reportUnavailable = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass2 =
      reportUnavailable.validationMode === "UNAVAILABLE" &&
      reportUnavailable.errorCode === "ENVIRONMENT_FAILURE" &&
      reportUnavailable.requestRecords.length === 0 &&
      reportUnavailable.finalConclusion === "当前环境无法完成验证，需要以下前置条件" &&
      fetchInvocationCount === startFetchCount;
    console.log(`  - 缺少环境变量判定为 UNAVAILABLE 与 ENVIRONMENT_FAILURE 且 0 fetch: ${pass2 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass2) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 3: Invalid UID Format & Length Bounds (0 fetch)
    // -------------------------------------------------------------------------
    console.log("\n[测试 3] 非法 UID (字母/越界/特殊字符/超长) 严格阻断与 0 fetch 测试...");
    process.env.RUN_REAL_BASIC_PROFILE_VALIDATION = "true";

    const invalidUids = [
      "abc123", // letters
      "../12345", // path traversal
      "-12345", // negative
      "12345678901234567", // 17 digits (>16 limit)
      " 12345 ", // whitespace
      "", // empty
    ];

    let invalidUidPass = true;
    for (const badUid of invalidUids) {
      process.env.BASIC_PROFILE_VALIDATION_TARGET_UID = badUid;
      const countBefore = fetchInvocationCount;
      const res = await runBasicProfileRealValidation({ outputDir: tempTestDir });
      if (
        res.validationMode !== "UNAVAILABLE" ||
        res.errorCode !== "ENVIRONMENT_FAILURE" ||
        fetchInvocationCount !== countBefore ||
        validateTargetUid(badUid) !== false
      ) {
        invalidUidPass = false;
        break;
      }
    }
    console.log(`  - 所有非法 UID 格式与超长 UID 均被阻断为 UNAVAILABLE 且 0 fetch: ${invalidUidPass ? "✅ 通过" : "❌ 失败"}`);
    if (!invalidUidPass) allPassed = false;

    // Set valid test UID for subsequent tests
    process.env.BASIC_PROFILE_VALIDATION_TARGET_UID = "9876543210";

    // -------------------------------------------------------------------------
    // Test 4: URL Whitelist & Origin Strictness Check (0 fetch on tampered URL)
    // -------------------------------------------------------------------------
    console.log("\n[测试 4] 请求 URL 白名单与精准 Origin/Path 校验测试...");
    const validUrl = "https://space.bilibili.com/9876543210";
    const tamperedUrls = [
      "http://space.bilibili.com/9876543210", // http protocol
      "https://api.bilibili.com/9876543210", // wrong host
      "https://space.bilibili.com/9876543210/favlist", // extra path
      "https://space.bilibili.com/9876543210?param=1", // query params
      "https://space.bilibili.com/9876543210#hash", // hash fragment
      "https://space.bilibili.com:8080/9876543210", // custom port
    ];

    const isGoodValid = validateApprovedRequestUrl(validUrl, "9876543210");
    const allBadInvalid = tamperedUrls.every((u) => !validateApprovedRequestUrl(u, "9876543210"));
    const pass4 = isGoodValid && allBadInvalid;
    console.log(`  - 仅严格放行精确空间 URL 格式，拒绝协议/子域名/子路径/查询参数篡改: ${pass4 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass4) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 5: Single GET, credentials=omit, redirect=manual, no credentials
    // -------------------------------------------------------------------------
    console.log("\n[测试 5] 单次 GET 请求参数与零凭据拦截测试...");
    mockFetchHandler = async () => createTextMockResponse("<html><body><meta property=\"og:title\" content=\"测试空间的个人空间\"/></body></html>", 200);

    fetchInvocationCount = 0;
    lastCapturedRequestInit = undefined;
    await runBasicProfileRealValidation({ outputDir: tempTestDir });

    const captured = lastCapturedRequestInit as RequestInit | undefined;
    const headersObj = (captured?.headers || {}) as Record<string, string>;
    const pass5 =
      fetchInvocationCount === 1 &&
      captured?.method === "GET" &&
      captured?.credentials === "omit" &&
      captured?.redirect === "manual" &&
      !headersObj["cookie"] &&
      !headersObj["Cookie"] &&
      !headersObj["authorization"] &&
      !headersObj["Authorization"] &&
      !headersObj["token"];
    console.log(`  - 单次 GET 请求严格符合 credentials:omit, redirect:manual 且零凭据: ${pass5 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass5) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 6: Missing res.body Fail-Closed (Never call res.text())
    // -------------------------------------------------------------------------
    console.log("\n[测试 6] res.body 为空时安全熔断 (SAFETY_BOUNDARY_VIOLATION, 禁调用 text())...");
    mockFetchHandler = async () =>
      ({
        status: 200,
        headers: { get: () => "text/html" },
        body: null,
        text: async () => {
          throw new Error("[SECURITY_VIOLATION] res.text() 被非法调用！");
        },
      } as unknown as Response);

    const reportNoBody = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass6 =
      reportNoBody.validationMode === "REAL_CONNECTOR" &&
      reportNoBody.errorCode === "SAFETY_BOUNDARY_VIOLATION" &&
      reportNoBody.finalConclusion === "BASIC_PROFILE 暂时不能正式接入" &&
      reportNoBody.pipelineShadowRun.normalize === "NOT_RUN" &&
      reportNoBody.requestRecords[0]?.responseBodyHash === null;
    console.log(`  - 缺少可读流体时直接触发 SAFETY_BOUNDARY_VIOLATION 且未调用 text(): ${pass6 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass6) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 7: Stream Byte Cap Exceeded (> 64 KiB) -> SAFETY_BOUNDARY_VIOLATION
    // -------------------------------------------------------------------------
    console.log("\n[测试 7] 流式读取超限 (>64 KiB) 安全熔断与 SAFETY_BOUNDARY_VIOLATION 测试...");
    const chunk1 = new Uint8Array(40 * 1024).fill(65); // 40 KiB
    const chunk2 = new Uint8Array(30 * 1024).fill(66); // 30 KiB -> total 70 KiB
    mockFetchHandler = async () => createStreamMockResponse([chunk1, chunk2], 200);

    const reportOverLimit = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass7 =
      reportOverLimit.validationMode === "REAL_CONNECTOR" &&
      reportOverLimit.errorCode === "SAFETY_BOUNDARY_VIOLATION" &&
      reportOverLimit.finalConclusion === "BASIC_PROFILE 暂时不能正式接入" &&
      reportOverLimit.pipelineShadowRun.normalize === "NOT_RUN" &&
      reportOverLimit.requestRecords[0]?.responseBodyHash === null;
    console.log(`  - 超过 64 KiB 立即熔断为 SAFETY_BOUNDARY_VIOLATION 且不进入流水线: ${pass7 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass7) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 8: Simulated 401 / Authentication Required
    // -------------------------------------------------------------------------
    console.log("\n[测试 8] 模拟 401 / 登录要求响应测试...");
    mockFetchHandler = async () => createTextMockResponse("<html><body>需要登录账号后查看 (-101)</body></html>", 401);

    const report401 = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass8 =
      report401.validationMode === "REAL_CONNECTOR" &&
      report401.errorCode === "AUTHENTICATION_REQUIRED" &&
      report401.finalConclusion === "BASIC_PROFILE 暂时不能正式接入" &&
      report401.sourceAssessment.authenticationRequiredObserved === true;
    console.log(`  - 401 响应正确分类为 AUTHENTICATION_REQUIRED: ${pass8 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass8) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 9: Simulated 403 / Access Blocked & Anti-Bot
    // -------------------------------------------------------------------------
    console.log("\n[测试 9] 模拟 403 访问阻断与反爬响应测试...");
    mockFetchHandler = async () => createTextMockResponse("<html><body>403 Forbidden -403</body></html>", 403);

    const report403 = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass9 =
      report403.validationMode === "REAL_CONNECTOR" &&
      report403.errorCode === "ACCESS_BLOCKED" &&
      report403.sourceAssessment.antiBotObserved === true;
    console.log(`  - 403 响应正确分类为 ACCESS_BLOCKED: ${pass9 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass9) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 10: Simulated 429 / Rate Limited
    // -------------------------------------------------------------------------
    console.log("\n[测试 10] 模拟 429 / 限流响应测试...");
    mockFetchHandler = async () => createTextMockResponse("<html><body>429 Too Many Requests -412</body></html>", 429);

    const report429 = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass10 =
      report429.validationMode === "REAL_CONNECTOR" &&
      report429.errorCode === "RATE_LIMITED" &&
      report429.sourceAssessment.rateLimitObserved === true;
    console.log(`  - 429 响应正确分类为 RATE_LIMITED: ${pass10 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass10) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 11: Simulated Network Transport Error
    // -------------------------------------------------------------------------
    console.log("\n[测试 11] 模拟网络传输异常与脱敏错误摘要测试...");
    mockFetchHandler = async () => {
      throw new Error("getaddrinfo ENOTFOUND space.bilibili.com");
    };

    const reportNetErr = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass11 =
      reportNetErr.validationMode === "REAL_CONNECTOR" &&
      reportNetErr.errorCode === "ENVIRONMENT_FAILURE" &&
      reportNetErr.errorSummary === "网络传输异常: DNS 解析失败";
    console.log(`  - 网络异常正确脱敏为白名单摘要: ${pass11 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass11) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 12: Simulated Missing Required Fields / Contract Insufficient
    // -------------------------------------------------------------------------
    console.log("\n[测试 12] 模拟缺失必填昵称字段与契约不足测试...");
    mockFetchHandler = async () => createTextMockResponse("<html><head><title>空白页面</title></head><body></body></html>", 200);

    const reportContractIns = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass12 =
      reportContractIns.validationMode === "REAL_CONNECTOR" &&
      reportContractIns.errorCode === "CONTRACT_INSUFFICIENT" &&
      reportContractIns.contractCompatibility.mappingResult === "FAILED";
    console.log(`  - 缺失必填字段正确判定为 CONTRACT_INSUFFICIENT: ${pass12 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass12) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 13: Enhanced Audit Zero Leakage Verification (UID/URL/Title/Sign/Avatar/Header/Markup)
    // -------------------------------------------------------------------------
    console.log("\n[测试 13] 强化审计文件零泄露双重校验 (JSON 与 MD 逐项断言)...");
    const richPayloadHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="超级测试UP主特有超长标题的个人空间" />
          <meta name="description" content="机密个人简介内容_SECRET_SIGN_12345" />
          <meta property="og:image" content="https://i0.hdslb.com/bfs/face/super_secret_avatar_9876543210.jpg" />
        </head>
        <body><div id="app"><span>正文内容</span></div></body>
      </html>
    `;
    mockFetchHandler = async () =>
      createTextMockResponse(richPayloadHtml, 200, {
        "content-type": "text/html; charset=utf-8; secret_header=xyz_token_999; <script>alert(1)</script>",
      });

    await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const jsonPathTemp = path.join(tempTestDir, "BASIC_PROFILE_REAL_VALIDATION.json");
    const mdPathTemp = path.join(tempTestDir, "BASIC_PROFILE_REAL_VALIDATION.md");
    const genJson = fs.readFileSync(jsonPathTemp, "utf8");
    const genMd = fs.readFileSync(mdPathTemp, "utf8");

    const rawContentMarkers = [
      "正文内容",
      "<!DOCTYPE html>",
      "<div id=\"app\">",
      "<span>",
    ];

    const jsonNoRawContent = rawContentMarkers.every((marker) => !genJson.includes(marker));
    const mdNoRawContent = rawContentMarkers.every((marker) => !genMd.includes(marker));

    const jsonLeakFree =
      jsonNoRawContent &&
      !genJson.includes("9876543210") &&
      !genJson.includes("https://space.bilibili.com/9876543210") &&
      !genJson.includes("超级测试UP主特有超长标题的个人空间") &&
      !genJson.includes("_SECRET_SIGN_12345") &&
      !genJson.includes("super_secret_avatar_9876543210.jpg") &&
      !genJson.includes("secret_header") &&
      !genJson.includes("xyz_token_999") &&
      !genJson.includes("<script>") &&
      !genJson.includes("\"contentType\"") &&
      !genJson.includes("\"responseMeta\"");

    const mdLeakFree =
      mdNoRawContent &&
      !genMd.includes("9876543210") &&
      !genMd.includes("https://space.bilibili.com/9876543210") &&
      !genMd.includes("超级测试UP主特有超长标题的个人空间") &&
      !genMd.includes("_SECRET_SIGN_12345") &&
      !genMd.includes("super_secret_avatar_9876543210.jpg") &&
      !genMd.includes("secret_header") &&
      !genMd.includes("xyz_token_999") &&
      !genMd.includes("<script>");

    const pass13 = jsonLeakFree && mdLeakFree && genJson.includes("\"bodyFormat\": \"HTML\"");
    console.log(`  - 审计 JSON 与 MD 均不含 UID/URL/标题/简介/头像/响应头/HTML标记: ${pass13 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass13) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 14: Real Connector Runner with Valid Data but AI Unavailable
    // -------------------------------------------------------------------------
    console.log("\n[测试 14] 数据源验证成功但 AI 未配置 -> '当前环境无法完成验证'...");
    const reportAiUnavail = await runBasicProfileRealValidation({ outputDir: tempTestDir });
    const pass14 =
      reportAiUnavail.validationMode === "REAL_CONNECTOR" &&
      reportAiUnavail.finalConclusion === "当前环境无法完成验证，需要以下前置条件" &&
      reportAiUnavail.errorCode === "AI_STAGE_UNAVAILABLE" &&
      reportAiUnavail.pipelineShadowRun.aiSynthesis === "NOT_RUN" &&
      reportAiUnavail.pipelineShadowRun.report === "PASSED" &&
      Boolean(reportAiUnavail.dataSourceSubAssessment);
    console.log(`  - 真实运行函数在 AI 未接入时严格输出 AI_STAGE_UNAVAILABLE 且不输出正式接入: ${pass14 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass14) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 15: Pure Decision Rule Unit Test (Decision Evaluator - All Boundaries)
    // -------------------------------------------------------------------------
    console.log("\n[测试 15] 纯决策规则单元测试 (覆盖 REAL_CONNECTOR / LOCAL_FIXTURE / isSuccessResponse 边界)...");
    // a. REAL_CONNECTOR + isSuccessResponse: true + all PASSED => 可以正式接入
    const passCaseA = evaluateValidationDecision({
      validationMode: "REAL_CONNECTOR",
      isSuccessResponse: true,
      hasMappedInput: true,
      hasExceededByteLimit: false,
      pipelineStages: {
        normalize: "PASSED",
        clean: "PASSED",
        extract: "PASSED",
        aggregate: "PASSED",
        statisticalAnalysis: "PASSED",
        report: "PASSED",
        aiSynthesis: "PASSED",
      },
      isAuthRequired: false,
      isRateLimited: false,
      isBlocked: false,
      hasRequestError: false,
    });

    // b. LOCAL_FIXTURE + all PASSED => 绝不可返回可以正式接入
    const passCaseB = evaluateValidationDecision({
      validationMode: "LOCAL_FIXTURE",
      isSuccessResponse: true,
      hasMappedInput: true,
      hasExceededByteLimit: false,
      pipelineStages: {
        normalize: "PASSED",
        clean: "PASSED",
        extract: "PASSED",
        aggregate: "PASSED",
        statisticalAnalysis: "PASSED",
        report: "PASSED",
        aiSynthesis: "PASSED",
      },
      isAuthRequired: false,
      isRateLimited: false,
      isBlocked: false,
      hasRequestError: false,
    });

    // c. REAL_CONNECTOR + isSuccessResponse: false + all PASSED => 绝不可返回可以正式接入
    const passCaseC = evaluateValidationDecision({
      validationMode: "REAL_CONNECTOR",
      isSuccessResponse: false,
      hasMappedInput: true,
      hasExceededByteLimit: false,
      pipelineStages: {
        normalize: "PASSED",
        clean: "PASSED",
        extract: "PASSED",
        aggregate: "PASSED",
        statisticalAnalysis: "PASSED",
        report: "PASSED",
        aiSynthesis: "PASSED",
      },
      isAuthRequired: false,
      isRateLimited: false,
      isBlocked: false,
      hasRequestError: false,
    });

    const pass15 =
      passCaseA.finalConclusion === "BASIC_PROFILE 可以正式接入" &&
      passCaseA.errorCode === undefined &&
      passCaseB.finalConclusion !== "BASIC_PROFILE 可以正式接入" &&
      passCaseB.errorCode === "CONTRACT_INSUFFICIENT" &&
      passCaseC.finalConclusion !== "BASIC_PROFILE 可以正式接入" &&
      passCaseC.errorCode === "CONTRACT_INSUFFICIENT";
    console.log(`  - 纯规则引擎严格限制仅 REAL_CONNECTOR + 成功响应 + 全项 PASSED 输出正式接入: ${pass15 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass15) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 16: Audit Chain Hash Recalculation & Integrity
    // -------------------------------------------------------------------------
    console.log("\n[测试 16] 审计链哈希 (auditChainHash) 可复算性与完整性测试...");
    const parsedReport: ValidationAuditReport = JSON.parse(genJson);
    const computedHash = computeAuditChainHash(parsedReport);
    const pass16 = parsedReport.auditChainHash === computedHash && computedHash.length === 64;
    console.log(`  - 审计链哈希与内容签名严格一致: ${pass16 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass16) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 17: Directory Snapshot Existence Differentiation Test
    // -------------------------------------------------------------------------
    console.log("\n[测试 17] 证明不存在目录与空目录为不同快照状态...");
    const nonExistentSnapshot = snapshotDirectoryBuffers(path.join(os.tmpdir(), `non_existent_${Date.now()}`));
    const emptyTestDir = path.join(os.tmpdir(), `empty_dir_${Date.now()}`);
    fs.mkdirSync(emptyTestDir, { recursive: true });
    const emptySnapshot = snapshotDirectoryBuffers(emptyTestDir);
    fs.rmdirSync(emptyTestDir);

    const pass17 =
      nonExistentSnapshot.exists === false &&
      emptySnapshot.exists === true &&
      compareDirectorySnapshots(nonExistentSnapshot, emptySnapshot) === false;
    console.log(`  - 不存在目录 (exists: false) 与空目录 (exists: true) 准确判定为不同状态: ${pass17 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass17) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 18: docs/validation/ Recursive Buffer Snapshot Immutability Check
    // -------------------------------------------------------------------------
    console.log("\n[测试 18] 正式审计目录 docs/validation/ 递归 Buffer 哈希不可变性断言...");
    const afterDocsSnapshot = snapshotDirectoryBuffers(docsValDir);
    const pass18 = compareDirectorySnapshots(beforeDocsSnapshot, afterDocsSnapshot);
    console.log(`  - docs/validation/ 目录全量文件 Buffer 哈希前后完全一致: ${pass18 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass18) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 19: Zero Unexpected Fetch Calls
    // -------------------------------------------------------------------------
    console.log("\n[测试 19] 全自测流程零未预期真实网络请求断言...");
    const pass19 = unexpectedFetchCallCount === 0;
    console.log(`  - 未被受控 Mock 的真实 fetch 请求数: ${unexpectedFetchCallCount} -> ${pass19 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass19) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 20: Strict Sanitization of Error Summaries (No Dynamic/Raw Text Injected)
    // -------------------------------------------------------------------------
    console.log("\n[测试 20] 错误摘要纯静态白名单化与零原始错误字符串注入测试...");
    const decisionWithFailureCategory = evaluateValidationDecision({
      validationMode: "REAL_CONNECTOR",
      isSuccessResponse: true,
      hasMappedInput: false,
      hasExceededByteLimit: false,
      pipelineStages: {
        normalize: "NOT_RUN",
        clean: "NOT_RUN",
        extract: "NOT_RUN",
        aggregate: "NOT_RUN",
        statisticalAnalysis: "NOT_RUN",
        report: "NOT_RUN",
        aiSynthesis: "NOT_RUN",
      },
      isAuthRequired: false,
      isRateLimited: false,
      isBlocked: false,
      hasRequestError: false,
      mappingFailureCategory: "MISSING_REQUIRED_FIELDS",
    });

    const errorSummaryText = decisionWithFailureCategory.errorSummary || "";
    const pass20Summary =
      errorSummaryText === "响应数据缺少 Phase 8.1 契约必填字段（如个人空间昵称）。" &&
      !errorSummaryText.includes("9876543210") &&
      !errorSummaryText.includes("space.bilibili.com");
    console.log(`  - 契约缺失错误严格映射为静态白名单文本: ${pass20Summary ? "✅ 通过" : "❌ 失败"}`);
    if (!pass20Summary) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 21: Mock Fetch Throws Arbitrary Tainted Exception (Tokens/UID/URL)
    // -------------------------------------------------------------------------
    console.log("\n[测试 21] 模拟网络异常抛出包含敏感 Token/UID/URL 异常文本的零泄露测试...");
    const taintedExceptionMarker = "MAGIC_SENSITIVE_LEAK_TOKEN_XYZ_999";
    const taintedToken = "SECRET_TOKEN_ABC_12345";
    mockFetchHandler = async () => {
      throw new Error(`Connection failed with ${taintedExceptionMarker} at https://space.bilibili.com/9876543210?token=${taintedToken}`);
    };

    const taintedNetTestDir = path.join(tempTestDir, "tainted_net_test");
    const taintedReport = await runBasicProfileRealValidation({ outputDir: taintedNetTestDir });

    const taintedJson = fs.readFileSync(path.join(taintedNetTestDir, "BASIC_PROFILE_REAL_VALIDATION.json"), "utf8");
    const taintedMd = fs.readFileSync(path.join(taintedNetTestDir, "BASIC_PROFILE_REAL_VALIDATION.md"), "utf8");

    const pass21 =
      taintedReport.errorCode === "ENVIRONMENT_FAILURE" &&
      !taintedReport.errorSummary?.includes(taintedExceptionMarker) &&
      !taintedReport.errorSummary?.includes(taintedToken) &&
      !taintedReport.errorSummary?.includes("9876543210") &&
      !taintedJson.includes(taintedExceptionMarker) &&
      !taintedJson.includes(taintedToken) &&
      !taintedJson.includes("9876543210") &&
      !taintedMd.includes(taintedExceptionMarker) &&
      !taintedMd.includes(taintedToken) &&
      !taintedMd.includes("9876543210");
    console.log(`  - 异常对象中的敏感标记与 URL 均被隔离，未流入 errorSummary 或审计产物: ${pass21 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass21) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 22: Direct evaluateValidationDecision Injection Attack Defense
    // -------------------------------------------------------------------------
    console.log("\n[测试 22] evaluateValidationDecision 伪造属性与恶意注入防御测试...");
    const maliciousInput = {
      validationMode: "REAL_CONNECTOR" as const,
      isSuccessResponse: false,
      hasMappedInput: false,
      hasExceededByteLimit: false,
      pipelineStages: {
        normalize: "NOT_RUN" as const,
        clean: "NOT_RUN" as const,
        extract: "NOT_RUN" as const,
        aggregate: "NOT_RUN" as const,
        statisticalAnalysis: "NOT_RUN" as const,
        report: "NOT_RUN" as const,
        aiSynthesis: "NOT_RUN" as const,
      },
      isAuthRequired: false,
      isRateLimited: false,
      isBlocked: false,
      hasRequestError: true,
      networkErrorSummary: "MAGIC_POISON_STRING_ATTACK_1",
      forgedExtraProp: "SECRET_LEAK_PROP_2",
      mappingFailureCategory: "INJECT_POISON_3" as any,
      networkFailureCategory: "MALICIOUS_CAT_4" as any,
    };

    const evaluatedMalicious = evaluateValidationDecision(maliciousInput);
    const pass22 =
      !evaluatedMalicious.errorSummary?.includes("MAGIC_POISON_STRING_ATTACK_1") &&
      !evaluatedMalicious.errorSummary?.includes("SECRET_LEAK_PROP_2") &&
      !evaluatedMalicious.errorSummary?.includes("INJECT_POISON_3") &&
      !evaluatedMalicious.errorSummary?.includes("MALICIOUS_CAT_4") &&
      evaluatedMalicious.errorSummary === "网络传输异常: 受限环境网络传输异常";
    console.log(`  - 恶意入参无法污染决策函数输出，严格降级为受限白名单摘要: ${pass22 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass22) allPassed = false;

    // -------------------------------------------------------------------------
    // Test 23: Direct writeAuditArtifacts Poisoned errorSummary Injection Defense
    // -------------------------------------------------------------------------
    console.log("\n[测试 23] writeAuditArtifacts 伪造 errorSummary 注入熔断与白名单净化测试...");
    const poisonedReport: ValidationAuditReport = {
      validationRunId: "val-test-poisoned",
      executedAtUtc: new Date().toISOString(),
      validationMode: "REAL_CONNECTOR",
      targetFingerprint: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      precheckBaseline: {
        basicProfileCapabilityBefore: "UNVERIFIED",
        publicFollowsCapabilityBefore: "UNVERIFIED",
        publicContentCapabilityBefore: "UNVERIFIED",
      },
      requestRecords: [],
      sourceAssessment: {
        sourceExists: false,
        publiclyAccessibleObserved: false,
        authenticationRequiredObserved: null,
        rateLimitObserved: null,
        regionRestrictionObserved: null,
        antiBotObserved: null,
        environmentIssueObserved: null,
      },
      contractCompatibility: {
        requiredFields: ["recordId", "provenance", "availability"],
        optionalFields: ["displayName", "description", "tags", "avatarIdentifier", "observedAt"],
        observedFieldManifest: [],
        mappingResult: "FAILED",
        irreconcilableConflict: true,
      },
      provenanceAssessment: {
        sourceType: "PROFILE",
        sourceIdentifier: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        fetchedAt: null,
        responseHash: null,
        auditProjectionValid: false,
      },
      safetyAssessment: {
        rawResponsePersisted: false,
        credentialsObserved: false,
        credentialsPersisted: false,
        rawResponseSentToAi: false,
        sensitiveDataSentToAi: false,
      },
      pipelineShadowRun: {
        normalize: "NOT_RUN",
        clean: "NOT_RUN",
        extract: "NOT_RUN",
        aggregate: "NOT_RUN",
        statisticalAnalysis: "NOT_RUN",
        aiSynthesis: "NOT_RUN",
        report: "NOT_RUN",
      },
      failClosedCheck: true,
      recommendedNextStep: "保持 BASIC_PROFILE 为 UNVERIFIED 阻断状态，排查前置条件、安全边界或契约兼容性问题。",
      finalConclusion: "BASIC_PROFILE 暂时不能正式接入",
      errorCode: "CONTRACT_INSUFFICIENT",
      errorSummary: "POISON_ERROR_SUMMARY_123_LEAK",
      auditChainHash: "",
    };

    const poisonTestDir = path.join(tempTestDir, "poison_write_test");
    await writeAuditArtifacts(poisonedReport, poisonTestDir);

    const poisonJson = fs.readFileSync(path.join(poisonTestDir, "BASIC_PROFILE_REAL_VALIDATION.json"), "utf8");
    const poisonMd = fs.readFileSync(path.join(poisonTestDir, "BASIC_PROFILE_REAL_VALIDATION.md"), "utf8");

    const pass23 =
      !poisonJson.includes("POISON_ERROR_SUMMARY_123_LEAK") &&
      !poisonMd.includes("POISON_ERROR_SUMMARY_123_LEAK") &&
      poisonJson.includes("受限环境未分类异常，已阻断输出。") &&
      poisonMd.includes("受限环境未分类异常，已阻断输出。");
    console.log(`  - 审计落盘函数对非白名单 errorSummary 强制替换为固定脱敏文本，JSON 与 MD 严格零毒化: ${pass23 ? "✅ 通过" : "❌ 失败"}`);
    if (!pass23) allPassed = false;

  } finally {
    // Full restoration of process.env state
    for (const key of Object.keys(process.env)) {
      if (!(key in initialEnvSnapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, initialEnvSnapshot);

    mockFetchHandler = null;
    globalThis.fetch = originalFetch;

    try {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 Phase 8.2.1 验证 Gate 综合离线自测全部通过！");
  } else {
    console.error("❌ 部分自测未通过，请检查上方日志。");
    process.exit(1);
  }
  console.log("=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" &&
    process.argv[1]?.includes("basic-profile-real-validation-self-test"))
) {
  runValidationSelfTest().catch(() => {
    console.error("验证自测执行发生未捕获异常终止，已安全退出。");
    process.exit(1);
  });
}
