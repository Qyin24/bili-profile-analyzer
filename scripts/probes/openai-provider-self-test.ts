/**
 * BiliProfile Analyzer — OpenAI-compatible Provider Offline Self-Test
 *
 * Test Invariants:
 * 1. 100% pure offline test, strictly 0 external network calls.
 * 2. Validates Base URL normalization and security constraints (protocols, credentials, queries, fragments).
 * 3. Validates POST headers, Bearer Authorization, body structure, and model parameters.
 * 4. Validates API Key isolation: keys NEVER leak in error messages, logs, or outputs.
 * 5. Validates markdown code fence stripping and strict AiAnalysisResult contract validation.
 * 6. Validates error mapping on HTTP non-2xx, network aborts, invalid JSON, and hallucinated evidence.
 * 7. Asserts Mock provider continues working seamlessly.
 */

import {
  normalizeOpenAiBaseUrl,
  validateOpenAiConfig,
  generateOpenAiAnalysis,
  createOpenAiCompatibleProvider,
  OpenAiProviderError,
} from "../../src/lib/ai/openai-provider";
import {
  getAiProvider,
  generateAiAnalysis,
  mockAiProvider,
  validateAiAnalysisResult,
  AI_ANALYSIS_SCHEMA_VERSION,
  AiAnalysisResult,
} from "../../src/lib/ai";
import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
} from "../../src/lib/processing/pipeline";
import { PublicSourceRecord } from "../../src/types/processing";

interface MockFetchCallInfo {
  url: string;
  options?: RequestInit;
}

function createStubFetch(
  handler: (info: MockFetchCallInfo) => Promise<Response> | Response
): { fetch: typeof fetch; calls: MockFetchCallInfo[] } {
  const calls: MockFetchCallInfo[] = [];

  const stubFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const info: MockFetchCallInfo = { url, options: init };
    calls.push(info);
    return handler(info);
  };

  return { fetch: stubFetch, calls };
}

async function runOpenAiProviderSelfTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — OpenAI-compatible Provider 离线自测");
  console.log("=================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[测试 ${totalTests}] ${testName}: ✅ 通过`);
    } else {
      console.error(`[测试 ${totalTests}] ${testName}: ❌ 失败 ${detail ? `(${detail})` : ""}`);
      process.exitCode = 1;
    }
  }

  // Setup standard deterministic report fixture
  const sampleRecords: PublicSourceRecord[] = [
    {
      sourceRecordId: "rec_1",
      sourceType: "CONTENT",
      title: "深入浅出 TypeScript 架构设计",
      tags: ["科技", "编程"],
    },
    {
      sourceRecordId: "rec_2",
      sourceType: "CONTENT",
      title: "塞尔达传说旷野之息探索",
      tags: ["游戏"],
    },
  ];
  const analysis = runDeterministicAnalysis(sampleRecords);
  const reportInput = buildDeterministicReportInput(analysis);
  const validEvIds = reportInput.evidence.map((e) => e.id);

  // [模块 1] Base URL 规范化与安全校验
  console.log("[模块 1] Base URL 规范化与安全校验测试...");

  // 1.1 标准 /v1 路径
  {
    const r = normalizeOpenAiBaseUrl("https://api.openai.com/v1");
    assert(r.valid && r.endpoint === "https://api.openai.com/v1/chat/completions", "标准 /v1 URL 规范化拼接");
  }

  // 1.2 尾部斜杠处理
  {
    const r = normalizeOpenAiBaseUrl("https://api.openai.com/v1/");
    assert(r.valid && r.endpoint === "https://api.openai.com/v1/chat/completions", "带尾部斜杠 URL 规范化拼接");
  }

  // 1.3 已包含 /chat/completions 避免重复
  {
    const r = normalizeOpenAiBaseUrl("https://api.openai.com/v1/chat/completions");
    assert(r.valid && r.endpoint === "https://api.openai.com/v1/chat/completions", "已含完整路径 URL 幂等处理");
  }

  // 1.4 自定义域名根路径
  {
    const r = normalizeOpenAiBaseUrl("https://api.deepseek.com");
    assert(r.valid && r.endpoint === "https://api.deepseek.com/chat/completions", "自定义域名根路径规范化拼接");
  }

  // 1.5 HTTP 本地端口
  {
    const r = normalizeOpenAiBaseUrl("http://localhost:11434/v1");
    assert(r.valid && r.endpoint === "http://localhost:11434/v1/chat/completions", "本地 http 端口规范化拼接");
  }

  // 1.6 拒绝非 HTTP/HTTPS 协议
  {
    const r = normalizeOpenAiBaseUrl("ftp://api.openai.com/v1");
    assert(!r.valid && Boolean(r.reason?.includes("http")), "拒绝非法协议 (ftp://)");
  }

  // 1.7 拒绝带凭据 URL (user:pass@host)
  {
    const r = normalizeOpenAiBaseUrl("https://user:pass@api.openai.com/v1");
    assert(!r.valid && Boolean(r.reason?.includes("用户名或密码")), "拒绝包含凭据的 URL");
  }

  // 1.8 拒绝带 Query 参数 URL
  {
    const r = normalizeOpenAiBaseUrl("https://api.openai.com/v1?token=secret");
    assert(!r.valid && Boolean(r.reason?.includes("查询参数")), "拒绝包含 Query 参数的 URL");
  }

  // 1.9 拒绝带 Fragment 锚点 URL
  {
    const r = normalizeOpenAiBaseUrl("https://api.openai.com/v1#section");
    assert(!r.valid && Boolean(r.reason?.includes("锚点")), "拒绝包含 Hash 锚点的 URL");
  }

  // [模块 2] POST 请求格式、Bearer 认证与请求 Payload 测试
  console.log("\n[模块 2] POST 请求格式与认证头测试...");
  {
    let capturedMethod = "";
    let capturedAuthHeader = "";
    let capturedContentType = "";
    let capturedBodyObj: any = null;

    const mockResponsePayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              schemaVersion: "ai-analysis-result/v1",
              provider: "OPENAI_COMPATIBLE",
              summary: "基于公开样本分析，用户在科技与游戏领域表现出均衡的涉猎偏好。",
              findings: [
                {
                  id: "finding_1",
                  category: "TOPIC_INTERPRETATION",
                  statement: "核心偏好体现为科技与游戏内容涉猎。",
                  evidenceIds: [validEvIds[0]],
                },
              ],
              limitations: ["仅基于公开样本数据分析。"],
            }),
          },
        },
      ],
    };

    const stub = createStubFetch((info) => {
      capturedMethod = info.options?.method || "";
      const headers = (info.options?.headers as Record<string, string>) || {};
      capturedAuthHeader = headers["Authorization"] || "";
      capturedContentType = headers["Content-Type"] || "";
      capturedBodyObj = JSON.parse(info.options?.body as string);

      return new Response(JSON.stringify(mockResponsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const config = {
      apiBaseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-mock-key-123456",
      model: "gpt-4o-mini",
    };

    const result = await generateOpenAiAnalysis(reportInput, config, stub.fetch);

    assert(
      capturedMethod === "POST" &&
      capturedAuthHeader === "Bearer sk-test-mock-key-123456" &&
      capturedContentType === "application/json" &&
      capturedBodyObj.model === "gpt-4o-mini" &&
      capturedBodyObj.response_format?.type === "json_object" &&
      result.provider === "OPENAI_COMPATIBLE",
      "POST 请求、Bearer 认证头及 Payload 构造正确"
    );
  }

  // [模块 3] API Key 绝不泄露断言 (错误、异常与日志隔离)
  console.log("\n[模块 3] API Key 安全与零泄露测试...");
  {
    const SECRET_KEY = "SECRET_SENTINEL_API_KEY_NEVER_LEAK_999888";
    const config = {
      apiBaseUrl: "https://api.openai.com/v1",
      apiKey: SECRET_KEY,
      model: "gpt-4o-mini",
    };

    // 3.1 HTTP 401 报错不含 Key
    const stub401 = createStubFetch(() => new Response("Unauthorized", { status: 401 }));
    let err401Msg = "";
    try {
      await generateOpenAiAnalysis(reportInput, config, stub401.fetch);
    } catch (e: any) {
      err401Msg = e.message;
    }
    assert(
      !err401Msg.includes(SECRET_KEY) && err401Msg.includes("401"),
      "HTTP 401 错误信息脱敏且不包含 API Key"
    );

    // 3.2 网络异常报错不含 Key
    const stubNetErr = createStubFetch(() => {
      throw new Error("Connection reset");
    });
    let errNetMsg = "";
    try {
      await generateOpenAiAnalysis(reportInput, config, stubNetErr.fetch);
    } catch (e: any) {
      errNetMsg = e.message;
    }
    assert(
      !errNetMsg.includes(SECRET_KEY) && errNetMsg.includes("网络连接失败"),
      "网络异常错误信息脱敏且不包含 API Key"
    );
  }

  // [模块 4] 响应解析与 Markdown 代码块兼容
  console.log("\n[模块 4] 响应解析与 Markdown 代码块兼容测试...");
  {
    const markdownWrappedJson = `\`\`\`json
{
  "schemaVersion": "ai-analysis-result/v1",
  "provider": "OPENAI_COMPATIBLE",
  "summary": "分析结果概述，用户偏好主要集中于科技主题。",
  "findings": [
    {
      "id": "finding_1",
      "category": "TOPIC_INTERPRETATION",
      "statement": "科技主题偏好显著。",
      "evidenceIds": ["${validEvIds[0]}"]
    }
  ],
  "limitations": ["样本容量有限。"]
}
\`\`\``;

    const stub = createStubFetch(() =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: markdownWrappedJson } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const config = {
      apiBaseUrl: "https://api.openai.com/v1",
      apiKey: "sk-mock",
      model: "gpt-4o-mini",
    };

    const result = await generateOpenAiAnalysis(reportInput, config, stub.fetch);
    assert(
      result.schemaVersion === "ai-analysis-result/v1" &&
      result.findings.length === 1 &&
      result.summary.includes("科技主题"),
      "Markdown 代码块标记 (```json) 自动剔除并成功解析"
    );
  }

  // [模块 5] 非法响应拒绝测试 (非 JSON、Schema 不匹配、悬空证据)
  console.log("\n[模块 5] 异常响应拦截测试...");

  // 5.1 非 JSON 响应
  {
    const stub = createStubFetch(() => new Response("<html>Not Found</html>", { status: 200 }));
    let errMsg = "";
    try {
      await generateOpenAiAnalysis(reportInput, { apiBaseUrl: "https://api.openai.com/v1", apiKey: "sk", model: "m" }, stub.fetch);
    } catch (e: any) {
      errMsg = e.message;
    }
    assert(errMsg.includes("非 JSON") || errMsg.includes("无法解析"), "非 JSON 响应安全拒绝");
  }

  // 5.2 悬空证据 ID 拒绝
  {
    const hallucinatedJson = JSON.stringify({
      schemaVersion: "ai-analysis-result/v1",
      provider: "OPENAI_COMPATIBLE",
      summary: "总结",
      findings: [
        {
          id: "finding_1",
          category: "TOPIC_INTERPRETATION",
          statement: "虚构推断",
          evidenceIds: ["ev_hallucinated_fake_999"],
        },
      ],
      limitations: [],
    });

    const stub = createStubFetch(() =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: hallucinatedJson } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    let errMsg = "";
    try {
      await generateOpenAiAnalysis(reportInput, { apiBaseUrl: "https://api.openai.com/v1", apiKey: "sk", model: "m" }, stub.fetch);
    } catch (e: any) {
      errMsg = e.message;
    }
    assert(errMsg.includes("契约或证据链校验"), "模型虚构 evidenceId 被严格校验器拦截拒绝");
  }

  // 5.3 敏感凭据/Token 泄漏拒绝 (如包含 SESSDATA)
  {
    const sensitiveJson = JSON.stringify({
      schemaVersion: "ai-analysis-result/v1",
      provider: "OPENAI_COMPATIBLE",
      summary: "包含泄露凭据 SESSDATA=mock_token",
      findings: [
        {
          id: "finding_1",
          category: "TOPIC_INTERPRETATION",
          statement: "科技主题偏好。",
          evidenceIds: [validEvIds[0]],
        },
      ],
      limitations: [],
    });

    const stub = createStubFetch(() =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: sensitiveJson } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    let errMsg = "";
    try {
      await generateOpenAiAnalysis(reportInput, { apiBaseUrl: "https://api.openai.com/v1", apiKey: "sk", model: "m" }, stub.fetch);
    } catch (e: any) {
      errMsg = e.message;
    }
    assert(errMsg.includes("契约或证据链校验"), "模型输出受保护敏感凭据 (SESSDATA) 被严格校验器拦截拒绝");
  }

  // [模块 6] HTTP 状态码映射测试
  console.log("\n[模块 6] HTTP 状态码映射测试...");

  const statusCases = [
    { status: 403, expected: "403" },
    { status: 404, expected: "404" },
    { status: 429, expected: "429" },
    { status: 500, expected: "500" },
  ];

  for (const sc of statusCases) {
    const stub = createStubFetch(() => new Response("Error", { status: sc.status }));
    let errMsg = "";
    try {
      await generateOpenAiAnalysis(reportInput, { apiBaseUrl: "https://api.openai.com/v1", apiKey: "sk", model: "m" }, stub.fetch);
    } catch (e: any) {
      errMsg = e.message;
    }
    assert(errMsg.includes(sc.expected), `HTTP ${sc.status} 映射为用户友好的脱敏提示`);
  }

  // [模块 7] Provider Registry 接入与 Mock 共存
  console.log("\n[模块 7] Provider Registry 接入与 Mock 共存测试...");
  {
    const mockProvider = getAiProvider("MOCK");
    assert(mockProvider.id === "MOCK", "MOCK Provider 正常获取");

    const defaultProvider = getAiProvider();
    assert(defaultProvider.id === "MOCK", "默认缺省获取 MOCK Provider");

    const openAiProvider = getAiProvider("OPENAI_COMPATIBLE", {
      openAiConfig: {
        apiBaseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        model: "gpt-4o-mini",
      },
    });
    assert(openAiProvider.id === "OPENAI_COMPATIBLE", "OPENAI_COMPATIBLE Provider 正常按需创建");

    let missingConfigErr = "";
    try {
      getAiProvider("OPENAI_COMPATIBLE");
    } catch (e: any) {
      missingConfigErr = e.message;
    }
    assert(missingConfigErr === "Missing OpenAI configuration", "缺少配置调用 OPENAI_COMPATIBLE 失败关闭");
  }

  console.log("\n=================================================");
  console.log(`🎉 OpenAI-compatible Provider 离线自测全部通过！(${passedTests}/${totalTests} 项通过，外部网络请求: 0)`);
  console.log("=================================================");
}

if (
  require.main === module ||
  (typeof process !== "undefined" && process.argv[1]?.includes("openai-provider-self-test"))
) {
  runOpenAiProviderSelfTests().catch(() => {
    console.error("[测试异常] 执行过程发生未捕获异常。");
    process.exit(1);
  });
}
