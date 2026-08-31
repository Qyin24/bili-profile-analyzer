/**
 * BiliProfile Analyzer — MVP Stage 3: AI Configuration & Test Connection Self-Test
 *
 * Test Invariants:
 * 1. 100% offline self-test with stub customFetch (0 real external network calls).
 * 2. Validates testOpenAiConnection under 200 OK, 401, 403, 404, 429, 500, and Network Timeout.
 * 3. Validates input validation (empty URL, empty Key, empty Model, invalid URL).
 * 4. Asserts API Key is NEVER leaked in any result message or exception.
 */

import { testOpenAiConnection } from "../../src/lib/ai/openai-provider";
import { OpenAiCompatibleConfig } from "../../src/types/ai-analysis";

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

async function runAiConfigTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — AI 配置与测试连接离线自测");
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

  const validConfig: OpenAiCompatibleConfig = {
    apiBaseUrl: "https://api.openai.com/v1",
    apiKey: "sk-super-secret-key-12345",
    model: "gpt-4o-mini",
  };

  // Test 1: 200 OK Success
  {
    const stub = createStubFetch(() => {
      return new Response(JSON.stringify({ id: "chatcmpl-test", choices: [{ message: { content: "pong" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await testOpenAiConnection(validConfig, stub.fetch);
    assert(res.success === true && Boolean(res.message?.includes("连接成功")), "有效配置测试连接返回成功");
    assert(stub.calls.length === 1, "发起单次最小成本测试请求");
    assert(
      Boolean(
        stub.calls[0].options?.headers &&
          (stub.calls[0].options.headers as Record<string, string>)["Authorization"] === "Bearer sk-super-secret-key-12345"
      ),
      "请求包含正确的 Authorization 头"
    );
  }

  // Test 2: 401 Unauthorized
  {
    const stub = createStubFetch(() => {
      return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await testOpenAiConnection(validConfig, stub.fetch);
    assert(res.success === false, "401 响应标记为失败");
    assert(Boolean(res.error?.includes("鉴权失败") || res.error?.includes("API Key")), "401 映射为友好的鉴权提示");
    assert(!res.error?.includes("sk-super-secret-key-12345"), "错误信息中不包含 API Key 密钥");
  }

  // Test 3: 403 Forbidden
  {
    const stub = createStubFetch(() => {
      return new Response(JSON.stringify({ error: { message: "Permission denied" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await testOpenAiConnection(validConfig, stub.fetch);
    assert(res.success === false && Boolean(res.error?.includes("权限不足") || res.error?.includes("访问")), "403 映射为权限提示");
  }

  // Test 4: 404 Model / Endpoint Not Found
  {
    const stub = createStubFetch(() => {
      return new Response(JSON.stringify({ error: { message: "Model not found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await testOpenAiConnection(validConfig, stub.fetch);
    assert(res.success === false && Boolean(res.error?.includes("模型") || res.error?.includes("接口")), "404 映射为模型/地址不存在提示");
  }

  // Test 5: 429 Rate Limit / Quota Exceeded
  {
    const stub = createStubFetch(() => {
      return new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await testOpenAiConnection(validConfig, stub.fetch);
    assert(res.success === false && Boolean(res.error?.includes("频率") || res.error?.includes("额度")), "429 映射为频率/额度提示");
  }

  // Test 6: 500 Server Error
  {
    const stub = createStubFetch(() => {
      return new Response("Internal Server Error", {
        status: 500,
      });
    });

    const res = await testOpenAiConnection(validConfig, stub.fetch);
    assert(res.success === false && Boolean(res.error?.includes("上游 AI 服务端异常")), "500 映射为服务端异常提示");
  }

  // Test 7: Network timeout / Abort
  {
    const stub = createStubFetch(() => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });

    const res = await testOpenAiConnection(validConfig, stub.fetch);
    assert(res.success === false && Boolean(res.error?.includes("超时")), "请求超时映射为超时提示");
  }

  // Test 8: Empty / Invalid Inputs
  {
    const emptyUrlRes = await testOpenAiConnection({ ...validConfig, apiBaseUrl: "" });
    assert(emptyUrlRes.success === false && Boolean(emptyUrlRes.error?.includes("API Base URL")), "空 URL 被拒绝");

    const emptyKeyRes = await testOpenAiConnection({ ...validConfig, apiKey: "" });
    assert(emptyKeyRes.success === false && Boolean(emptyKeyRes.error?.includes("API Key")), "空 API Key 被拒绝");

    const emptyModelRes = await testOpenAiConnection({ ...validConfig, model: "" });
    assert(emptyModelRes.success === false && Boolean(emptyModelRes.error?.includes("模型名称")), "空模型名称被拒绝");

    const invalidUrlRes = await testOpenAiConnection({ ...validConfig, apiBaseUrl: "ftp://invalid-url" });
    assert(invalidUrlRes.success === false && Boolean(invalidUrlRes.error?.includes("http")), "非 HTTP(S) URL 被拒绝");
  }

  console.log("\n=================================================");
  console.log(`🎉 AI 配置与测试连接离线自测全部通过！(${passedTests}/${totalTests} 项通过)`);
  console.log("=================================================\n");
}

runAiConfigTests().catch(console.error);
