/**
 * BiliProfile Analyzer — Controlled Test-Data Cleanup Endpoint
 *
 * DELETE /api/admin/test-cleanup/[taskId]
 *
 * Deletes a test task and (if exclusive) its test target, cascading to all dependent
 * records. Intended strictly for E2E acceptance cleanup.
 *
 * Authorization:
 *  - Requires header `x-test-cleanup-token` equal to server-side `TEST_CLEANUP_TOKEN`
 *    (constant-time compare). Missing/invalid token => 401, no DB access.
 *  - Only tasks with `isTest = true` can be deleted (403 otherwise). Real user data
 *    is physically protected regardless of token.
 *  - Deletion is always by exact taskId; no deleteMany / fuzzy UID deletion.
 */

import { NextRequest, NextResponse } from "next/server";
import { cleanupTestTask, NotTestTaskError, TestTaskNotFoundError } from "@/lib/test-cleanup";
import { isTestCleanupTokenValid } from "@/lib/test-cleanup-auth";
import { ApiErrorResponse } from "@/types/task-api";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // Gate: token verification before any database access.
  if (!isTestCleanupTokenValid(request)) {
    const errorResponse: ApiErrorResponse = {
      error: { code: "UNAUTHORIZED", message: "缺少或无效的测试清理令牌" },
    };
    return NextResponse.json(errorResponse, { status: 401 });
  }

  const { taskId } = await params;
  if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
    const errorResponse: ApiErrorResponse = {
      error: { code: "INVALID_TASK_ID", message: "任务 ID 无效或为空" },
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  try {
    const result = await cleanupTestTask(taskId);
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof TestTaskNotFoundError) {
      const errorResponse: ApiErrorResponse = {
        error: { code: "NOT_FOUND", message: "未找到测试任务" },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    if (err instanceof NotTestTaskError) {
      const errorResponse: ApiErrorResponse = {
        error: { code: "FORBIDDEN", message: "该任务不是测试任务，拒绝删除" },
      };
      return NextResponse.json(errorResponse, { status: 403 });
    }

    console.error("DELETE /api/admin/test-cleanup error:", err);
    const errorResponse: ApiErrorResponse = {
      error: { code: "INTERNAL_SERVER_ERROR", message: "测试数据清理失败" },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
