import { prisma } from "@/lib/db/client";
import { ReportEvidenceSnapshot } from "@prisma/client";

export interface CreateEvidenceInput {
  taskId: string;
  sourceType: "SELF_REPORTED" | "STATISTICAL_METRIC" | "FOLLOW_RECORD" | "CONTENT_SAMPLE";
  evidenceId: string;
  title?: string;
  excerptOrMetricValue: string;
  contentHash: string;
}

export interface IReportEvidenceRepository {
  createEvidenceSnapshot(data: CreateEvidenceInput): Promise<ReportEvidenceSnapshot>;
  listByTaskId(taskId: string): Promise<ReportEvidenceSnapshot[]>;
}

export class ReportEvidenceRepository implements IReportEvidenceRepository {
  async createEvidenceSnapshot(data: CreateEvidenceInput): Promise<ReportEvidenceSnapshot> {
    return prisma.reportEvidenceSnapshot.create({
      data: {
        taskId: data.taskId,
        sourceType: data.sourceType,
        evidenceId: data.evidenceId,
        title: data.title,
        excerptOrMetricValue: data.excerptOrMetricValue,
        contentHash: data.contentHash,
      },
    });
  }

  async listByTaskId(taskId: string): Promise<ReportEvidenceSnapshot[]> {
    return prisma.reportEvidenceSnapshot.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const reportEvidenceRepository: IReportEvidenceRepository = new ReportEvidenceRepository();
