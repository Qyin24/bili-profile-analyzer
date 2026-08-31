/**
 * BiliProfile Analyzer — Task AI Analysis Artifact API (GET & POST)
 *
 * GET /api/tasks/[id]/ai-analysis
 * Returns the validated, sanitized AiAnalysisResult artifact associated with a task.
 *
 * POST /api/tasks/[id]/ai-analysis
 * Generates and persists AI analysis for a task given an optional ephemeral user AI configuration.
 *
 * Security & Invariants:
 * - Ephemeral Key Handling: Request body apiKey is consumed in-memory only and immediately discarded.
 * - Zero Logging / Zero Persistence of API Keys or Authorization headers.
 * - Strict schema and evidence reference validation on both input and output.
 * - Minimal projections only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAiAnalysisForTask,
  persistAiAnalysisForTask,
  TaskNotFoundError,
  TerminalTaskAiAnalysisError,
  SourceReportNotFoundError,
  SourceReportInvalidError,
  AiAnalysisValidationError,
  AiAnalysisConflictError,
  OpenAiProviderError,
} from "@/lib/ai";
import { ApiErrorResponse } from "@/types/task-api";
import { AiProviderType, OpenAiCompatibleConfig } from "@/types/ai-analysis";
import { getAnonymousSessionId } from "@/lib/anonymous-session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = getAnonymousSessionId(_request);

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
          message: `未找到 ID 为 ${id} 的分析任务`,
        },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    const result = await getAiAnalysisForTask(id);

    if (!result.success) {
      if (result.error === "TASK_NOT_FOUND") {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "NOT_FOUND",
            message: result.message,
          },
        };
        return NextResponse.json(errorResponse, { status: 404 });
      }

      if (result.error === "AI_ANALYSIS_NOT_FOUND") {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "AI_ANALYSIS_NOT_FOUND",
            message: result.message,
          },
        };
        return NextResponse.json(errorResponse, { status: 404 });
      }

      if (
        result.error === "SOURCE_REPORT_NOT_FOUND" ||
        result.error === "SOURCE_REPORT_INVALID"
      ) {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "SOURCE_REPORT_INVALID",
            message: result.message,
          },
        };
        return NextResponse.json(errorResponse, { status: 422 });
      }

      if (
        result.error === "CORRUPTED_AI_ANALYSIS_DATA" ||
        result.error === "INVALID_AI_ANALYSIS_DATA"
      ) {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "AI_ANALYSIS_DATA_INVALID",
            message: result.message,
          },
        };
        return NextResponse.json(errorResponse, { status: 422 });
      }

      if (result.error === "VERSION_METADATA_MISMATCH") {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "VERSION_METADATA_MISMATCH",
            message: result.message,
          },
        };
        return NextResponse.json(errorResponse, { status: 422 });
      }

      if (result.error === "INTERNAL_SERVER_ERROR") {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "获取 AI 分析工件失败",
          },
        };
        return NextResponse.json(errorResponse, { status: 500 });
      }

      const errorResponse: ApiErrorResponse = {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "获取 AI 分析工件失败",
        },
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch {
    const errorResponse: ApiErrorResponse = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "获取 AI 分析工件失败",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

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
          message: `未找到 ID 为 ${id} 的分析任务`,
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

    const targetProvider: AiProviderType = body.provider || "MOCK";

    const persistedResult = await persistAiAnalysisForTask(id, {
      provider: targetProvider,
      openAiConfig: body.config,
    });

    return NextResponse.json(persistedResult, { status: 200 });
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

    if (err instanceof TerminalTaskAiAnalysisError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "TERMINAL_TASK_ERROR",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 422 });
    }

    if (err instanceof SourceReportNotFoundError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "SOURCE_REPORT_NOT_FOUND",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 422 });
    }

    if (err instanceof SourceReportInvalidError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "SOURCE_REPORT_INVALID",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 422 });
    }

    if (err instanceof AiAnalysisConflictError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "CONFLICT_ERROR",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 409 });
    }

    if (err instanceof AiAnalysisValidationError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "AI_VALIDATION_ERROR",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 422 });
    }

    if (err instanceof OpenAiProviderError) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "UPSTREAM_AI_ERROR",
          message: err.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 422 });
    }

    const errorResponse: ApiErrorResponse = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "生成 AI 分析工件失败",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
