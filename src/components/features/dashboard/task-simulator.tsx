"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskStatus, PipelineStage, TaskOutcome } from "@/types/analysis";
import {
  Compass,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  XCircle,
  ExternalLink,
  ArrowRight,
  UserCheck,
} from "lucide-react";
import Link from "next/link";

const STAGES: { stage: PipelineStage; label: string; message: string; duration: number }[] = [
  { stage: "COLLECT", label: "数据准备", message: "正在准备演示样本与示例内容...", duration: 600 },
  { stage: "NORMALIZE", label: "格式整理", message: "正在整理演示数据格式与示例标签...", duration: 500 },
  { stage: "CLEAN", label: "样本去噪", message: "正在清洗演示样本中的冗余项目...", duration: 400 },
  { stage: "EXTRACT", label: "分类匹配", message: "正在匹配示例内容的主题分类...", duration: 500 },
  { stage: "AGGREGATE", label: "占比统计", message: "正在汇总演示样本中的主题占比...", duration: 450 },
  { stage: "STATISTICAL_ANALYSIS", label: "特征计算", message: "正在计算示例样本的主题分布特征...", duration: 500 },
  { stage: "AI_ANALYSIS", label: "语义归纳", message: "正在演示语义归纳步骤（未调用外部模型）...", duration: 700 },
  { stage: "SYNTHESIS", label: "快照核对", message: "正在核对示例结论与演示快照...", duration: 500 },
  { stage: "REPORT", label: "报告就绪", message: "演示流程完成，示例报告已准备好！", duration: 300 },
];

interface TaskSimulatorProps {
  onTaskChange?: () => void;
}

export function TaskSimulator({ onTaskChange }: TaskSimulatorProps) {
  const [rawInput, setRawInput] = React.useState("https://space.bilibili.com/202688");
  const [taskStatus, setTaskStatus] = React.useState<TaskStatus>("PENDING");
  const [currentStageIndex, setCurrentStageIndex] = React.useState<number>(0);
  const [outcome, setOutcome] = React.useState<TaskOutcome>("NONE");
  const [isRunning, setIsRunning] = React.useState(false);
  const [simulatedDegradation, setSimulatedDegradation] = React.useState(false);
  const [persisting, setPersisting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [showMoreInfo, setShowMoreInfo] = React.useState(false);

  // Self-profile consent state
  const [hasSelfProfileFields, setHasSelfProfileFields] = React.useState<boolean>(false);
  const [selfProvidedConsentConfirmed, setSelfProvidedConsentConfirmed] = React.useState<boolean>(true);

  const timeoutRefs = React.useRef<NodeJS.Timeout[]>([]);

  const clearAllTimers = () => {
    timeoutRefs.current.forEach((t) => clearTimeout(t));
    timeoutRefs.current = [];
  };

  React.useEffect(() => {
    // Check if user has active self-profile fields
    fetch("/api/self-profile")
      .then((r) => r.json())
      .then((data) => {
        if (data?.hasAllowedFieldsForAnalysis) {
          setHasSelfProfileFields(true);
        }
      })
      .catch(() => {});

    return () => clearAllTimers();
  }, []);

  // Helper to extract UID from string or URL
  const extractUid = (input: string): string => {
    const trimmed = input.trim();
    const spaceMatch = trimmed.match(/space\.bilibili\.com\/(\d+)/i);
    if (spaceMatch && spaceMatch[1]) {
      return spaceMatch[1];
    }
    return trimmed;
  };

  const parsedUid = extractUid(rawInput);

  const handleStartSimulation = async () => {
    if (isRunning) return;
    clearAllTimers();
    setErrorMessage(null);
    setIsRunning(true);
    setPersisting(true);

    const finalUid = parsedUid || "demo_space_202688";

    try {
      // 1. Create initial task in SQLite DB via POST /api/tasks
      const createRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformUid: finalUid,
          displayName: `演示用户 (${finalUid})`,
          selfProvidedConsentConfirmed: hasSelfProfileFields ? selfProvidedConsentConfirmed : true,
        }),
      });

      if (!createRes.ok) {
        const errJson = await createRes.json().catch(() => null);
        throw new Error(errJson?.error?.message || "创建演示任务失败");
      }

      const createdTask = await createRes.json();
      const taskId = createdTask.id;
      setTaskStatus("RUNNING");
      setOutcome("NONE");
      setCurrentStageIndex(0);
      setPersisting(false);
      onTaskChange?.();

      let cumulativeTime = 0;

      for (let index = 0; index < STAGES.length; index++) {
        const s = STAGES[index];
        cumulativeTime += s.duration;

        const timer = setTimeout(async () => {
          setCurrentStageIndex(index);
          const isFinalStage = index === STAGES.length - 1;
          const currentProgress = Math.round(((index + 1) / STAGES.length) * 100);

          const nextOutcome: TaskOutcome = isFinalStage
            ? simulatedDegradation
              ? "PARTIAL"
              : "FULL"
            : "NONE";
          const nextStatus: TaskStatus = isFinalStage ? "COMPLETED" : "RUNNING";

          const patchPayload: Record<string, unknown> = {
            taskStatus: nextStatus,
            pipelineStage: s.stage,
            outcome: nextOutcome,
            progress: currentProgress,
            currentStageMessage: s.message,
          };

          if (isFinalStage) {
            patchPayload.dataSourceRuns = simulatedDegradation
              ? [
                  { sourceName: "演示基础资料", status: "SUCCEEDED", recordsCount: 1, message: "演示基础信息准备完成" },
                  { sourceName: "演示关注样本", status: "SKIPPED_UNAVAILABLE", recordsCount: 0, message: "模拟关注私密，已跳过" },
                  { sourceName: "演示动态样本", status: "SUCCEEDED", recordsCount: 18, message: "加载 18 条模拟动态样本" },
                ]
              : [
                  { sourceName: "演示基础资料", status: "SUCCEEDED", recordsCount: 1, message: "演示基础信息准备完成" },
                  { sourceName: "演示关注样本", status: "SUCCEEDED", recordsCount: 99, message: "加载 99 条模拟关注样本" },
                  { sourceName: "演示动态样本", status: "SUCCEEDED", recordsCount: 18, message: "加载 18 条模拟动态样本" },
                ];
          }

          try {
            const patchRes = await fetch(`/api/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchPayload),
            });

            if (!patchRes.ok) {
              const errData = await patchRes.json().catch(() => null);
              const errMsg = errData?.error?.message || `处理阶段写入失败 (${patchRes.status})`;
              clearAllTimers();
              setIsRunning(false);
              setTaskStatus("FAILED");
              setErrorMessage(errMsg);
              return;
            }

            if (isFinalStage) {
              setTaskStatus("COMPLETED");
              setOutcome(nextOutcome);
              setIsRunning(false);
            }

            onTaskChange?.();
          } catch (patchErr) {
            console.error("PATCH /api/tasks/[id] error:", patchErr);
            clearAllTimers();
            setIsRunning(false);
            setTaskStatus("FAILED");
            setErrorMessage("网络连接中断，模拟过程已停止");
          }
        }, cumulativeTime);

        timeoutRefs.current.push(timer);
      }
    } catch (err: unknown) {
      console.error("Failed to initiate analysis:", err);
      clearAllTimers();
      setIsRunning(false);
      setPersisting(false);
      setTaskStatus("FAILED");
      setErrorMessage(err instanceof Error ? err.message : "发起模拟失败，请检查网络");
    }
  };

  const handleReset = () => {
    clearAllTimers();
    setIsRunning(false);
    setPersisting(false);
    setTaskStatus("PENDING");
    setCurrentStageIndex(0);
    setOutcome("NONE");
    setErrorMessage(null);
  };

  const currentStage = STAGES[currentStageIndex];
  const progressPercent =
    taskStatus === "PENDING"
      ? 0
      : taskStatus === "COMPLETED"
      ? 100
      : Math.round(((currentStageIndex + 1) / STAGES.length) * 100);

  // Simplified 5 User-Friendly Stages
  const getFriendlyStatusText = () => {
    if (taskStatus === "FAILED") return "模拟中断";
    if (taskStatus === "PENDING") return "准备开始";
    if (isRunning) {
      if (currentStageIndex <= 3) return "正在准备演示样本...";
      return "正在生成演示分析结果...";
    }
    if (taskStatus === "COMPLETED") {
      if (outcome === "PARTIAL") return "演示完成（模拟关注信息设为私密）";
      return "演示完成，示例报告已准备好！";
    }
    return "准备就绪";
  };

  return (
    <div className="space-y-6">
      {/* 1. Main Analysis Input Card */}
      <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
        <CardHeader className="p-5 sm:p-7 pb-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>公开内容偏好分析（演示模式）</span>
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              想了解谁的公开内容偏好？
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              当前为演示：UID 或主页链接仅用于创建本地模拟任务；不会访问 Bilibili，也不会读取真实账号数据。
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-7 pt-0 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5"
            >
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5 flex-1">
                <span className="font-semibold block">处理提示：</span>
                <p className="text-rose-800 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* URL / UID Input Form */}
          <div className="space-y-3">
            <label
              htmlFor="target-space-input"
              className="text-xs font-semibold text-foreground flex items-center justify-between"
            >
              <span>Bilibili 主页链接或 UID:</span>
              {parsedUid && parsedUid !== rawInput && (
                <span className="text-[11px] text-primary font-mono font-medium">
                  已识别 UID: {parsedUid}
                </span>
              )}
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="target-space-input"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                disabled={isRunning || persisting}
                placeholder="例如：https://space.bilibili.com/202688 或纯数字 UID"
                aria-label="输入 Bilibili 主页链接或 UID"
                className="text-xs sm:text-sm bg-cream-100/80 border-border/80 rounded-2xl h-11 px-3.5"
              />
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button"
                  onClick={handleStartSimulation}
                  disabled={
                    isRunning ||
                    persisting ||
                    !rawInput.trim() ||
                    (hasSelfProfileFields && !selfProvidedConsentConfirmed)
                  }
                  className="h-11 px-5 rounded-2xl text-xs sm:text-sm font-semibold gap-2 flex-1 sm:flex-initial shadow-sm cursor-pointer"
                  aria-label="开始分析"
                >
                  {isRunning || persisting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Compass className="w-4 h-4" />
                  )}
                  <span>{isRunning ? "正在模拟中..." : "开始分析"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={isRunning}
                  className="h-11 px-3.5 rounded-2xl text-xs cursor-pointer"
                  aria-label="重置输入"
                  title="重置当前输入"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Self Profile Consent Checkbox (Only shown when active fields exist) */}
            {hasSelfProfileFields && (
              <div className="p-3.5 rounded-2xl bg-sage-50/90 border border-sage-200/80 space-y-1 text-xs animate-in fade-in duration-200">
                <label
                  htmlFor="self-profile-consent-checkbox"
                  className="flex items-start gap-2.5 cursor-pointer text-sage-950 font-medium select-none"
                >
                  <input
                    type="checkbox"
                    id="self-profile-consent-checkbox"
                    checked={selfProvidedConsentConfirmed}
                    onChange={(e) => setSelfProvidedConsentConfirmed(e.target.checked)}
                    className="w-4 h-4 text-primary rounded accent-primary cursor-pointer shrink-0 mt-0.5"
                  />
                  <span className="leading-snug">
                    我确认有权提供并授权本次使用已填写的个人说明。
                  </span>
                </label>
                <p className="text-[11px] text-sage-800/80 pl-6 leading-relaxed">
                  已在本地设置中启用个人说明。勾选后将为此任务生成不可变快照；未勾选时将无法使用个人说明发起分析。
                </p>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>当前为演示流程，不会发起任何外部网络请求或采集真实数据。</span>
            </p>
          </div>

          {/* Real-time Status & Progress Feedback */}
          {(isRunning || taskStatus === "COMPLETED" || taskStatus === "FAILED") && (
            <div className="p-4 rounded-2xl bg-sage-50/80 border border-sage-200/80 space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-sage-900 flex items-center gap-2">
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  ) : taskStatus === "COMPLETED" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>{getFriendlyStatusText()}</span>
                </span>
                <span className="font-mono text-primary font-bold">{progressPercent}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-sage-200/80 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-amber-500 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Friendly message */}
              <p className="text-xs text-sage-800 leading-relaxed bg-card/90 p-3 rounded-xl border border-sage-200/60 shadow-xs">
                {currentStage.message}
              </p>

              {/* Quick jump to report button when completed */}
              {taskStatus === "COMPLETED" && (
                <div className="pt-1 flex items-center justify-end">
                  <Button asChild size="sm" className="text-xs gap-1.5 rounded-xl shadow-xs">
                    <Link href="/analysis">
                      <span>查看示例分析报告</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Collapsible More Info */}
          <div className="pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => setShowMoreInfo((v) => !v)}
              className="flex items-center justify-between w-full text-[11px] text-muted-foreground hover:text-foreground py-1 cursor-pointer transition-colors"
              aria-expanded={showMoreInfo}
            >
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>更多处理信息</span>
              </span>
              {showMoreInfo ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showMoreInfo && (
              <div className="mt-3 p-3.5 rounded-2xl bg-muted/40 border border-border/60 text-xs space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="degrade-toggle" className="space-y-0.5 cursor-pointer select-none">
                    <span className="font-semibold text-foreground block">模拟关注列表私密模式</span>
                    <span className="text-[11px] text-muted-foreground block">
                      模拟目标用户将关注列表设为不可见，系统仅根据模拟动态与自述生成示例偏好
                    </span>
                  </label>
                  <input
                    type="checkbox"
                    id="degrade-toggle"
                    checked={simulatedDegradation}
                    onChange={(e) => setSimulatedDegradation(e.target.checked)}
                    disabled={isRunning}
                    className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Optional Supplement Context Card */}
      <Card className="border-border/70 bg-cream-100/90 rounded-3xl p-5 sm:p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              <span>补充个人说明（可选）</span>
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              你可以补充近期目标、学习方向、兴趣，或希望重点了解的问题，让分析更贴近你的真实背景。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="rounded-xl text-xs gap-1.5 shrink-0 self-start sm:self-auto bg-card hover:bg-muted cursor-pointer"
          >
            <Link href="/settings">
              <span>去设置中管理</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
