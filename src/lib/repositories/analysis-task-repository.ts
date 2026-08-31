import { prisma } from "@/lib/db/client";
import {
  AnalysisTask,
  DataSourceRun,
  DataSourceRunStatus,
  PipelineStage,
  Prisma,
  TaskOutcome,
  TaskStatus,
} from "@prisma/client";

export interface CreateTaskInput {
  targetId: string;
  taskStatus?: TaskStatus;
  pipelineStage?: PipelineStage;
  outcome?: TaskOutcome;
  progress?: number;
  currentStageMessage?: string;
}

export interface UpdateTaskStatusInput {
  taskStatus?: TaskStatus;
  pipelineStage?: PipelineStage;
  outcome?: TaskOutcome;
  progress?: number;
  currentStageMessage?: string;
  completedAt?: Date;
  needsRegeneration?: boolean;
}

export interface IAnalysisTaskRepository {
  createTask(input: CreateTaskInput, tx?: Prisma.TransactionClient): Promise<AnalysisTask>;
  createTaskWithSnapshot(
    input: CreateTaskInput,
    options?: { attachSelfProfileSnapshot?: boolean }
  ): Promise<AnalysisTask>;
  findById(id: string): Promise<AnalysisTask | null>;
  findByTargetId(targetId: string, limit?: number): Promise<AnalysisTask[]>;
  updateStatus(id: string, updates: UpdateTaskStatusInput, tx?: Prisma.TransactionClient): Promise<AnalysisTask>;
  addDataSourceRun(
    taskId: string,
    data: {
      sourceName: string;
      status: DataSourceRunStatus;
      recordsCount?: number;
      durationMs?: number;
      message?: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<DataSourceRun>;
  listTasks(limit?: number): Promise<AnalysisTask[]>;
}

export class AnalysisTaskRepository implements IAnalysisTaskRepository {
  async createTask(input: CreateTaskInput, tx?: Prisma.TransactionClient): Promise<AnalysisTask> {
    if (!input.targetId || !input.targetId.trim()) {
      throw new Error("targetId is required to create an AnalysisTask.");
    }

    const db = tx ?? prisma;

    const target = await db.analysisTarget.findUnique({
      where: { id: input.targetId },
    });
    if (!target) {
      throw new Error(`Target with ID "${input.targetId}" not found.`);
    }

    return db.analysisTask.create({
      data: {
        targetId: input.targetId,
        taskStatus: input.taskStatus || "PENDING",
        pipelineStage: input.pipelineStage || "COLLECT",
        outcome: input.outcome || "NONE",
        progress: input.progress ?? 0,
        currentStageMessage: input.currentStageMessage || "任务已创建，等待调度",
      },
      include: {
        target: true,
      },
    });
  }

  async createTaskWithSnapshot(
    input: CreateTaskInput,
    options?: { attachSelfProfileSnapshot?: boolean }
  ): Promise<AnalysisTask> {
    if (!input.targetId || !input.targetId.trim()) {
      throw new Error("targetId is required to create an AnalysisTask with snapshot.");
    }

    return prisma.$transaction(async (tx) => {
      const task = await this.createTask(input, tx);

      if (options?.attachSelfProfileSnapshot !== false) {
        const profile = await tx.selfProvidedProfile.findUnique({
          where: { targetId: input.targetId },
          include: { fields: true },
        });

        const allowedFields = profile?.fields
          ? profile.fields.filter((f) => f.allowedForAnalysis && f.value.trim().length > 0)
          : [];

        await tx.selfProvidedSnapshot.create({
          data: {
            taskId: task.id,
            fields: {
              create: allowedFields.map((f) => ({
                sourceFieldId: f.id,
                fieldKey: f.fieldKey,
                fieldName: f.fieldName,
                value: f.value,
                consentScope: f.consentScope,
              })),
            },
          },
        });
      }

      return tx.analysisTask.findUniqueOrThrow({
        where: { id: task.id },
        include: {
          target: true,
          selfProvidedSnapshot: {
            include: { fields: true },
          },
        },
      });
    });
  }

  async findById(id: string) {
    return prisma.analysisTask.findUnique({
      where: { id },
      include: {
        target: true,
        dataSourceRuns: true,
        selfProvidedSnapshot: {
          include: { fields: true },
        },
        metrics: true,
        evidenceSnapshots: true,
        analysisResult: true,
      },
    });
  }

  async findByTargetId(targetId: string, limit = 20) {
    return prisma.analysisTask.findMany({
      where: { targetId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      include: {
        dataSourceRuns: true,
      },
    });
  }

  async updateStatus(id: string, updates: UpdateTaskStatusInput, tx?: Prisma.TransactionClient): Promise<AnalysisTask> {
    const db = tx ?? prisma;
    return db.analysisTask.update({
      where: { id },
      data: updates,
    });
  }

  async addDataSourceRun(
    taskId: string,
    data: {
      sourceName: string;
      status: DataSourceRunStatus;
      recordsCount?: number;
      durationMs?: number;
      message?: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<DataSourceRun> {
    const db = tx ?? prisma;
    return db.dataSourceRun.create({
      data: {
        taskId,
        sourceName: data.sourceName,
        status: data.status,
        recordsCount: data.recordsCount ?? 0,
        durationMs: data.durationMs ?? 0,
        message: data.message,
      },
    });
  }

  async listTasks(limit = 20) {
    return prisma.analysisTask.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      include: {
        target: {
          select: {
            id: true,
            platformUid: true,
            displayName: true,
            platform: true,
          },
        },
        dataSourceRuns: true,
      },
    });
  }
}

export const analysisTaskRepository: IAnalysisTaskRepository = new AnalysisTaskRepository();
