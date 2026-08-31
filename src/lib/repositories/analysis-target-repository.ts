import { prisma } from "@/lib/db/client";
import { AnalysisTarget } from "@prisma/client";

export interface CreateTargetInput {
  platformUid: string;
  inputType?: "UID" | "PROFILE_URL";
  normalizedIdentifier?: string;
  displayName?: string;
  operatorConsentConfirmed?: boolean;
}

export interface IAnalysisTargetRepository {
  createTarget(input: CreateTargetInput): Promise<AnalysisTarget>;
  findByUid(platformUid: string): Promise<AnalysisTarget | null>;
  findById(id: string): Promise<AnalysisTarget | null>;
  findOrCreate(input: CreateTargetInput): Promise<AnalysisTarget>;
  listTargets(limit?: number): Promise<AnalysisTarget[]>;
  deleteTarget(id: string): Promise<{ id: string; deleted: boolean }>;
}

export class AnalysisTargetRepository implements IAnalysisTargetRepository {
  async createTarget(input: CreateTargetInput): Promise<AnalysisTarget> {
    if (!input.platformUid || !input.platformUid.trim()) {
      throw new Error("platformUid is required and cannot be empty.");
    }

    const cleanUid = input.platformUid.trim();
    const normalized = input.normalizedIdentifier?.trim() || cleanUid;

    return prisma.analysisTarget.create({
      data: {
        platform: "BILIBILI",
        platformUid: cleanUid,
        inputType: input.inputType || "UID",
        normalizedIdentifier: normalized,
        displayName: input.displayName?.trim() || `Bilibili 用户 (${cleanUid})`,
        operatorConsentConfirmed: input.operatorConsentConfirmed !== false,
      },
    });
  }

  async findByUid(platformUid: string): Promise<AnalysisTarget | null> {
    const cleanUid = platformUid.trim();
    return prisma.analysisTarget.findUnique({
      where: { platformUid: cleanUid },
    });
  }

  async findById(id: string): Promise<AnalysisTarget | null> {
    return prisma.analysisTarget.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
  }

  async findOrCreate(input: CreateTargetInput): Promise<AnalysisTarget> {
    const existing = await this.findByUid(input.platformUid);
    if (existing) return existing;
    return this.createTarget(input);
  }

  async listTargets(limit = 20): Promise<AnalysisTarget[]> {
    return prisma.analysisTarget.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });
  }

  async deleteTarget(id: string): Promise<{ id: string; deleted: boolean }> {
    await prisma.analysisTarget.delete({
      where: { id },
    });
    return { id, deleted: true };
  }
}

export const analysisTargetRepository: IAnalysisTargetRepository = new AnalysisTargetRepository();
