import { NextRequest, NextResponse } from "next/server";
import { analysisTargetRepository } from "@/lib/repositories/analysis-target-repository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (uid) {
      const target = await analysisTargetRepository.findByUid(uid);
      if (!target) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: `Target with UID "${uid}" not found` } },
          { status: 404 }
        );
      }
      return NextResponse.json(target);
    }

    const targets = await analysisTargetRepository.listTargets(50);
    return NextResponse.json(targets);
  } catch (err: unknown) {
    console.error("GET /api/targets error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "获取分析目标列表失败" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: {
      platformUid?: unknown;
      inputType?: unknown;
      normalizedIdentifier?: unknown;
      displayName?: unknown;
      operatorConsentConfirmed?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "请求体必须为合法 JSON" } },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || !body.platformUid || typeof body.platformUid !== "string") {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "platformUid 字段必填且必须为非空字符串" } },
        { status: 400 }
      );
    }

    const cleanUid = body.platformUid.trim();
    if (!cleanUid) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "platformUid 不能为空" } },
        { status: 400 }
      );
    }

    const target = await analysisTargetRepository.findOrCreate({
      platformUid: cleanUid,
      inputType: body.inputType === "PROFILE_URL" ? "PROFILE_URL" : "UID",
      normalizedIdentifier: typeof body.normalizedIdentifier === "string" ? body.normalizedIdentifier : cleanUid,
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      operatorConsentConfirmed: body.operatorConsentConfirmed !== false,
    });

    return NextResponse.json(target, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/targets error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "创建或查找分析目标失败" } },
      { status: 500 }
    );
  }
}
