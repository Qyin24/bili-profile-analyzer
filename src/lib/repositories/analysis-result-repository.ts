import { prisma } from "@/lib/db/client";
import { AnalysisResult, Prisma, TaskOutcome } from "@prisma/client";

export interface CreateResultInput {
  taskId: string;
  summary: string;
  version?: string;
  outcome?: TaskOutcome;
  metricsData?: string;
  claimsData?: string;
}

export interface IAnalysisResultRepository {
  createResult(input: CreateResultInput, tx?: Prisma.TransactionClient): Promise<AnalysisResult>;
  findByTaskId(taskId: string, tx?: Prisma.TransactionClient): Promise<AnalysisResult | null>;
  deleteByTaskId(taskId: string, tx?: Prisma.TransactionClient): Promise<{ deleted: boolean }>;
}

export class AnalysisResultRepository implements IAnalysisResultRepository {
  async createResult(input: CreateResultInput, tx?: Prisma.TransactionClient): Promise<AnalysisResult> {
    if (!input.taskId || !input.taskId.trim()) throw new Error("taskId is required");
    const db = tx ?? prisma;
    return db.analysisResult.create({
      data: {
        taskId: input.taskId,
        summary: input.summary,
        version: input.version || "1.0.0",
        outcome: input.outcome || "FULL",
        metricsData: input.metricsData,
        claimsData: input.claimsData,
      },
    });
  }

  async findByTaskId(taskId: string, tx?: Prisma.TransactionClient): Promise<AnalysisResult | null> {
    const db = tx ?? prisma;
    return db.analysisResult.findUnique({
      where: { taskId },
      include: {
        task: {
          include: {
            target: true,
            evidenceSnapshots: true,
            metrics: true,
          },
        },
      },
    });
  }

  async deleteByTaskId(taskId: string, tx?: Prisma.TransactionClient): Promise<{ deleted: boolean }> {
    const db = tx ?? prisma;
    await db.analysisResult.delete({
      where: { taskId },
    });
    return { deleted: true };
  }
}

export const analysisResultRepository: IAnalysisResultRepository = new AnalysisResultRepository();
