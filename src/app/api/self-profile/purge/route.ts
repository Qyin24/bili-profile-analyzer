import { NextRequest, NextResponse } from "next/server";
import { purgeSelfProfile, SelfProfileValidationError } from "@/lib/self-profile-service";
import { PurgeSelfProfilePayload } from "@/types/self-profile";

export async function DELETE(request: NextRequest) {
  try {
    const body: PurgeSelfProfilePayload = await request.json().catch(() => ({}));
    const result = await purgeSelfProfile(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SelfProfileValidationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 }
      );
    }
    console.error("DELETE /api/self-profile/purge error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "彻底删除个人说明失败" } },
      { status: 500 }
    );
  }
}
