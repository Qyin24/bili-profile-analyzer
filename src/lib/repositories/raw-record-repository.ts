import { prisma } from "@/lib/db/client";
import { Prisma, RawRecord, RawRecordSourceType } from "@prisma/client";

const FORBIDDEN_CREDENTIAL_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "password",
  "x-api-key",
  "proxy-authorization",
  "secret",
  "bearer",
  "session_id",
  "access_token",
  "refresh_token",
]);

export function hasForbiddenCredentialKeys(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  if (Array.isArray(data)) {
    return data.some(hasForbiddenCredentialKeys);
  }
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().trim();
    if (FORBIDDEN_CREDENTIAL_KEYS.has(normalizedKey)) {
      return true;
    }
    if (hasForbiddenCredentialKeys(value)) {
      return true;
    }
  }
  return false;
}

export interface CreateRawRecordInput {
  taskId: string;
  dataSourceRunId?: string;
  sourceType: RawRecordSourceType;
  sourceIdentifier: string;
  payload: string;
  contentHash: string;
  status?: string;
  expiresAt?: Date;
}

export interface IRawRecordRepository {
  createRawRecord(input: CreateRawRecordInput, tx?: Prisma.TransactionClient): Promise<RawRecord>;
  findByTaskId(taskId: string, tx?: Prisma.TransactionClient): Promise<RawRecord[]>;
  findById(id: string, tx?: Prisma.TransactionClient): Promise<RawRecord | null>;
}

export class RawRecordRepository implements IRawRecordRepository {
  async createRawRecord(input: CreateRawRecordInput, tx?: Prisma.TransactionClient): Promise<RawRecord> {
    if (!input.taskId || !input.taskId.trim()) {
      throw new Error("taskId is required to create a RawRecord.");
    }
    if (!input.sourceType) {
      throw new Error("sourceType is required to create a RawRecord.");
    }
    if (!input.sourceIdentifier || !input.sourceIdentifier.trim()) {
      throw new Error("sourceIdentifier is required to create a RawRecord.");
    }
    if (!input.payload || typeof input.payload !== "string") {
      throw new Error("payload must be a non-empty string.");
    }
    if (!input.contentHash || !input.contentHash.trim()) {
      throw new Error("contentHash is required.");
    }

    try {
      const parsed = JSON.parse(input.payload);
      if (hasForbiddenCredentialKeys(parsed)) {
        throw new Error(
          "Security rejection: payload contains forbidden credential / authorization keys."
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("Security rejection:")) {
        throw err;
      }
      const lower = input.payload.toLowerCase();
      for (const key of FORBIDDEN_CREDENTIAL_KEYS) {
        if (lower.includes(`"${key}"`) || lower.includes(`'${key}'`)) {
          throw new Error(
            `Security rejection: payload string matches credential pattern "${key}".`
          );
        }
      }
    }

    const db = tx ?? prisma;

    return db.rawRecord.create({
      data: {
        task: { connect: { id: input.taskId } },
        sourceType: input.sourceType,
        sourceIdentifier: input.sourceIdentifier,
        payload: input.payload,
        contentHash: input.contentHash,
        status: input.status || "CAPTURED",
        ...(input.dataSourceRunId ? { dataSourceRun: { connect: { id: input.dataSourceRunId } } } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
    });
  }

  async findByTaskId(taskId: string, tx?: Prisma.TransactionClient): Promise<RawRecord[]> {
    const db = tx ?? prisma;
    return db.rawRecord.findMany({
      where: { taskId },
      orderBy: { capturedAt: "asc" },
    });
  }

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<RawRecord | null> {
    const db = tx ?? prisma;
    return db.rawRecord.findUnique({
      where: { id },
    });
  }
}

export const rawRecordRepository: IRawRecordRepository = new RawRecordRepository();
