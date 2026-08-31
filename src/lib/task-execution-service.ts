/**
 * BiliProfile Analyzer — Minimal Task Execution Service (Phase 4 Slice 1 & MVP Vertical Slice 2)
 *
 * Implements persistent, auditable, and atomic task execution integrating the gated BilibiliPublicConnector
 * with controlled offline Fixtures and Phase 8.1 NormalizedBasicProfileInput contracts.
 *
 * Lifecycle & Invariant Rules:
 * 1. Monotonic Lifecycle Progression:
 *    COLLECT (10%) -> NORMALIZE (25%) -> CLEAN (40%) -> EXTRACT (55%) ->
 *    AGGREGATE (70%) -> STATISTICAL_ANALYSIS (85%) -> AI_ANALYSIS (92%) ->
 *    SYNTHESIS (96%) -> REPORT (100%).
 * 2. Result Verification on Every Update:
 *    - All Prisma updateMany operations must inspect the returned `count`.
 *    - If count is 0 (task status is no longer RUNNING, e.g. CANCELLED or deleted),
 *      execution aborts immediately with ZERO subsequent artifact writes and ZERO rewriting to FAILED.
 * 3. AI Failure Graceful Degradation:
 *    - If requested Provider (OpenAI, Mock, etc.) or output validation fails:
 *      * Deterministic report artifact is preserved intact.
 *      * Task completes with `taskStatus: "COMPLETED"`, `outcome: "PARTIAL"`.
 *      * Persists a desensitized AI degradation artifact ("AI 分析暂不可用；已保留确定性统计结果。").
 *      * Never silently substitutes Mock AI as if the original provider succeeded.
 *      * Zero leakage of raw exceptions, API Keys, Authorization headers, or raw upstream errors.
 * 4. Deterministic Failure Guard:
 *    - Only when deterministic analysis or deterministic report persistence fails,
 *      task transitions to `FAILED` with `outcome: "NONE"`.
 * 5. Data Honesty & DataSourceRun Auditing:
 *    - Executes BilibiliPublicConnector at COLLECT stage; default production registry keeps all capabilities UNVERIFIED.
 *    - Injects DataSourceRun record for BASIC_PROFILE with exact status (SUCCEEDED, SKIPPED_UNAVAILABLE, RATE_LIMITED, FAILED).
 *    - When UNVERIFIED, honestly degrades to controlled local fixtures without pretending fixture data is real data.
 *    - Zero raw platform HTML, credentials, cookies, tokens, or raw request/response headers persisted.
 */

import { prisma } from "@/lib/prisma";
import { PublicSourceRecord, DeterministicAnalysisResult } from "@/types/processing";
import { PipelineStage, TaskOutcome } from "@/types/analysis";
import { TaskSummaryResponse } from "@/types/task-api";
import { AiProviderType, OpenAiCompatibleConfig } from "@/types/ai-analysis";
import { BilibiliPublicConnector } from "@/lib/connectors/bilibili-public-connector";
import { basicProfileInputToPublicSourceRecord } from "@/lib/processing/basic-profile-input-contract";
import { runDeterministicAnalysis } from "./processing/pipeline";
import {
  persistDeterministicReportForTask,
  ReportConflictError,
} from "./deterministic-report-service";
import {
  persistAiAnalysisForTask,
  persistAiDegradedArtifactForTask,
} from "./ai";
import { serializeTaskSummary, TASK_SUMMARY_PRISMA_INCLUDE } from "./self-profile-service";
import { TERMINAL_TASK_STATUSES } from "./task-lifecycle";

export class TaskNotFoundError extends Error {
  public readonly code = "NOT_FOUND";
  constructor(message = "未找到指定的分析任务") {
    super(message);
    this.name = "TaskNotFoundError";
  }
}

export class TaskTerminalStateError extends Error {
  public readonly code = "TERMINAL_TASK_ERROR";
  constructor(message = "终态任务不可再次执行") {
    super(message);
    this.name = "TaskTerminalStateError";
  }
}

export class TaskAlreadyRunningError extends Error {
  public readonly code = "TASK_ALREADY_RUNNING";
  constructor(message = "任务已被领取或正在执行中") {
    super(message);
    this.name = "TaskAlreadyRunningError";
  }
}

export class TaskExecutionDeterministicFailedError extends Error {
  public readonly code = "DETERMINISTIC_PROCESSING_FAILED";
  constructor(message = "确定性数据处理失败") {
    super(message);
    this.name = "TaskExecutionDeterministicFailedError";
  }
}

/**
 * Controlled offline Fixture records representing diverse public topics.
 * Clearly marked as local demo fixture without real user data.
 */
export const CONTROLLED_FIXTURE_RECORDS: PublicSourceRecord[] = [
  {
    sourceRecordId: "fixture_rec_01",
    sourceType: "CONTENT",
    title: "TypeScript 高级类型与架构设计实战指南",
    description: "探讨类型系统、设计模式与大型前端工程实践",
    tags: ["科技", "编程", "typescript", "软件工程"],
    observedAt: "2026-08-15T10:00:00Z",
  },
  {
    sourceRecordId: "fixture_rec_02",
    sourceType: "CONTENT",
    title: "深入浅出大模型架构与 Agent 工作流系统",
    description: "分析 Transformer 机制、提示词工程与多智能体系统",
    tags: ["科技", "AI", "大模型", "架构设计"],
    observedAt: "2026-08-16T14:30:00Z",
  },
  {
    sourceRecordId: "fixture_rec_03",
    sourceType: "CONTENT",
    title: "塞尔达传说王国之泪：海拉鲁全神庙解谜与路线推荐",
    description: "开放世界神庙探索、建造玩法与解谜实况攻略",
    tags: ["游戏", "主机游戏", "switch", "攻略", "实况"],
    observedAt: "2026-08-18T09:15:00Z",
  },
  {
    sourceRecordId: "fixture_rec_04",
    sourceType: "CONTENT",
    title: "黑神话悟空全隐藏 Boss 机制打法全解析",
    description: "硬核动作游戏打法技巧与隐藏剧情解析",
    tags: ["游戏", "单机游戏", "steam", "动作游戏", "攻略"],
    observedAt: "2026-08-20T16:00:00Z",
  },
  {
    sourceRecordId: "fixture_rec_05",
    sourceType: "FOLLOW",
    title: "开源系统架构精选（演示）",
    description: "专注系统架构、分布式计算与编程语言设计",
    tags: ["科技", "开源", "软件开发"],
  },
  {
    sourceRecordId: "fixture_rec_06",
    sourceType: "FOLLOW",
    title: "硬核游戏研讨社（演示）",
    description: "主机与单机游戏艺术分析与产业观察",
    tags: ["游戏", "单机游戏", "游戏设计"],
  },
  {
    sourceRecordId: "fixture_rec_07",
    sourceType: "CONTENT",
    title: "2026年夏季新番导视与口碑动画推荐",
    description: "精选夏季新番看点、制作阵容与追番建议",
    tags: ["动漫", "新番", "二次元", "番剧"],
    observedAt: "2026-08-22T11:00:00Z",
  },
  {
    sourceRecordId: "fixture_rec_08",
    sourceType: "CONTENT",
    title: "认知科学公开课：如何建立高效知识网络与长期记忆",
    description: "认知心理学与学习方法论科普",
    tags: ["知识", "学习", "认知科学", "方法论"],
    observedAt: "2026-08-24T08:30:00Z",
  },
];

export interface ExecuteTaskOptions {
  provider?: AiProviderType;
  openAiConfig?: OpenAiCompatibleConfig;
  customFetch?: typeof fetch;
  fixtureRecords?: PublicSourceRecord[];
  connector?: BilibiliPublicConnector;
}

/**
 * Atomically advances a task to a subsequent pipeline stage, strictly checking that
 * the task is still in RUNNING status.
 */
async function advanceStage(
  taskId: string,
  stage: PipelineStage,
  progress: number,
  message: string
): Promise<void> {
  const result = await prisma.analysisTask.updateMany({
    where: {
      id: taskId,
      taskStatus: "RUNNING",
    },
    data: {
      pipelineStage: stage,
      progress,
      currentStageMessage: message,
    },
  });

  if (result.count === 0) {
    const currentTask = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      select: { id: true, taskStatus: true },
    });
    if (!currentTask) {
      throw new TaskNotFoundError(`未找到 ID 为 ${taskId} 的分析任务`);
    }
    if (TERMINAL_TASK_STATUSES.includes(currentTask.taskStatus)) {
      throw new TaskTerminalStateError(`任务已处于终态 [${currentTask.taskStatus}]，已终止后续执行`);
    }
    throw new TaskAlreadyRunningError("任务状态已改变，已终止后续执行");
  }
}

/**
 * Transitions task to FAILED only if still in RUNNING state.
 */
async function markTaskFailedIfRunning(
  taskId: string,
  message: string
): Promise<void> {
  const failTime = new Date();
  await prisma.analysisTask.updateMany({
    where: {
      id: taskId,
      taskStatus: "RUNNING",
    },
    data: {
      taskStatus: "FAILED",
      outcome: "NONE" as TaskOutcome,
      completedAt: failTime,
      currentStageMessage: message,
    },
  });
}

/**
 * Executes an AnalysisTask through the minimal execution pipeline.
 */
export async function executeTaskPipeline(
  taskId: string,
  options?: ExecuteTaskOptions
): Promise<TaskSummaryResponse> {
  if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
    throw new TaskNotFoundError("任务 ID 必须为非空字符串");
  }

  // 1. Initial State Check (with target relation included)
  const existingTask = await prisma.analysisTask.findUnique({
    where: { id: taskId },
    include: {
      target: true,
    },
  });

  if (!existingTask) {
    throw new TaskNotFoundError(`未找到 ID 为 ${taskId} 的分析任务`);
  }

  if (TERMINAL_TASK_STATUSES.includes(existingTask.taskStatus)) {
    throw new TaskTerminalStateError(`任务已处于终态 [${existingTask.taskStatus}]，不可再次执行`);
  }

  if (existingTask.taskStatus === "RUNNING") {
    throw new TaskAlreadyRunningError("任务已被领取或正在执行中");
  }

  // 2. Atomic Claim: PENDING -> RUNNING (COLLECT, 10%)
  const claimResult = await prisma.analysisTask.updateMany({
    where: {
      id: taskId,
      taskStatus: "PENDING",
    },
    data: {
      taskStatus: "RUNNING",
      pipelineStage: "COLLECT",
      progress: 10,
      currentStageMessage: "准备数据源采集与受控流水线验证...",
    },
  });

  if (claimResult.count === 0) {
    const reRead = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      select: { id: true, taskStatus: true },
    });
    if (!reRead) throw new TaskNotFoundError();
    if (TERMINAL_TASK_STATUSES.includes(reRead.taskStatus)) {
      throw new TaskTerminalStateError(`任务已处于终态 [${reRead.taskStatus}]，不可再次执行`);
    }
    throw new TaskAlreadyRunningError("任务已被领取或正在执行中");
  }

  // 3. Data Collection via Gated Connector & DataSourceRun Auditing
  const connector = options?.connector ?? new BilibiliPublicConnector();
  const targetUid = existingTask.target?.platformUid;

  const collectedRecords: PublicSourceRecord[] = [];
  let isRealConnectorProfileCollected = false;

  if (targetUid) {
    const startTime = Date.now();
    const connResult = await connector.fetchBasicProfile(targetUid, {
      customFetch: options?.customFetch,
    });
    const durationMs = Date.now() - startTime;

    let runStatus: "SUCCEEDED" | "SKIPPED_UNAVAILABLE" | "RATE_LIMITED" | "FAILED" = "SKIPPED_UNAVAILABLE";
    let recordsCount = 0;
    let message = connResult.reason;

    if (connResult.success && connResult.data?.normalizedInput) {
      const sourceRecord = basicProfileInputToPublicSourceRecord(connResult.data.normalizedInput);
      collectedRecords.push(sourceRecord);
      runStatus = "SUCCEEDED";
      recordsCount = 1;
      isRealConnectorProfileCollected = true;
      message = "成功通过 BASIC_PROFILE 连接器采集并映射公开基础资料";

      // If target had a default placeholder display name, update it with genuine public display name
      if (connResult.data.displayName && existingTask.targetId) {
        const currentTargetName = existingTask.target?.displayName;
        if (
          !currentTargetName ||
          currentTargetName.startsWith("用户 (") ||
          currentTargetName.startsWith("空间链接目标 (")
        ) {
          try {
            await prisma.analysisTarget.update({
              where: { id: existingTask.targetId },
              data: { displayName: connResult.data.displayName },
            });
          } catch {
            // Non-blocking for target name sync
          }
        }
      }
    } else if (connResult.status === "RATE_LIMITED") {
      runStatus = "RATE_LIMITED";
    } else if (
      connResult.status === "UNVERIFIED_BLOCKED" ||
      connResult.status === "IMPLEMENTATION_NOT_AVAILABLE" ||
      connResult.status === "SKIPPED_UNAVAILABLE"
    ) {
      runStatus = "SKIPPED_UNAVAILABLE";
    } else {
      runStatus = "FAILED";
    }

    try {
      await prisma.dataSourceRun.create({
        data: {
          taskId,
          sourceName: "BASIC_PROFILE",
          status: runStatus,
          recordsCount,
          durationMs,
          message,
        },
      });
    } catch {
      // Non-blocking DataSourceRun recording
    }

    // 3.2 Fetch Public Video Submissions via PUBLIC_CONTENT
    const contentStartTime = Date.now();
    const contentResult = await connector.fetchPublicContent(targetUid, {
      customFetch: options?.customFetch,
    });
    const contentDurationMs = Date.now() - contentStartTime;

    let contentRunStatus: "SUCCEEDED" | "SKIPPED_UNAVAILABLE" | "RATE_LIMITED" | "FAILED" = "SKIPPED_UNAVAILABLE";
    let contentRecordsCount = 0;
    let contentMessage = contentResult.reason;

    if (contentResult.success && contentResult.data) {
      const records = (contentResult.data as { records?: PublicSourceRecord[] }).records || [];
      collectedRecords.push(...records);
      contentRunStatus = "SUCCEEDED";
      contentRecordsCount = records.length;
      contentMessage = `成功通过 PUBLIC_CONTENT 连接器采集 ${records.length} 条公开投稿视频`;
    } else if (contentResult.status === "RATE_LIMITED") {
      contentRunStatus = "RATE_LIMITED";
    } else if (
      contentResult.status === "UNVERIFIED_BLOCKED" ||
      contentResult.status === "IMPLEMENTATION_NOT_AVAILABLE" ||
      contentResult.status === "SKIPPED_UNAVAILABLE"
    ) {
      contentRunStatus = "SKIPPED_UNAVAILABLE";
    } else {
      contentRunStatus = "FAILED";
    }

    try {
      await prisma.dataSourceRun.create({
        data: {
          taskId,
          sourceName: "PUBLIC_CONTENT",
          status: contentRunStatus,
          recordsCount: contentRecordsCount,
          durationMs: contentDurationMs,
          message: contentMessage,
        },
      });
    } catch {
      // Non-blocking DataSourceRun recording
    }

    // 3.3 Fetch Public Favorites via PUBLIC_FAVORITES
    const favStartTime = Date.now();
    const favResult = await connector.fetchPublicFavorites(targetUid, {
      customFetch: options?.customFetch,
    });
    const favDurationMs = Date.now() - favStartTime;

    let favRunStatus: "SUCCEEDED" | "SKIPPED_UNAVAILABLE" | "RATE_LIMITED" | "FAILED" = "SKIPPED_UNAVAILABLE";
    let favRecordsCount = 0;
    let favMessage = favResult.reason;

    if (favResult.success && favResult.data?.records) {
      collectedRecords.push(...favResult.data.records);
      favRunStatus = "SUCCEEDED";
      favRecordsCount = favResult.data.records.length;
      favMessage = `成功通过 PUBLIC_FAVORITES 连接器采集 ${favRecordsCount} 条公开收藏视频`;
    } else if (favResult.status === "PRIVATE") {
      favRunStatus = "SKIPPED_UNAVAILABLE";
      favMessage = "用户未公开收藏夹或设置了隐私保护";
    } else if (favResult.status === "RATE_LIMITED") {
      favRunStatus = "RATE_LIMITED";
    } else {
      favRunStatus = "SKIPPED_UNAVAILABLE";
    }

    try {
      await prisma.dataSourceRun.create({
        data: {
          taskId,
          sourceName: "PUBLIC_FAVORITES",
          status: favRunStatus,
          recordsCount: favRecordsCount,
          durationMs: favDurationMs,
          message: favMessage,
        },
      });
    } catch {
      // Non-blocking DataSourceRun recording
    }

    // 3.4 Fetch Public Likes via PUBLIC_LIKES
    const likeStartTime = Date.now();
    const likeResult = await connector.fetchPublicLikes(targetUid, {
      customFetch: options?.customFetch,
    });
    const likeDurationMs = Date.now() - likeStartTime;

    let likeRunStatus: "SUCCEEDED" | "SKIPPED_UNAVAILABLE" | "RATE_LIMITED" | "FAILED" = "SKIPPED_UNAVAILABLE";
    let likeRecordsCount = 0;
    let likeMessage = likeResult.reason;

    if (likeResult.success && likeResult.data?.records) {
      collectedRecords.push(...likeResult.data.records);
      likeRunStatus = "SUCCEEDED";
      likeRecordsCount = likeResult.data.records.length;
      likeMessage = `成功通过 PUBLIC_LIKES 连接器采集 ${likeRecordsCount} 条公开点赞视频`;
    } else if (likeResult.status === "PRIVATE") {
      likeRunStatus = "SKIPPED_UNAVAILABLE";
      likeMessage = "用户关闭了点赞公开或暂无公开点赞";
    } else if (likeResult.status === "RATE_LIMITED") {
      likeRunStatus = "RATE_LIMITED";
    } else {
      likeRunStatus = "SKIPPED_UNAVAILABLE";
    }

    try {
      await prisma.dataSourceRun.create({
        data: {
          taskId,
          sourceName: "PUBLIC_LIKES",
          status: likeRunStatus,
          recordsCount: likeRecordsCount,
          durationMs: likeDurationMs,
          message: likeMessage,
        },
      });
    } catch {
      // Non-blocking DataSourceRun recording
    }

    // 3.5 Fetch Public Follows via PUBLIC_FOLLOWS (Gated & Auth-aware)
    const followStartTime = Date.now();
    const followResult = await connector.fetchPublicFollows(targetUid, {
      customFetch: options?.customFetch,
    });
    const followDurationMs = Date.now() - followStartTime;

    try {
      await prisma.dataSourceRun.create({
        data: {
          taskId,
          sourceName: "PUBLIC_FOLLOWS",
          status: followResult.success ? "SUCCEEDED" : "SKIPPED_UNAVAILABLE",
          recordsCount: followResult.data?.records?.length || 0,
          durationMs: followDurationMs,
          message: followResult.reason,
        },
      });
    } catch {
      // Non-blocking DataSourceRun recording
    }
  }

  // Strict Production Invariant: Only use genuine collectedRecords in production tasks.
  // If in production and fixture records are detected, fail immediately.
  if (!options?.fixtureRecords) {
    const hasFixture = collectedRecords.some((r) => r.sourceRecordId?.startsWith("fixture_rec_"));
    if (hasFixture) {
      await markTaskFailedIfRunning(taskId, "检测到非法演示数据混入，流水线已安全熔断");
      throw new Error("CRITICAL_SECURITY_ERROR: Fixture records detected in genuine task pipeline!");
    }
  }
  const rawRecords = options?.fixtureRecords ?? collectedRecords;

  try {
    // 4. Monotonic Sequential Stage Advancements
    // Stage 1: NORMALIZE (25%)
    await advanceStage(taskId, "NORMALIZE", 25, "正在规范化公开结构字段...");

    // Stage 2: CLEAN (40%)
    await advanceStage(taskId, "CLEAN", 40, "正在过滤噪声与无效记录...");

    // Stage 3: EXTRACT (55%)
    await advanceStage(taskId, "EXTRACT", 55, "正在匹配内容主题标签与证据索引...");

    // Stage 4: AGGREGATE (70%)
    await advanceStage(taskId, "AGGREGATE", 70, "正在聚合统计指标与分布比例...");

    // Stage 5: STATISTICAL_ANALYSIS (85%)
    await advanceStage(taskId, "STATISTICAL_ANALYSIS", 85, "正在计算内容多样性与信息熵指标...");

    // Step 5. Run deterministic processing pipeline
    let analysisResult: DeterministicAnalysisResult;
    try {
      analysisResult = runDeterministicAnalysis(rawRecords);
    } catch {
      await markTaskFailedIfRunning(taskId, "执行确定性数据分析算法失败");
      throw new TaskExecutionDeterministicFailedError("执行确定性数据分析算法失败");
    }

    // Step 6. Check RUNNING status before writing deterministic report artifact
    const checkBeforeReport = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      select: { taskStatus: true },
    });
    if (!checkBeforeReport || checkBeforeReport.taskStatus !== "RUNNING") {
      if (!checkBeforeReport) throw new TaskNotFoundError();
      throw new TaskTerminalStateError(`任务已处于终态 [${checkBeforeReport.taskStatus}]，已终止后续执行`);
    }

    try {
      await persistDeterministicReportForTask(taskId, analysisResult);
    } catch (reportErr: unknown) {
      if (reportErr instanceof ReportConflictError) {
        // Idempotent/conflict handled
      } else {
        await markTaskFailedIfRunning(taskId, "确定性报告持久化失败");
        throw new TaskExecutionDeterministicFailedError("确定性报告持久化失败");
      }
    }

    // Stage 6: AI_ANALYSIS (92%)
    await advanceStage(taskId, "AI_ANALYSIS", 92, "正在生成结构化画像分析解读...");

    // Step 7. Run and persist AI Analysis (Graceful Degradation)
    const targetProvider: AiProviderType = options?.provider ?? "MOCK";
    let aiPersistedSuccessfully = false;

    try {
      await persistAiAnalysisForTask(taskId, {
        provider: targetProvider,
        openAiConfig: options?.openAiConfig,
        customFetch: options?.customFetch,
      });
      aiPersistedSuccessfully = true;
    } catch {
      // Requested AI Provider or output validation failed
    }

    if (!aiPersistedSuccessfully) {
      // Verify task is still RUNNING before writing degraded artifact
      const checkBeforeDegraded = await prisma.analysisTask.findUnique({
        where: { id: taskId },
        select: { taskStatus: true },
      });
      if (!checkBeforeDegraded || checkBeforeDegraded.taskStatus !== "RUNNING") {
        if (!checkBeforeDegraded) throw new TaskNotFoundError();
        throw new TaskTerminalStateError(`任务已处于终态 [${checkBeforeDegraded.taskStatus}]，已终止后续执行`);
      }

      // Persist desensitized AI unavailable artifact
      try {
        await persistAiDegradedArtifactForTask(taskId, targetProvider);
      } catch {
        // If even degraded artifact storage fails, continue to preserve deterministic report
      }
    }

    // Stage 7: SYNTHESIS (96%)
    await advanceStage(taskId, "SYNTHESIS", 96, "正在整合确定性统计与画像分析结论...");

    // Stage 8: REPORT (100%) - Atomic Final Completion
    const completionTime = new Date();
    const completionMessage = isRealConnectorProfileCollected
      ? "任务分析与报告生成完成（包含经验证的公开基础资料与受控样本）"
      : "任务分析与报告生成完成（本地演示 Fixture；未采集 Bilibili 数据）";

    const completeResult = await prisma.analysisTask.updateMany({
      where: {
        id: taskId,
        taskStatus: "RUNNING",
      },
      data: {
        taskStatus: "COMPLETED",
        pipelineStage: "REPORT",
        progress: 100,
        // PARTIAL is reserved for AI degradation (see invariant rule 3 in this file's header).
        // A fully successful run must report FULL, otherwise every task shows "信息不完整".
        outcome: (aiPersistedSuccessfully ? "FULL" : "PARTIAL") as TaskOutcome,
        completedAt: completionTime,
        currentStageMessage: completionMessage,
      },
    });

    if (completeResult.count === 0) {
      const reRead = await prisma.analysisTask.findUnique({
        where: { id: taskId },
        include: TASK_SUMMARY_PRISMA_INCLUDE,
      });
      if (!reRead) throw new TaskNotFoundError();
      if (reRead.taskStatus === "COMPLETED") {
        return serializeTaskSummary(reRead);
      }
      throw new TaskTerminalStateError(`任务已处于终态 [${reRead.taskStatus}]，已终止后续执行`);
    }

    const updatedTask = await prisma.analysisTask.findUnique({
      where: { id: taskId },
      include: TASK_SUMMARY_PRISMA_INCLUDE,
    });

    if (!updatedTask) {
      throw new TaskNotFoundError();
    }

    return serializeTaskSummary(updatedTask);
  } catch (err: unknown) {
    if (
      err instanceof TaskNotFoundError ||
      err instanceof TaskTerminalStateError ||
      err instanceof TaskAlreadyRunningError
    ) {
      // Re-throw without overriding cancelled/terminal states or modifying task
      throw err;
    }

    // On unexpected deterministic error while task was running
    await markTaskFailedIfRunning(taskId, "确定性处理异常，任务未能完成");
    throw err;
  }
}
