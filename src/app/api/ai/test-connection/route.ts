import { NextRequest, NextResponse } from "next/server";
import { testOpenAiConnection } from "@/lib/ai/openai-provider";
import { OpenAiCompatibleConfig } from "@/types/ai-analysis";

export async function POST(request: NextRequest) {
  try {
    let body: Partial<OpenAiCompatibleConfig>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "请求体必须为合法 JSON 格式" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "缺少配置参数" },
        { status: 400 }
      );
    }

    const { apiBaseUrl, apiKey, model } = body;

    if (!apiBaseUrl || typeof apiBaseUrl !== "string" || !apiBaseUrl.trim()) {
      return NextResponse.json(
        { success: false, error: "API Base URL 不能为空" },
        { status: 400 }
      );
    }

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json(
        { success: false, error: "API Key 不能为空" },
        { status: 400 }
      );
    }

    if (!model || typeof model !== "string" || !model.trim()) {
      return NextResponse.json(
        { success: false, error: "模型名称 (Model) 不能为空" },
        { status: 400 }
      );
    }

    const result = await testOpenAiConnection({
      apiBaseUrl: apiBaseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message || "连接成功，可以使用该 AI 配置进行分析。",
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "连接测试失败，请检查配置参数。",
        },
        { status: 200 }
      );
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "测试连接时发生内部错误，请稍后重试。",
      },
      { status: 500 }
    );
  }
}
