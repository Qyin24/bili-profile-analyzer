import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  SELF_PROVIDED_FIELD_NAMES,
  CONSENT_SCOPES,
  SelfProvidedFieldName,
  SelfProvidedProfileResponse,
  SelfProvidedFieldItem,
  UpdateSelfProfilePayload,
  RevokeSelfProfilePayload,
  PurgeSelfProfilePayload,
} from "@/types/self-profile";
import { TaskStatus, PipelineStage, TaskOutcome, DataSourceRunStatus } from "@/types/analysis";
import { CreateTaskDto, TaskSummaryResponse, ApiErrorResponse } from "@/types/task-api";
import { validateTargetUid } from "@/lib/connectors/bilibili-public-connector";

type TransactionClient = Prisma.TransactionClient;
type DbClient = PrismaClient | TransactionClient;

export class SelfProvidedConsentRequiredError extends Error {
  public readonly code = "SELF_PROVIDED_CONSENT_REQUIRED";
  public readonly activeFieldsCount: number;

  constructor(activeFieldsCount: number) {
    super("检测到已启用的本地自述说明，创建分析任务需要明确授权确认 (selfProvidedConsentConfirmed: true)。");
    this.name = "SelfProvidedConsentRequiredError";
    this.activeFieldsCount = activeFieldsCount;
  }
}

export class SelfProfileValidationError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SelfProfileValidationError";
    this.code = code;
  }
}

export class SelfProfileConflictError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SelfProfileConflictError";
    this.code = code;
  }
}

/**
 * Maps task creation / execution exceptions to structured, safe HTTP error responses.
 */
export function mapTaskErrorToResponse(err: unknown): NextResponse<ApiErrorResponse> {
  if (err instanceof SelfProvidedConsentRequiredError) {
    const errorResponse: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: {
          activeFieldsCount: err.activeFieldsCount,
        },
      },
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  if (err instanceof SelfProfileValidationError) {
    const errorResponse: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  if (err instanceof SelfProfileConflictError) {
    const errorResponse: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    return NextResponse.json(errorResponse, { status: 409 });
  }

  console.error("POST /api/tasks error:", err);
  const errorResponse: ApiErrorResponse = {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "创建分析任务失败",
    },
  };
  return NextResponse.json(errorResponse, { status: 500 });
}

/**
 * Pure read-only helper to inspect existing profile candidates before task creation.
 * Deterministic single-user default profile strategy: orderBy createdAt: "asc".
 * Strictly executes read queries (findUnique/findFirst).
 * NEVER performs create, upsert, update, delete, or transaction mutations.
 */
export async function readExistingProfileForTaskCandidate(
  profileId?: string,
  db: PrismaClient = prisma
) {
  return profileId
    ? await db.selfProvidedProfile.findUnique({
        where: { id: profileId },
        include: { fields: true },
      })
    : await db.selfProvidedProfile.findFirst({
        orderBy: { createdAt: "asc" },
        include: { fields: true },
      });
}

/**
 * Get or create profile for a given profileId (or default single profile if omitted).
 * Deterministic single-user default profile strategy: orderBy createdAt: "asc".
 */
export async function getOrCreateProfile(
  db: DbClient = prisma,
  profileId?: string
) {
  let profile = profileId
    ? await db.selfProvidedProfile.findUnique({
        where: { id: profileId },
        include: { fields: true },
      })
    : await db.selfProvidedProfile.findFirst({
        orderBy: { createdAt: "asc" },
        include: { fields: true },
      });

  if (!profile) {
    profile = await db.selfProvidedProfile.create({
      data: {
        ...(profileId ? { id: profileId } : {}),
        fields: {
          create: SELF_PROVIDED_FIELD_NAMES.map((name) => ({
            fieldName: name,
            value: "",
            allowedForAnalysis: true,
            consentScope: "PERSISTENT_ACROSS_TASKS",
          })),
        },
      },
      include: { fields: true },
    });
  } else {
    // Ensure all 6 field names exist in database (self-healing for schema evolution)
    const existingFieldNames = new Set(profile.fields.map((f) => f.fieldName));
    const missingFieldNames = SELF_PROVIDED_FIELD_NAMES.filter(
      (name) => !existingFieldNames.has(name)
    );

    if (missingFieldNames.length > 0) {
      await db.selfProvidedField.createMany({
        data: missingFieldNames.map((name) => ({
          profileId: profile!.id,
          fieldName: name,
          value: "",
          allowedForAnalysis: true,
          consentScope: "PERSISTENT_ACROSS_TASKS",
        })),
      });

      profile = (await db.selfProvidedProfile.findUnique({
        where: { id: profile.id },
        include: { fields: true },
      }))!;
    }
  }

  return profile;
}

/**
 * Serializes raw profile into standard response view-model.
 */
export function formatProfileResponse(profile: {
  id: string;
  updatedAt: Date;
  fields: {
    id: string;
    fieldName: string;
    value: string;
    allowedForAnalysis: boolean;
    consentScope: string;
  }[];
}): SelfProvidedProfileResponse {
  const fieldsMap: Partial<Record<SelfProvidedFieldName, SelfProvidedFieldItem>> = {};

  let hasAllowedFieldsForAnalysis = false;

  for (const f of profile.fields) {
    if (SELF_PROVIDED_FIELD_NAMES.includes(f.fieldName as SelfProvidedFieldName)) {
      const isAllowed = f.allowedForAnalysis && f.value.trim().length > 0;
      if (isAllowed) {
        hasAllowedFieldsForAnalysis = true;
      }

      fieldsMap[f.fieldName as SelfProvidedFieldName] = {
        fieldName: f.fieldName as SelfProvidedFieldName,
        value: f.value,
        allowedForAnalysis: f.allowedForAnalysis,
        consentScope: f.consentScope as "THIS_TASK_ONLY" | "PERSISTENT_ACROSS_TASKS",
      };
    }
  }

  // Guarantee all 6 fields exist in response object
  for (const name of SELF_PROVIDED_FIELD_NAMES) {
    if (!fieldsMap[name]) {
      fieldsMap[name] = {
        fieldName: name,
        value: "",
        allowedForAnalysis: true,
        consentScope: "PERSISTENT_ACROSS_TASKS",
      };
    }
  }

  return {
    id: profile.id,
    updatedAt: profile.updatedAt.toISOString(),
    fields: fieldsMap as Record<SelfProvidedFieldName, SelfProvidedFieldItem>,
    hasAllowedFieldsForAnalysis,
  };
}

/**
 * Updates self-provided fields for a specific profile with strict validation.
 */
export async function updateSelfProfile(
  payload: UpdateSelfProfilePayload,
  profileId?: string
): Promise<SelfProvidedProfileResponse> {
  if (!payload || typeof payload !== "object" || !payload.fields || typeof payload.fields !== "object") {
    throw new SelfProfileValidationError("INVALID_BODY", "请求体必须包含 fields 对象");
  }

  return prisma.$transaction(async (tx) => {
    const profile = await getOrCreateProfile(tx, profileId);

    for (const [key, fieldData] of Object.entries(payload.fields)) {
      if (!SELF_PROVIDED_FIELD_NAMES.includes(key as SelfProvidedFieldName)) {
        throw new SelfProfileValidationError("INVALID_FIELD_NAME", `字段名称 [${key}] 不在六项白名单中`);
      }

      if (!fieldData || typeof fieldData !== "object") {
        throw new SelfProfileValidationError("INVALID_FIELD_DATA", `字段 [${key}] 数据格式无效`);
      }

      const { value, allowedForAnalysis, consentScope } = fieldData;

      if (typeof value !== "string") {
        throw new SelfProfileValidationError("INVALID_VALUE_TYPE", `字段 [${key}] 的值必须为字符串`);
      }

      if (value.length > 5000) {
        throw new SelfProfileValidationError("VALUE_TOO_LONG", `字段 [${key}] 内容超出 5000 字符限制`);
      }

      if (typeof allowedForAnalysis !== "boolean") {
        throw new SelfProfileValidationError("INVALID_ALLOWED_FLAG", `字段 [${key}] allowedForAnalysis 必须为布尔值`);
      }

      if (typeof consentScope !== "string" || !CONSENT_SCOPES.includes(consentScope)) {
        throw new SelfProfileValidationError(
          "INVALID_CONSENT_SCOPE",
          `字段 [${key}] consentScope 只能是 THIS_TASK_ONLY 或 PERSISTENT_ACROSS_TASKS`
        );
      }

      await tx.selfProvidedField.upsert({
        where: {
          profileId_fieldName: {
            profileId: profile.id,
            fieldName: key,
          },
        },
        update: {
          value,
          allowedForAnalysis,
          consentScope,
        },
        create: {
          profileId: profile.id,
          fieldName: key,
          value,
          allowedForAnalysis,
          consentScope,
        },
      });
    }

    const updated = await tx.selfProvidedProfile.update({
      where: { id: profile.id },
      data: { updatedAt: new Date() },
      include: { fields: true },
    });

    return formatProfileResponse(updated);
  });
}

/**
 * Revokes future analysis use of field(s) for a specific profile.
 * Preserves historical task snapshots intact.
 */
export async function revokeSelfProfile(
  payload: RevokeSelfProfilePayload,
  profileId?: string
) {
  const { fieldName } = payload;

  return prisma.$transaction(async (tx) => {
    const profile = await getOrCreateProfile(tx, profileId);

    if (fieldName && fieldName !== "ALL") {
      if (!SELF_PROVIDED_FIELD_NAMES.includes(fieldName as SelfProvidedFieldName)) {
        throw new SelfProfileValidationError("INVALID_FIELD_NAME", `字段名称 [${fieldName}] 无效`);
      }

      await tx.selfProvidedField.updateMany({
        where: {
          profileId: profile.id,
          fieldName,
        },
        data: { allowedForAnalysis: false },
      });

      return {
        success: true,
        action: "REVOKE_FUTURE",
        revokedFieldName: fieldName,
        message: `已关闭字段 [${fieldName}] 用于未来分析的授权，历史任务快照完整保留。`,
      };
    }

    // Revoke all fields
    await tx.selfProvidedField.updateMany({
      where: { profileId: profile.id },
      data: { allowedForAnalysis: false },
    });

    return {
      success: true,
      action: "REVOKE_FUTURE",
      revokedFieldName: "ALL",
      message: "已关闭所有个人自述字段用于未来分析的授权，历史任务快照完整保留。",
    };
  });
}

/**
 * Purges specified field (or ALL fields) permanently:
 * 1. Finds tasks whose snapshots contain the purged field(s) belonging to this specific profile.
 * 2. Deletes SnapshotField records for this profile only.
 * 3. Deletes empty SelfProvidedSnapshot records.
 * 4. Resets profile's SelfProvidedField records (value: "", allowedForAnalysis: false).
 * 5. Marks affected tasks with needsRegeneration = true.
 */
export async function purgeSelfProfile(
  payload: PurgeSelfProfilePayload,
  profileId?: string
) {
  const { fieldName } = payload;

  if (fieldName && fieldName !== "ALL" && !SELF_PROVIDED_FIELD_NAMES.includes(fieldName as SelfProvidedFieldName)) {
    throw new SelfProfileValidationError("INVALID_FIELD_NAME", `字段名称 [${fieldName}] 无效`);
  }

  return prisma.$transaction(async (tx) => {
    const profile = await getOrCreateProfile(tx, profileId);

    // 1. Identify target profile's field IDs to purge
    const targetSourceFields = await tx.selfProvidedField.findMany({
      where: {
        profileId: profile.id,
        ...(fieldName === "ALL" ? {} : { fieldName }),
      },
      select: { id: true, fieldName: true },
    });

    const targetSourceFieldIds = targetSourceFields.map((f) => f.id);

    if (targetSourceFieldIds.length === 0) {
      return {
        success: true,
        action: "PURGE_FIELD",
        purgedFieldName: fieldName,
        affectedTasksCount: 0,
        message: "没有需要清除的自述字段。",
      };
    }

    // 2. Find historical snapshot fields created specifically from this profile's source fields
    const affectedSnapshotFields = await tx.snapshotField.findMany({
      where: {
        sourceFieldId: { in: targetSourceFieldIds },
      },
      select: {
        id: true,
        snapshotId: true,
        snapshot: {
          select: {
            id: true,
            taskId: true,
          },
        },
      },
    });

    const affectedSnapshotFieldIds = affectedSnapshotFields.map((sf) => sf.id);
    const affectedSnapshotIds = Array.from(new Set(affectedSnapshotFields.map((sf) => sf.snapshotId)));
    const affectedTaskIds = Array.from(new Set(affectedSnapshotFields.map((sf) => sf.snapshot.taskId)));

    // 3. Delete matching SnapshotField records
    if (affectedSnapshotFieldIds.length > 0) {
      await tx.snapshotField.deleteMany({
        where: { id: { in: affectedSnapshotFieldIds } },
      });
    }

    // 4. Clean up any SelfProvidedSnapshot that now has 0 fields remaining
    for (const snapshotId of affectedSnapshotIds) {
      const remainingCount = await tx.snapshotField.count({
        where: { snapshotId },
      });
      if (remainingCount === 0) {
        await tx.selfProvidedSnapshot.delete({
          where: { id: snapshotId },
        });
      }
    }

    // 5. Reset this profile's source fields
    await tx.selfProvidedField.updateMany({
      where: {
        profileId: profile.id,
        ...(fieldName === "ALL" ? {} : { fieldName }),
      },
      data: {
        value: "",
        allowedForAnalysis: false,
      },
    });

    // 6. Mark affected tasks as needing regeneration
    if (affectedTaskIds.length > 0) {
      await tx.analysisTask.updateMany({
        where: { id: { in: affectedTaskIds } },
        data: {
          needsRegeneration: true,
          currentStageMessage: "[注意] 关联的个人说明已被永久清除，如需最新结果请重新发起分析。",
        },
      });
    }

    return {
      success: true,
      action: "PURGE_FIELD",
      purgedFieldName: fieldName,
      affectedTasksCount: affectedTaskIds.length,
      message: `已彻底删除 ${fieldName === "ALL" ? "所有" : `字段 [${fieldName}] 的`} 个人说明及关联历史快照字段，已标记 ${affectedTaskIds.length} 个历史任务需要重新生成。`,
    };
  });
}

/**
 * Fully Atomic Task & Snapshot Creation:
 * 1. Performs pure read query (readExistingProfileForTaskCandidate, strictly 0 creates/mutations) outside transaction for concurrency candidate preparation.
 * 2. In single transaction: gets/creates profile (all creates happen strictly in transaction), validates active fields, strictly gates consent.
 * 3. Conditionally claims THIS_TASK_ONLY fields atomically; if count mismatch, throws SelfProfileConflictError and rolls back.
 * 4. Upserts Target and creates AnalysisTask inside the transaction.
 * 5. Creates immutable snapshot using fields read strictly inside this transaction.
 * 6. Hydrates task summary strictly selecting only metadata/count (zero sensitive fields read).
 */
export async function createTaskWithSnapshot(
  dto: CreateTaskDto,
  profileId?: string,
  _barrierHook?: () => Promise<void>,
  sessionId?: string,
  isTest = false
) {
  const { platformUid, displayName, selfProvidedConsentConfirmed } = dto;

  if (!platformUid || typeof platformUid !== "string" || !platformUid.trim()) {
    throw new SelfProfileValidationError("VALIDATION_FAILED", "platformUid 不能为空且必须为非空字符串");
  }

  const cleanUid = platformUid.trim();
  // Fail-closed: the API must reject an illegal UID itself, not rely solely on client-side
  // validation. The connector also rejects non-digit UIDs at collection time, but enforcing
  // here prevents a garbage UID from ever creating a (silently empty) task.
  if (!validateTargetUid(cleanUid)) {
    throw new SelfProfileValidationError(
      "VALIDATION_FAILED",
      "platformUid 必须为 1-16 位纯数字 UID"
    );
  }

  if (displayName !== undefined && displayName !== null && typeof displayName !== "string") {
    throw new SelfProfileValidationError("VALIDATION_FAILED", "displayName 若提供则必须为字符串");
  }

  const cleanName = displayName && displayName.trim() ? displayName.trim() : `用户 (${cleanUid})`;

  // Pure read query outside transaction (strictly read-only, zero create/upsert/mutation)
  const existingProfile = await readExistingProfileForTaskCandidate(profileId, prisma);

  const initialThisTaskOnlyFieldIds = existingProfile
    ? existingProfile.fields
        .filter((f) => f.allowedForAnalysis && f.consentScope === "THIS_TASK_ONLY" && f.value.trim().length > 0)
        .map((f) => f.id)
    : [];

  // Optional read-only concurrency test barrier (never modifies database records)
  if (_barrierHook) {
    await _barrierHook();
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Read or create profile strictly inside transaction
        const profile = await getOrCreateProfile(tx, profileId);

        // 2. Conditional Atomic Claiming of THIS_TASK_ONLY fields:
        // If initial candidate state included THIS_TASK_ONLY fields, attempt conditional claim.
        // If concurrent transaction already consumed any of them, claim count is 0, throwing SelfProfileConflictError.
        const currentThisTaskOnlyFieldIds = profile.fields
          .filter((f) => f.allowedForAnalysis && f.consentScope === "THIS_TASK_ONLY" && f.value.trim().length > 0)
          .map((f) => f.id);

        const targetClaimFieldIds = Array.from(
          new Set([...initialThisTaskOnlyFieldIds, ...currentThisTaskOnlyFieldIds])
        );

        if (targetClaimFieldIds.length > 0) {
          const claimResult = await tx.selfProvidedField.updateMany({
            where: {
              id: { in: targetClaimFieldIds },
              allowedForAnalysis: true,
              consentScope: "THIS_TASK_ONLY",
            },
            data: { allowedForAnalysis: false },
          });

          if (claimResult.count !== targetClaimFieldIds.length) {
            throw new SelfProfileConflictError(
              "THIS_TASK_ONLY_ALREADY_CONSUMED",
              "单次自述字段已被并发任务消费，请刷新后重试"
            );
          }

          await tx.selfProvidedProfile.update({
            where: { id: profile.id },
            data: { updatedAt: new Date() },
          });
        }

        // Active fields in snapshot: persistent active fields + claimed this-task-only fields
        const activeFields = profile.fields.filter(
          (f) =>
            (f.allowedForAnalysis || targetClaimFieldIds.includes(f.id)) &&
            f.value.trim().length > 0
        );

        // 3. Strict Consent Gate: If active fields exist, selfProvidedConsentConfirmed must be true
        if (activeFields.length > 0 && selfProvidedConsentConfirmed !== true) {
          throw new SelfProvidedConsentRequiredError(activeFields.length);
        }

        // 4. Upsert Target
        const target = await tx.analysisTarget.upsert({
          where: { platformUid: cleanUid },
          update: { displayName: cleanName },
          create: {
            platform: "BILIBILI",
            platformUid: cleanUid,
            displayName: cleanName,
            isTest,
          },
        });

        // 5. Create AnalysisTask
        const task = await tx.analysisTask.create({
          data: {
            targetId: target.id,
            sessionId: sessionId || null,
            isTest,
            taskStatus: "PENDING",
            pipelineStage: "COLLECT",
            outcome: "NONE",
            progress: 0,
            currentStageMessage: "任务已创建，等待启动模拟分析流水线",
          },
        });

        // 6. Create immutable snapshot using fields read strictly inside this transaction
        if (activeFields.length > 0 && selfProvidedConsentConfirmed === true) {
          await tx.selfProvidedSnapshot.create({
            data: {
              taskId: task.id,
              fields: {
                create: activeFields.map((f) => ({
                  sourceFieldId: f.id,
                  fieldName: f.fieldName,
                  value: f.value,
                  consentScope: f.consentScope,
                })),
              },
            },
          });
        }

        // Hydrate task and serialize to strictly desensitized summary
        const hydratedTask = await tx.analysisTask.findUniqueOrThrow({
          where: { id: task.id },
          include: {
            target: true,
            dataSourceRuns: true,
            selfProvidedSnapshot: {
              include: {
                fields: {
                  select: { id: true }, // Minimum read: ONLY select id for count calculation, NEVER select value/fieldName/consentScope
                },
              },
            },
          },
        });

        return serializeTaskSummary(hydratedTask);
      },
      { timeout: 15000, maxWait: 10000 }
    );
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2034" || err.code === "P2028")
    ) {
      throw new SelfProfileConflictError(
        "THIS_TASK_ONLY_ALREADY_CONSUMED",
        "单次自述字段已被并发任务消费，请刷新后重试"
      );
    }
    throw err;
  }
}

/**
 * Strict Desensitization Projection for AnalysisTask Prisma queries.
 * NEVER projects SnapshotField.value, fieldName, or consentScope.
 * ONLY selects `SnapshotField.id` to compute count of fields attached to task.
 */
export const TASK_SUMMARY_PRISMA_INCLUDE = {
  target: true,
  dataSourceRuns: true,
  selfProvidedSnapshot: {
    include: {
      fields: {
        select: { id: true },
      },
    },
  },
} as const;

/**
 * Strips raw database fields and formats task summary for secure external API output.
 */
export function serializeTaskSummary(task: {
  id: string;
  targetId: string;
  taskStatus: string;
  pipelineStage: string;
  outcome: string;
  progress: number;
  currentStageMessage: string;
  needsRegeneration: boolean;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  target?: {
    id: string;
    platform: string;
    platformUid: string;
    displayName: string | null;
  } | null;
  dataSourceRuns?: {
    id: string;
    sourceName: string;
    status: string;
    recordsCount: number;
    message: string | null;
  }[];
  selfProvidedSnapshot?: {
    id: string;
    createdAt: Date;
    fields?: { id: string }[];
  } | null;
}): TaskSummaryResponse {
  const hasSnapshot = Boolean(task.selfProvidedSnapshot);
  const fieldsCount = task.selfProvidedSnapshot?.fields?.length ?? 0;

  return {
    id: task.id,
    targetId: task.targetId,
    taskStatus: task.taskStatus as TaskStatus,
    pipelineStage: task.pipelineStage as PipelineStage,
    outcome: task.outcome as TaskOutcome,
    progress: task.progress,
    currentStageMessage: task.currentStageMessage,
    needsRegeneration: task.needsRegeneration,
    hasSelfProvidedSnapshot: hasSnapshot,
    selfProvidedFieldsCount: fieldsCount,
    snapshotCreatedAt: task.selfProvidedSnapshot ? task.selfProvidedSnapshot.createdAt.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    target: task.target
      ? {
          id: task.target.id,
          platform: task.target.platform,
          platformUid: task.target.platformUid,
          displayName: task.target.displayName,
        }
      : undefined,
    dataSourceRuns: (task.dataSourceRuns || []).map((ds) => ({
      id: ds.id,
      sourceName: ds.sourceName,
      status: ds.status as DataSourceRunStatus,
      recordsCount: ds.recordsCount,
      message: ds.message,
    })),
  };
}
