/**
 * BiliProfile Analyzer — Minimal Task Execution API Endpoint
 *
 * POST /api/tasks/[id]/execute
 *
 * Triggers the atomic, persistent minimal execution pipeline on a PENDING task.
 *
 * Rules:
 * - Atomic Claim: Rejects tasks that are already RUNNING (409) or in terminal state (422).
 * - Safe Sanitized Errors: Zero leakage of raw stack traces, API keys, or database errors.
 * - Returns updated TaskSummaryResponse upon completion.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  executeTaskPipeline,
  TaskNotFoundError,
  TaskTerminalStateError,
  TaskAlreadyRunningError,
} from "@/lib/task-execution-service";
import { ApiErrorResponse } from "@/types/task-api";
import { AiProviderType, OpenAiCompatibleConfig } from "@/types/ai-analysis";
import { getAnonymousSessionId } from "@/lib/anonymous-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = getAnonymousSessionId(request);

    if (!id || typeof id !== "string" || !id.trim()) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "NOT_FOUND",
          message: "任务 ID 无效或为空",
        },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    // Verify task existence and session ownership
    const existing = await prisma.analysisTask.findUnique({
      where: { id },
      select: { id: true, sessionId: true },
    });

    if (!existing || (existing.sessionId && existing.sessionId !== sessionId)) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "NOT_FOUND",
          message: "未找到指定的分析任务",
        },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    let body: {
      provider?: AiProviderType;
      config?: OpenAiCompatibleConfig;
    } = {};

    try {
      body = await request.json();
    } catch {
      // Body may be empty, defaults to MOCK
      body = {};
    }

    const completedTask = await executeTaskPipeline(id, {
      provider: body.provider,
      openAiConfig: body.config,
    });

    return NextResponse.json(completedTask, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof TaskNotFoundError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "NOT_FOUND",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    if (err instanceof TaskAlreadyRunningError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "CONFLICT_ERROR",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 409 });
    }

    if (err instanceof TaskTerminalStateError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "TERMINAL_TASK_ERROR",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 422 });
    }

    const errorResponse: ApiErrorResponse = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "执行分析任务时发生内部错误",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
