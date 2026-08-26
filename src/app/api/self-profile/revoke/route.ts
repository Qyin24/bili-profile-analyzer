import { NextRequest, NextResponse } from "next/server";
import { revokeSelfProfile, SelfProfileValidationError } from "@/lib/self-profile-service";
import { RevokeSelfProfilePayload } from "@/types/self-profile";

export async function POST(request: NextRequest) {
  try {
    const body: RevokeSelfProfilePayload = await request.json().catch(() => ({}));
    const result = await revokeSelfProfile(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SelfProfileValidationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 }
      );
    }
    console.error("POST /api/self-profile/revoke error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "停止未来分析使用失败" } },
      { status: 500 }
    );
  }
}
