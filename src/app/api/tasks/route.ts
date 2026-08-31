import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createTaskWithSnapshot,
  serializeTaskSummary,
  TASK_SUMMARY_PRISMA_INCLUDE,
  mapTaskErrorToResponse,
} from "@/lib/self-profile-service";
import { CreateTaskDto, ApiErrorResponse } from "@/types/task-api";

export async function GET() {
  try {
    const tasks = await prisma.analysisTask.findMany({
      include: TASK_SUMMARY_PRISMA_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    const desensitizedSummaries = tasks.map(serializeTaskSummary);
    return NextResponse.json(desensitizedSummaries);
  } catch (err: unknown) {
    console.error("GET /api/tasks error:", err);
    const errorResponse: ApiErrorResponse = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "获取任务列表失败",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: CreateTaskDto;
    try {
      body = await request.json();
    } catch {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "INVALID_JSON",
          message: "请求体必须为合法 JSON 格式",
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "VALIDATION_FAILED",
          message: "请求体必须为 JSON 对象",
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const createdTaskSummary = await createTaskWithSnapshot(body);
    return NextResponse.json(createdTaskSummary, { status: 201 });
  } catch (err: unknown) {
    return mapTaskErrorToResponse(err);
  }
}
