import { prisma } from "@/lib/db/client";
import { ConsentScope, Prisma, SelfProvidedField, SelfProvidedProfile, SelfProvidedSnapshot } from "@prisma/client";

export interface UpsertFieldInput {
  fieldKey: string;
  fieldName?: string;
  value: string;
  allowedForAnalysis?: boolean;
  consentScope?: ConsentScope;
}

export type ProfileWithFields = SelfProvidedProfile & { fields: SelfProvidedField[] };

export interface ISelfProvidedProfileRepository {
  getOrCreateProfile(targetId: string, tx?: Prisma.TransactionClient): Promise<ProfileWithFields>;
  getProfileFields(targetId: string, tx?: Prisma.TransactionClient): Promise<SelfProvidedField[]>;
  upsertField(targetId: string, input: UpsertFieldInput, tx?: Prisma.TransactionClient): Promise<SelfProvidedField>;
  createSnapshotForTask(taskId: string, targetId: string, tx?: Prisma.TransactionClient): Promise<SelfProvidedSnapshot>;
  getSnapshotByTaskId(taskId: string, tx?: Prisma.TransactionClient): Promise<SelfProvidedSnapshot | null>;
  purgeProfile(targetId: string, tx?: Prisma.TransactionClient): Promise<{ purged: boolean }>;
}

export class SelfProvidedProfileRepository implements ISelfProvidedProfileRepository {
  async getOrCreateProfile(targetId: string, tx?: Prisma.TransactionClient): Promise<ProfileWithFields> {
    if (!targetId || !targetId.trim()) {
      throw new Error("targetId is required to access SelfProvidedProfile.");
    }

    const db = tx ?? prisma;
    let profile = await db.selfProvidedProfile.findUnique({
      where: { targetId },
      include: {
        fields: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!profile) {
      profile = await db.selfProvidedProfile.create({
        data: {
          targetId,
        },
        include: {
          fields: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }

    return profile;
  }

  async getProfileFields(targetId: string, tx?: Prisma.TransactionClient): Promise<SelfProvidedField[]> {
    const profile = await this.getOrCreateProfile(targetId, tx);
    return profile.fields;
  }

  async upsertField(targetId: string, input: UpsertFieldInput, tx?: Prisma.TransactionClient): Promise<SelfProvidedField> {
    if (!targetId || !targetId.trim()) {
      throw new Error("targetId is required to upsert self profile fields.");
    }
    if (!input.fieldKey || !input.fieldKey.trim()) {
      throw new Error("fieldKey is required.");
    }

    const db = tx ?? prisma;
    const profile = await this.getOrCreateProfile(targetId, tx);
    const key = input.fieldKey.trim();
    const fieldNameVal = input.fieldName?.trim() || key;

    return db.selfProvidedField.upsert({
      where: {
        profileId_fieldName: {
          profileId: profile.id,
          fieldName: fieldNameVal,
        },
      },
      update: {
        fieldKey: key,
        fieldName: fieldNameVal,
        value: input.value,
        allowedForAnalysis: input.allowedForAnalysis ?? true,
        consentScope: input.consentScope || "PERSISTENT_ACROSS_TASKS",
      },
      create: {
        profileId: profile.id,
        fieldKey: key,
        fieldName: fieldNameVal,
        value: input.value,
        allowedForAnalysis: input.allowedForAnalysis ?? true,
        consentScope: input.consentScope || "PERSISTENT_ACROSS_TASKS",
      },
    });
  }

  async createSnapshotForTask(taskId: string, targetId: string, tx?: Prisma.TransactionClient): Promise<SelfProvidedSnapshot> {
    const db = tx ?? prisma;
    const profile = await this.getOrCreateProfile(targetId, tx);
    const allowedFields = profile.fields.filter((f) => f.allowedForAnalysis && f.value.trim().length > 0);

    return db.selfProvidedSnapshot.create({
      data: {
        taskId,
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
      include: {
        fields: true,
      },
    });
  }

  async getSnapshotByTaskId(taskId: string, tx?: Prisma.TransactionClient): Promise<SelfProvidedSnapshot | null> {
    const db = tx ?? prisma;
    return db.selfProvidedSnapshot.findUnique({
      where: { taskId },
      include: { fields: true },
    });
  }

  async purgeProfile(targetId: string, tx?: Prisma.TransactionClient): Promise<{ purged: boolean }> {
    const db = tx ?? prisma;
    const profile = await this.getOrCreateProfile(targetId, tx);
    await db.selfProvidedField.deleteMany({
      where: { profileId: profile.id },
    });
    return { purged: true };
  }
}

export const selfProvidedProfileRepository: ISelfProvidedProfileRepository = new SelfProvidedProfileRepository();
