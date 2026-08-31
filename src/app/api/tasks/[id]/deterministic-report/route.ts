/**
 * BiliProfile Analyzer — Phase 5.2.3: Read-only Task Deterministic Report API
 *
 * GET /api/tasks/[id]/deterministic-report
 *
 * Returns the validated, sanitized DeterministicReportInput artifact associated with a task.
 *
 * Rules:
 * - Read-only: only GET method is implemented.
 * - Minimal projection: calls getDeterministicReportForTask service.
 * - Stable, controlled error codes (NOT_FOUND, REPORT_NOT_FOUND, REPORT_DATA_INVALID).
 * - Zero raw JSON string or stack trace leakage upon error.
 * - Zero SnapshotField.value or self-profile exposure.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDeterministicReportForTask } from "@/lib/deterministic-report-service";
import { ApiErrorResponse } from "@/types/task-api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || typeof id !== "string" || !id.trim()) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "NOT_FOUND",
          message: "任务 ID 无效或为空",
        },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    const result = await getDeterministicReportForTask(id);

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

      if (result.error === "REPORT_NOT_FOUND") {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "REPORT_NOT_FOUND",
            message: result.message,
          },
        };
        return NextResponse.json(errorResponse, { status: 404 });
      }

      // Corrupted or invalid report data
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "REPORT_DATA_INVALID",
          message: result.message,
        },
      };
      return NextResponse.json(errorResponse, { status: 422 });
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err: unknown) {
    console.error("GET /api/tasks/[id]/deterministic-report error:", err);
    const errorResponse: ApiErrorResponse = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "获取确定性报告工件失败",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
