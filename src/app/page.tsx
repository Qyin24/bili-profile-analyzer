"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { useMockTask } from "@/lib/mock-task-context";
import { useAiConfig } from "@/lib/ai-config-context";
import {
  mapHttpErrorToSafeMessage,
  mapNetworkErrorToSafeMessage,
} from "@/lib/ui-error-mapper";
import { TaskSummaryResponse } from "@/types/task-api";
import { PipelineStage } from "@/types/analysis";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Info,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  FileText,
  RotateCcw,
} from "lucide-react";

interface NaturalStep {
  id: number;
  label: string;
  desc: string;
  stages: PipelineStage[];
}

const NATURAL_STEPS: NaturalStep[] = [
  {
    id: 1,
    label: "准备与采集",
    desc: "校验目标标识，获取公开基础资料与行为样本",
    stages: ["COLLECT"],
  },
  {
    id: 2,
    label: "整理与清洗",
    desc: "规范化公开字段，过滤噪声与无效记录",
    stages: ["NORMALIZE", "CLEAN"],
  },
  {
    id: 3,
    label: "归纳内容特征",
    desc: "匹配主题标签，计算多源分布与行为模式",
    stages: ["EXTRACT", "AGGREGATE", "STATISTICAL_ANALYSIS"],
  },
  {
    id: 4,
    label: "生成画像报告",
    desc: "整合画像结论，输出结构化洞察与推断边界",
    stages: ["AI_ANALYSIS", "SYNTHESIS", "REPORT"],
  },
];

const SESSION_ACTIVE_TASK_KEY = "bili_active_task_id";

// Hard cap for the client-side progress polling loop.
// Without it, a task that never leaves RUNNING (e.g. the serverless execution request was
// terminated by the platform) keeps the browser polling forever with no user-visible outcome.
const POLL_MAX_DURATION_MS = 5 * 60 * 1000;

function getStepIndexForStage(
  stage: PipelineStage | null | undefined,
  isFinished: boolean
): number {
  if (isFinished) return 3;
  if (!stage) return 0;
  if (stage === "COLLECT") return 0;
  if (stage === "NORMALIZE" || stage === "CLEAN") return 1;
  if (stage === "EXTRACT" || stage === "AGGREGATE" || stage === "STATISTICAL_ANALYSIS") return 2;
  if (stage === "AI_ANALYSIS" || stage === "SYNTHESIS" || stage === "REPORT") return 3;
  return 0;
}

type AnalysisStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";

export default function HomePage() {
  const router = useRouter();
  const { startDemoAnalysis, completeAllStages } = useMockTask();
  const { aiConfig } = useAiConfig();

  // Form states
  const [inputVal, setInputVal] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isOptionalOpen, setIsOptionalOpen] = React.useState(false);

  // Optional user-supplied session inputs
  const [recentFocus, setRecentFocus] = React.useState("");
  const [expectedGoal, setExpectedGoal] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Real task execution states
  const [analysisStatus, setAnalysisStatus] = React.useState<AnalysisStatus>("IDLE");
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = React.useState<PipelineStage | null>(null);
  const [stageMessage, setStageMessage] = React.useState<string>("");
  const [progress, setProgress] = React.useState<number>(0);

  // Polling ref to prevent concurrent loops or leaks
  const pollingTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const redirectTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const pollingStartedAtRef = React.useRef<number | null>(null);

  const stopPolling = React.useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const clearActiveSession = React.useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_ACTIVE_TASK_KEY);
      } catch {}
    }
  }, []);

  // Poll single task status from real API
  const pollTaskStatus = React.useCallback(
    async (taskId: string) => {
      // Stop polling once the hard cap is exceeded so the user always reaches a terminal UI state.
      if (pollingStartedAtRef.current === null) {
        pollingStartedAtRef.current = Date.now();
      }
      if (Date.now() - pollingStartedAtRef.current > POLL_MAX_DURATION_MS) {
        stopPolling();
        setAnalysisStatus("FAILED");
        setErrorMessage(
          "分析耗时过长，已停止自动刷新。任务可能仍在后台执行，请稍后在「我的分析」中查看结果。"
        );
        return;
      }

      try {
        const res = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404) {
            stopPolling();
            clearActiveSession();
            setAnalysisStatus("FAILED");
            setErrorMessage("分析任务不存在或已被删除。");
          }
          return;
        }

        const task: TaskSummaryResponse = await res.json();
        setPipelineStage(task.pipelineStage);
        setStageMessage(task.currentStageMessage || "");
        setProgress(task.progress);

        if (task.taskStatus === "COMPLETED") {
          stopPolling();
          clearActiveSession();
          setAnalysisStatus("COMPLETED");
          completeAllStages();

          // Auto-redirect to specific analysis report
          if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
          redirectTimerRef.current = setTimeout(() => {
            router.push(`/analysis?taskId=${task.id}`);
          }, 800);
        } else if (task.taskStatus === "FAILED" || task.taskStatus === "CANCELLED") {
          stopPolling();
          clearActiveSession();
          setAnalysisStatus("FAILED");
          setErrorMessage(task.currentStageMessage || "任务分析失败，请稍后重试。");
        }
      } catch {
        // Transient network glitch during polling; will continue on next tick
      }
    },
    [router, stopPolling, clearActiveSession, completeAllStages]
  );

  // Starts (or restarts) the polling loop for a task and resets its elapsed-time budget.
  const startPolling = React.useCallback(
    (taskId: string) => {
      stopPolling();
      pollingStartedAtRef.current = Date.now();
      pollTaskStatus(taskId);
      pollingTimerRef.current = setInterval(() => {
        pollTaskStatus(taskId);
      }, 700);
    },
    [pollTaskStatus, stopPolling]
  );

  // On component mount: Recover running task if active in sessionStorage
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedTaskId = sessionStorage.getItem(SESSION_ACTIVE_TASK_KEY);
      if (savedTaskId) {
        fetch(`/api/tasks/${savedTaskId}`, { cache: "no-store" })
          .then((res) => {
            if (!res.ok) {
              clearActiveSession();
              return null;
            }
            return res.json();
          })
          .then((task: TaskSummaryResponse | null) => {
            if (!task) return;

            if (task.taskStatus === "RUNNING" || task.taskStatus === "PENDING") {
              setActiveTaskId(task.id);
              setAnalysisStatus("RUNNING");
              setPipelineStage(task.pipelineStage);
              setStageMessage(task.currentStageMessage || "正在恢复分析进度...");
              setProgress(task.progress);

              startPolling(task.id);
            } else if (task.taskStatus === "COMPLETED") {
              clearActiveSession();
              setActiveTaskId(task.id);
              setAnalysisStatus("COMPLETED");
              setPipelineStage("REPORT");
              setProgress(100);
            } else if (task.taskStatus === "FAILED" || task.taskStatus === "CANCELLED") {
              clearActiveSession();
              setAnalysisStatus("FAILED");
              setErrorMessage(task.currentStageMessage || "分析任务执行失败。");
            }
          })
          .catch(() => {
            // Ignore background fetch failure
          });
      }
    } catch {}

    return () => {
      stopPolling();
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [startPolling, stopPolling, clearActiveSession]);

  // Parse UID in pure browser memory
  const parseUid = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Pattern 1: space.bilibili.com/<uid>
    const spaceMatch = trimmed.match(/space\.bilibili\.com\/([0-9]+)/i);
    if (spaceMatch && spaceMatch[1]) {
      return spaceMatch[1];
    }

    // Pattern 2: Pure digits
    if (/^[0-9]+$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  };

  const parsedUid = parseUid(inputVal);

  const handleQuickFill = (val: string) => {
    setInputVal(val);
    setErrorMessage(null);
  };

  const handleResetToIdle = () => {
    stopPolling();
    pollingStartedAtRef.current = null;
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    clearActiveSession();
    setActiveTaskId(null);
    setAnalysisStatus("IDLE");
    setErrorMessage(null);
    setPipelineStage(null);
    setStageMessage("");
    setProgress(0);
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = parseUid(inputVal);

    if (!uid) {
      setErrorMessage("请输入有效的纯数字 UID 或哔哩哔哩个人空间链接 (例如: 202688)");
      return;
    }

    setErrorMessage(null);
    setAnalysisStatus("RUNNING");
    setPipelineStage("COLLECT");
    setStageMessage("正在创建分析任务并校验环境...");
    setProgress(5);

    // 1. Synchronize in-memory MockTaskContext
    startDemoAnalysis(uid);

    // 2. Call backend POST /api/tasks to create persistent record
    try {
      const createRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformUid: uid,
          displayName: `用户 (${uid})`,
          selfProvidedConsentConfirmed: true,
        }),
      });

      const createData = await createRes.json().catch(() => null);
      if (!createRes.ok) {
        const safeErr = mapHttpErrorToSafeMessage(createRes.status, createData?.error?.code);
        setAnalysisStatus("FAILED");
        setErrorMessage(safeErr.message);
        return;
      }

      const createdTask: TaskSummaryResponse = createData;
      const taskId = createdTask.id;
      setActiveTaskId(taskId);
      pollingStartedAtRef.current = Date.now();

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(SESSION_ACTIVE_TASK_KEY, taskId);
        } catch {}
      }

      // 3. Trigger backend execution asynchronously
      const execPayload: {
        provider?: string;
        config?: { apiBaseUrl: string; apiKey: string; model: string };
      } = {};
      if (aiConfig.provider === "OPENAI_COMPATIBLE" && aiConfig.isConfigured && aiConfig.apiKey) {
        execPayload.provider = "OPENAI_COMPATIBLE";
        execPayload.config = {
          apiBaseUrl: aiConfig.apiBaseUrl,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
        };
      } else {
        execPayload.provider = "MOCK";
      }

      fetch(`/api/tasks/${taskId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(execPayload),
      }).catch((execErr) => {
        console.error("Execute trigger error:", execErr);
      });

      // 4. Start polling loop
      startPolling(taskId);
    } catch (err: unknown) {
      const safeErr = mapNetworkErrorToSafeMessage(err);
      setAnalysisStatus("FAILED");
      setErrorMessage(safeErr?.message || "发起分析失败，请检查网络后重试。");
    }
  };

  const isFinished = analysisStatus === "COMPLETED";
  const isFailed = analysisStatus === "FAILED";
  const currentStepIndex = getStepIndexForStage(pipelineStage, isFinished);

  return (
    <AppLayout
      headerTitle="开始分析"
      headerSubtitle="输入公开数字 UID 或主页链接，在本地生成一份温和、有限的内容偏好解读。"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* 1. Warm Welcome Card */}
        <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/70 shadow-sm space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>内容偏好分析</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            看看公开内容中呈现出的关注方向
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            仅使用公开可见信息与你主动补充的内容，帮助你了解自己在不同内容主题上的关注倾向与偏好概览。
          </p>
        </div>

        {/* 2. Main Input & Flow Card */}
        <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/70 shadow-sm space-y-6">
          {analysisStatus === "IDLE" ? (
            <form onSubmit={handleStartAnalysis} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="target-input" className="block text-xs font-bold text-foreground">
                  目标 UID 或个人主页链接
                </label>
                <div className="relative">
                  <input
                    id="target-input"
                    type="text"
                    value={inputVal}
                    onChange={(e) => {
                      setInputVal(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="输入 UID（如 202688）或空间链接"
                    className="w-full px-4 py-3 rounded-2xl bg-background border border-border/80 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-inner"
                  />
                </div>

                {/* Live parsed feedback */}
                {parsedUid && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium pt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>将分析 UID：<strong className="font-mono">{parsedUid}</strong></span>
                  </div>
                )}

                {/* Error message */}
                {errorMessage && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive font-medium pt-1 animate-in fade-in duration-200">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Quick Fill Demo Chips */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <Zap className="w-3 h-3 text-primary" />
                  <span>快捷填入示例：</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickFill("202688")}
                    className="px-3 py-1.5 rounded-xl text-xs bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground border border-border/60 transition-colors cursor-pointer"
                  >
                    示例 UID: 202688
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickFill("1715629066")}
                    className="px-3 py-1.5 rounded-xl text-xs bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground border border-border/60 transition-colors cursor-pointer"
                  >
                    示例 UID: 1715629066
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickFill("https://space.bilibili.com/202688")}
                    className="px-3 py-1.5 rounded-xl text-xs bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground border border-border/60 transition-colors cursor-pointer"
                  >
                    示例空间链接
                  </button>
                </div>
              </div>

              {/* 3. Collapsible Optional Info Section */}
              <div className="pt-2 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setIsOptionalOpen(!isOptionalOpen)}
                  className="flex items-center justify-between w-full py-2 text-xs font-semibold text-foreground/90 hover:text-primary transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>补充一点信息（可选）</span>
                  </div>
                  {isOptionalOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {isOptionalOpen && (
                  <div className="space-y-4 pt-3 pb-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 text-xs text-muted-foreground space-y-1">
                      <div className="font-semibold text-foreground/80 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-primary" />
                        <span>填写提醒</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        请勿填写账号密码、精确住址、医疗信息或他人隐私。这些内容仅保存在当前浏览器会话中，刷新页面后不会保留。
                      </p>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="space-y-1">
                        <label className="font-medium text-foreground/90 block">
                          最近在关注或学习什么？
                        </label>
                        <input
                          type="text"
                          value={recentFocus}
                          onChange={(e) => setRecentFocus(e.target.value)}
                          placeholder="例如: 前端工程、咖啡手冲、数字音频"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/70 text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-medium text-foreground/90 block">
                          希望这次重点了解什么？
                        </label>
                        <input
                          type="text"
                          value={expectedGoal}
                          onChange={(e) => setExpectedGoal(e.target.value)}
                          placeholder="例如: 关注账号的主题分布、近期兴趣偏好"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/70 text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-medium text-foreground/90 block">
                          其他补充说明
                        </label>
                        <textarea
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="例如: 近期在准备相关考试或跨界探索"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/70 text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Start Action */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.99] transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  <span>开始分析</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/history")}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-secondary text-secondary-foreground hover:bg-secondary/80 font-semibold text-sm border border-border/60 transition-all cursor-pointer"
                >
                  <span>查看历史分析</span>
                </button>
              </div>
            </form>
          ) : isFailed ? (
            /* Failed State Display */
            <div className="space-y-6 py-2 text-center animate-in fade-in duration-300">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-foreground">分析未能完成</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {errorMessage || "在采集或分析过程中遇到问题，请检查网络或 UID 是否正确后重试。"}
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleResetToIdle}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>返回重新开始</span>
                </button>
              </div>
            </div>
          ) : (
            /* Real Task Lifecycle Progress Display */
            <div className="space-y-6 py-2 animate-in fade-in duration-300">
              <div className="space-y-2 text-center">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                  {isFinished ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>{isFinished ? "分析已完成" : `正在分析 (${progress}%)`}</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-foreground">
                  {isFinished ? "已生成画像报告，正在为你打开..." : (stageMessage || "正在处理公开行为数据...")}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {activeTaskId && `任务 ID: ${activeTaskId.slice(0, 12)}...`}
                </p>
              </div>

              {/* Natural 4-Step Progress List mapped to real PipelineStage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {NATURAL_STEPS.map((step, idx) => {
                  const isDone = idx < currentStepIndex || isFinished;
                  const isCurrent = idx === currentStepIndex && !isFinished;
                  return (
                    <div
                      key={step.id}
                      className={`p-4 rounded-2xl border transition-all text-xs space-y-1.5 ${
                        isDone
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200"
                          : isCurrent
                          ? "bg-primary/10 border-primary/30 text-foreground font-semibold shadow-xs"
                          : "bg-muted/30 border-border/40 text-muted-foreground opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">
                          {step.id}. {step.label}
                        </span>
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : isCurrent ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">等待</span>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">{step.desc}</p>
                    </div>
                  );
                })}
              </div>

              {/* Completion CTA Actions */}
              {isFinished && (
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                  <button
                    type="button"
                    onClick={() => router.push(`/analysis${activeTaskId ? `?taskId=${activeTaskId}` : ""}`)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>立即查看我的分析报告</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-secondary text-secondary-foreground hover:bg-secondary/80 font-semibold text-sm border border-border/60 transition-all cursor-pointer"
                  >
                    <span>前往“我的报告”列表</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Safety & Privacy Callout */}
        <div className="bg-card/60 rounded-3xl p-5 sm:p-6 border border-border/50 text-xs text-muted-foreground space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>隐私与安全原则</span>
          </div>
          <ul className="list-disc list-inside space-y-1 leading-relaxed text-[11px]">
            <li>这是一份基于有限公开与自述样本的客观解读，不代表对个人的绝对判断。</li>
            <li>严禁推断性取向、宗教信仰、政治立场、疾病诊断或人格标签。</li>
            <li>不保存任何个人登录密码或凭证，充分保护你的数据隐私。</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}

