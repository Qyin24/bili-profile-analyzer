import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeTaskSummary, TASK_SUMMARY_PRISMA_INCLUDE } from "@/lib/self-profile-service";
import { validateTaskLifecycleTransition } from "@/lib/task-lifecycle";
import { TaskStatus, PipelineStage, TaskOutcome } from "@/types/analysis";
import {
  UpdateTaskDto,
  VALID_TASK_STATUSES,
  VALID_PIPELINE_STAGES,
  VALID_TASK_OUTCOMES,
  VALID_DATA_SOURCE_STATUSES,
  ApiErrorResponse,
} from "@/types/task-api";
import { getAnonymousSessionId } from "@/lib/anonymous-session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = getAnonymousSessionId(_request);

    const task = await prisma.analysisTask.findUnique({
      where: { id },
      include: TASK_SUMMARY_PRISMA_INCLUDE,
    });

    if (!task || (task.sessionId && task.sessionId !== sessionId)) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "NOT_FOUND",
          message: `未找到 ID 为 ${id} 的分析任务`,
        },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    return NextResponse.json(serializeTaskSummary(task));
  } catch (err: unknown) {
    console.error("GET /api/tasks/[id] error:", err);
    const errorResponse: ApiErrorResponse = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "获取任务详情失败",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = getAnonymousSessionId(request);

    let body: UpdateTaskDto;
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

    // Check task existence and session ownership
    const existing = await prisma.analysisTask.findUnique({
      where: { id },
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

    // Strict Validation: taskStatus
    if (body.taskStatus !== undefined && !VALID_TASK_STATUSES.includes(body.taskStatus)) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "INVALID_TASK_STATUS",
          message: `非法的 taskStatus: ${String(body.taskStatus)}。合法值包括: ${VALID_TASK_STATUSES.join(", ")}`,
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Strict Validation: pipelineStage
    if (body.pipelineStage !== undefined && !VALID_PIPELINE_STAGES.includes(body.pipelineStage)) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "INVALID_PIPELINE_STAGE",
          message: `非法的 pipelineStage: ${String(body.pipelineStage)}。合法值包括: ${VALID_PIPELINE_STAGES.join(", ")}`,
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Strict Validation: outcome
    if (body.outcome !== undefined && !VALID_TASK_OUTCOMES.includes(body.outcome)) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "INVALID_OUTCOME",
          message: `非法的 outcome: ${String(body.outcome)}。合法值包括: ${VALID_TASK_OUTCOMES.join(", ")}`,
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Strict Validation: progress
    if (
      body.progress !== undefined &&
      (typeof body.progress !== "number" || body.progress < 0 || body.progress > 100 || !Number.isInteger(body.progress))
    ) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "INVALID_PROGRESS",
          message: "progress 必须为 0 到 100 之间的整数",
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Strict Validation: currentStageMessage
    if (body.currentStageMessage !== undefined && typeof body.currentStageMessage !== "string") {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "INVALID_STAGE_MESSAGE",
          message: "currentStageMessage 必须为字符串",
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Strict Validation: completedAt
    if (body.completedAt !== undefined && body.completedAt !== null) {
      if (typeof body.completedAt !== "string" || isNaN(new Date(body.completedAt).getTime())) {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "INVALID_COMPLETED_AT",
            message: "completedAt 必须为合法的日期时间字符串",
          },
        };
        return NextResponse.json(errorResponse, { status: 400 });
      }
    }

    // Strict Validation: dataSourceRuns
    if (body.dataSourceRuns !== undefined) {
      if (!Array.isArray(body.dataSourceRuns)) {
        const errorResponse: ApiErrorResponse = {
          error: {
            code: "INVALID_DATA_SOURCE_RUNS",
            message: "dataSourceRuns 若提供必须为数组格式",
          },
        };
        return NextResponse.json(errorResponse, { status: 400 });
      }

      for (let i = 0; i < body.dataSourceRuns.length; i++) {
        const ds = body.dataSourceRuns[i];
        if (!ds || typeof ds !== "object" || Array.isArray(ds)) {
          const errorResponse: ApiErrorResponse = {
            error: {
              code: "INVALID_DATA_SOURCE_RUN",
              message: `dataSourceRuns[${i}] 必须为有效对象`,
            },
          };
          return NextResponse.json(errorResponse, { status: 400 });
        }

        if (!ds.sourceName || typeof ds.sourceName !== "string" || !ds.sourceName.trim()) {
          const errorResponse: ApiErrorResponse = {
            error: {
              code: "INVALID_DATA_SOURCE_RUN",
              message: `dataSourceRuns[${i}].sourceName 不能为空且必须为非空字符串`,
            },
          };
          return NextResponse.json(errorResponse, { status: 400 });
        }

        if (!VALID_DATA_SOURCE_STATUSES.includes(ds.status)) {
          const errorResponse: ApiErrorResponse = {
            error: {
              code: "INVALID_DATA_SOURCE_STATUS",
              message: `非法的 dataSourceRuns[${i}].status: ${String(ds.status)}。合法值包括: ${VALID_DATA_SOURCE_STATUSES.join(", ")}`,
            },
          };
          return NextResponse.json(errorResponse, { status: 400 });
        }

        if (
          ds.recordsCount !== undefined &&
          (typeof ds.recordsCount !== "number" || ds.recordsCount < 0 || !Number.isInteger(ds.recordsCount))
        ) {
          const errorResponse: ApiErrorResponse = {
            error: {
              code: "INVALID_RECORDS_COUNT",
              message: `dataSourceRuns[${i}].recordsCount 必须为大于或等于 0 的整数`,
            },
          };
          return NextResponse.json(errorResponse, { status: 400 });
        }

        if (ds.message !== undefined && ds.message !== null && typeof ds.message !== "string") {
          const errorResponse: ApiErrorResponse = {
            error: {
              code: "INVALID_MESSAGE",
              message: `dataSourceRuns[${i}].message 若提供必须为字符串`,
            },
          };
          return NextResponse.json(errorResponse, { status: 400 });
        }
      }
    }

    // 1. Explicit empty PATCH check: Must contain at least one updateable property (Phase 5.1.2)
    const hasUpdateField =
      body.taskStatus !== undefined ||
      body.pipelineStage !== undefined ||
      body.outcome !== undefined ||
      body.progress !== undefined ||
      body.currentStageMessage !== undefined ||
      body.completedAt !== undefined ||
      body.dataSourceRuns !== undefined;

    if (!hasUpdateField) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "EMPTY_UPDATE",
          message: "更新请求体不能为空，至少需提供一项更新字段。",
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const nextStatus = body.taskStatus ?? existing.taskStatus;

    // Synthesize candidate completedAt prior to validation (Phase 5.1.1 & 5.1.2)
    // ONLY set candidateCompletedAt if explicitly requested in body, OR if transitioning to COMPLETED without existing completedAt
    let candidateCompletedAt: Date | null | undefined = undefined;

    if (body.completedAt !== undefined) {
      if (body.completedAt === null) {
        candidateCompletedAt = null;
      } else {
        candidateCompletedAt = new Date(body.completedAt);
      }
    } else if (nextStatus === "COMPLETED" && !existing.completedAt) {
      // Auto-generate timestamp once when transitioning to COMPLETED without explicit completedAt
      candidateCompletedAt = new Date();
    }

    const patchForValidation: UpdateTaskDto = {
      ...body,
    };
    if (candidateCompletedAt !== undefined) {
      patchForValidation.completedAt = candidateCompletedAt;
    }

    // Enforce pure lifecycle rules and composite state invariants (Phase 5.1 & 5.1.1 & 5.1.2)
    const lifecycleValidation = validateTaskLifecycleTransition(
      {
        taskStatus: existing.taskStatus as TaskStatus,
        pipelineStage: existing.pipelineStage as PipelineStage,
        progress: existing.progress,
        outcome: existing.outcome as TaskOutcome,
        completedAt: existing.completedAt,
      },
      patchForValidation
    );

    if (!lifecycleValidation.valid) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: lifecycleValidation.code || "INVALID_LIFECYCLE_TRANSITION",
          message: lifecycleValidation.message || "任务状态生命周期转换不合法",
        },
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Build update payload strictly using the EXACT candidateCompletedAt that was validated
    const updateData: {
      taskStatus?: TaskStatus;
      pipelineStage?: PipelineStage;
      outcome?: TaskOutcome;
      progress?: number;
      currentStageMessage?: string;
      completedAt?: Date | null;
    } = {};

    if (body.taskStatus !== undefined) updateData.taskStatus = body.taskStatus as TaskStatus;
    if (body.pipelineStage !== undefined) updateData.pipelineStage = body.pipelineStage as PipelineStage;
    if (body.outcome !== undefined) updateData.outcome = body.outcome as TaskOutcome;
    if (body.progress !== undefined) updateData.progress = body.progress;
    if (body.currentStageMessage !== undefined) updateData.currentStageMessage = body.currentStageMessage;
    if (candidateCompletedAt !== undefined) {
      updateData.completedAt = candidateCompletedAt;
    }

    // Perform transaction to update task and replace dataSourceRuns ONLY after all validations succeed
    const updatedTask = await prisma.$transaction(async (tx) => {
      await tx.analysisTask.update({
        where: { id },
        data: updateData,
      });

      if (body.dataSourceRuns !== undefined && Array.isArray(body.dataSourceRuns)) {
        await tx.dataSourceRun.deleteMany({
          where: { taskId: id },
        });

        if (body.dataSourceRuns.length > 0) {
          await tx.dataSourceRun.createMany({
            data: body.dataSourceRuns.map((ds) => ({
              taskId: id,
              sourceName: ds.sourceName.trim(),
              status: ds.status,
              recordsCount: ds.recordsCount ?? 0,
              message: ds.message ?? null,
            })),
          });
        }
      }

      return tx.analysisTask.findUnique({
        where: { id },
        include: TASK_SUMMARY_PRISMA_INCLUDE,
      });
    });

    if (!updatedTask) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: "NOT_FOUND",
          message: `未找到 ID 为 ${id} 的分析任务`,
        },
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    return NextResponse.json(serializeTaskSummary(updatedTask));
  } catch (err: unknown) {
    console.error("PATCH /api/tasks/[id] error:", err);
    const errorResponse: ApiErrorResponse = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "更新分析任务失败",
      },
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
