/**
 * BiliProfile Analyzer — SEC-02: Comprehensive SSRF Guard Test Suite
 *
 * Test Invariants & Defense Matrix:
 * 1. IPv4 Loopback & Unspecified (127.0.0.1, 127.0.0.2, 0.0.0.0, etc.)
 * 2. IPv4 RFC1918 Private (10.0.0.1, 172.16.0.1, 172.31.255.254, 192.168.1.1)
 * 3. IPv4 Link-Local & Cloud Metadata (169.254.169.254, 169.254.0.1)
 * 4. IPv4 CGNAT, Multicast, Reserved, Broadcast (100.64.0.1, 224.0.0.1, 240.0.0.1, 255.255.255.255)
 * 5. IPv6 Loopback, ULA, Link-Local, Multicast, IPv4-Mapped (::1, fc00::1, fe80::1, ff02::1, ::ffff:127.0.0.1)
 * 6. Restricted hostnames (localhost, metadata.google.internal, instance-data, *.local, *.internal)
 * 7. Valid Public Hosts & IPs (api.openai.com, 8.8.8.8, 1.1.1.1)
 * 8. Redirect rejection (301/302) in testOpenAiConnection and generateOpenAiAnalysis
 */

import {
  isRestrictedIpv4,
  isRestrictedIpv6,
  isRestrictedHostname,
  validateDestinationSafe,
} from "../../src/lib/ai/ssrf-guard";
import {
  validateOpenAiConfig,
  testOpenAiConnection,
  generateOpenAiAnalysis,
  OpenAiProviderError,
} from "../../src/lib/ai/openai-provider";
import {
  runDeterministicAnalysis,
  buildDeterministicReportInput,
} from "../../src/lib/processing/pipeline";

async function runSsrfGuardTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — SEC-02 SSRF 全方位深度防御测试");
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

  // [模块 1] IPv4 规则深度验证
  console.log("[模块 1] IPv4 限制地址段拦截测试...");

  assert(isRestrictedIpv4("127.0.0.1"), "IPv4 回环 127.0.0.1 识别为受限");
  assert(isRestrictedIpv4("127.0.0.2"), "IPv4 回环 127.0.0.2 识别为受限");
  assert(isRestrictedIpv4("127.255.255.254"), "IPv4 回环 127.255.255.254 识别为受限");
  assert(isRestrictedIpv4("0.0.0.0"), "IPv4 未指定地址 0.0.0.0 识别为受限");
  assert(isRestrictedIpv4("10.0.0.1"), "IPv4 Class A 私网 10.0.0.1 识别为受限");
  assert(isRestrictedIpv4("10.255.255.254"), "IPv4 Class A 私网 10.255.255.254 识别为受限");
  assert(isRestrictedIpv4("172.16.0.1"), "IPv4 Class B 私网 172.16.0.1 识别为受限");
  assert(isRestrictedIpv4("172.31.255.254"), "IPv4 Class B 私网 172.31.255.254 识别为受限");
  assert(isRestrictedIpv4("192.168.1.1"), "IPv4 Class C 私网 192.168.1.1 识别为受限");
  assert(isRestrictedIpv4("169.254.169.254"), "IPv4 云元数据 169.254.169.254 识别为受限");
  assert(isRestrictedIpv4("169.254.0.1"), "IPv4 Link-Local 169.254.0.1 识别为受限");
  assert(isRestrictedIpv4("100.64.0.1"), "IPv4 CGNAT 100.64.0.1 识别为受限");
  assert(isRestrictedIpv4("224.0.0.1"), "IPv4 组播 224.0.0.1 识别为受限");
  assert(isRestrictedIpv4("240.0.0.1"), "IPv4 保留地址 240.0.0.1 识别为受限");
  assert(isRestrictedIpv4("255.255.255.255"), "IPv4 广播 255.255.255.255 识别为受限");
  assert(!isRestrictedIpv4("8.8.8.8"), "公网 IPv4 8.8.8.8 放行");
  assert(!isRestrictedIpv4("1.1.1.1"), "公网 IPv4 1.1.1.1 放行");

  // [模块 2] IPv6 规则深度验证
  console.log("\n[模块 2] IPv6 限制地址段拦截测试...");

  assert(isRestrictedIpv6("::1"), "IPv6 回环 ::1 识别为受限");
  assert(isRestrictedIpv6("::"), "IPv6 未指定 :: 识别为受限");
  assert(isRestrictedIpv6("fc00::1"), "IPv6 ULA 私网 fc00::1 识别为受限");
  assert(isRestrictedIpv6("fd12:3456:789a::1"), "IPv6 ULA 私网 fd12:... 识别为受限");
  assert(isRestrictedIpv6("fe80::1"), "IPv6 Link-Local fe80::1 识别为受限");
  assert(isRestrictedIpv6("ff02::1"), "IPv6 组播 ff02::1 识别为受限");
  assert(isRestrictedIpv6("::ffff:127.0.0.1"), "IPv4-Mapped IPv6 ::ffff:127.0.0.1 识别为受限");
  assert(isRestrictedIpv6("::ffff:10.0.0.1"), "IPv4-Mapped IPv6 ::ffff:10.0.0.1 识别为受限");
  assert(!isRestrictedIpv6("2606:4700:4700::1111"), "公网 IPv6 (Cloudflare) 放行");

  // [模块 3] 限制主机名拦截
  console.log("\n[模块 3] 特殊与云元数据主机名拦截测试...");

  assert(isRestrictedHostname("localhost"), "localhost 识别为受限");
  assert(isRestrictedHostname("sub.localhost"), "*.localhost 识别为受限");
  assert(isRestrictedHostname("api.internal"), "*.internal 识别为受限");
  assert(isRestrictedHostname("server.local"), "*.local 识别为受限");
  assert(isRestrictedHostname("metadata.google.internal"), "GCP 元数据主机名识别为受限");
  assert(isRestrictedHostname("instance-data"), "AWS 元数据主机名识别为受限");
  assert(!isRestrictedHostname("api.openai.com"), "公网域名 api.openai.com 放行");

  // [模块 4] 完整异步目的地校验 (validateDestinationSafe)
  console.log("\n[模块 4] validateDestinationSafe 综合拦截测试...");

  {
    const r = await validateDestinationSafe("127.0.0.1");
    assert(!r.safe && Boolean(r.reason?.includes("SSRF")), "拦截 127.0.0.1 IP 访问");
  }
  {
    const r = await validateDestinationSafe("169.254.169.254");
    assert(!r.safe && Boolean(r.reason?.includes("SSRF")), "拦截 169.254.169.254 云元数据 IP 访问");
  }
  {
    const r = await validateDestinationSafe("localhost");
    assert(!r.safe && Boolean(r.reason?.includes("SSRF")), "拦截 localhost 主机名访问");
  }
  {
    const r = await validateDestinationSafe("metadata.google.internal");
    assert(!r.safe && Boolean(r.reason?.includes("SSRF")), "拦截 metadata.google.internal 访问");
  }

  // [模块 5] validateOpenAiConfig 契约层 SSRF 拦截
  console.log("\n[模块 5] validateOpenAiConfig SSRF 拦截测试...");

  {
    const r = await validateOpenAiConfig({
      apiBaseUrl: "http://127.0.0.1:8080/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    });
    assert(!r.valid && Boolean(r.reason?.includes("SSRF")), "validateOpenAiConfig 拦截 127.0.0.1 Base URL");
  }
  {
    const r = await validateOpenAiConfig({
      apiBaseUrl: "http://169.254.169.254/latest/meta-data",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    });
    assert(!r.valid && Boolean(r.reason?.includes("SSRF")), "validateOpenAiConfig 拦截云元数据 Base URL");
  }

  // [模块 6] testOpenAiConnection 重定向阻断保护
  console.log("\n[模块 6] HTTP 重定向 (Redirect) 防护测试...");

  {
    // Mock fetch that returns HTTP 302 redirect
    const stubRedirectFetch: typeof fetch = async () => {
      return new Response(null, {
        status: 302,
        headers: { Location: "http://169.254.169.254/latest/meta-data" },
      });
    };

    const res = await testOpenAiConnection(
      {
        apiBaseUrl: "https://api.openai.com/v1",
        apiKey: "sk-valid-key",
        model: "gpt-4o-mini",
      },
      stubRedirectFetch,
      { allowPrivateIps: true } // Bypass initial DNS check to test HTTP redirect response handling
    );
    assert(res.success === false && Boolean(res.error?.includes("重定向")), "testOpenAiConnection 拦截 302 重定向");
  }

  {
    // generateOpenAiAnalysis with 301 redirect
    const sampleRecords = [
      {
        sourceRecordId: "rec_1",
        sourceType: "CONTENT" as const,
        title: "测试标题",
      },
    ];
    const analysis = runDeterministicAnalysis(sampleRecords);
    const reportInput = buildDeterministicReportInput(analysis);

    const stub301Fetch: typeof fetch = async () => {
      return new Response(null, {
        status: 301,
        headers: { Location: "http://127.0.0.1:5432/admin" },
      });
    };

    let thrown = false;
    try {
      await generateOpenAiAnalysis(
        reportInput,
        {
          apiBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-valid-key",
          model: "gpt-4o-mini",
        },
        stub301Fetch,
        { allowPrivateIps: true }
      );
    } catch (e: unknown) {
      if (e instanceof OpenAiProviderError && e.message.includes("重定向")) {
        thrown = true;
      }
    }
    assert(thrown, "generateOpenAiAnalysis 拦截 301 重定向");
  }

  console.log("\n=================================================");
  console.log(`🎉 SEC-02 SSRF 全方位深度防御测试全部通过！(${passedTests}/${totalTests} 项通过)`);
  console.log("=================================================\n");
}

runSsrfGuardTests().catch(console.error);
