import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateProfile,
  formatProfileResponse,
  updateSelfProfile,
  SelfProfileValidationError,
} from "@/lib/self-profile-service";
import { UpdateSelfProfilePayload } from "@/types/self-profile";

export async function GET() {
  try {
    const profile = await getOrCreateProfile();
    return NextResponse.json(formatProfileResponse(profile));
  } catch (error) {
    console.error("GET /api/self-profile error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "无法读取本地自述信息" } },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: UpdateSelfProfilePayload = await request.json();
    const updated = await updateSelfProfile(body);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof SelfProfileValidationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 }
      );
    }
    console.error("PUT /api/self-profile error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "更新本地自述信息失败" } },
      { status: 500 }
    );
  }
}
