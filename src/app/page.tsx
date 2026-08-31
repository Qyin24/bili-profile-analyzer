"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { useMockTask } from "@/lib/mock-task-context";
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
} from "lucide-react";

interface NaturalStep {
  id: number;
  label: string;
  desc: string;
}

const NATURAL_STEPS: NaturalStep[] = [
  { id: 1, label: "准备分析", desc: "校验目标标识与环境就绪状态" },
  { id: 2, label: "整理可用信息", desc: "汇总公开主页与关注内容样本" },
  { id: 3, label: "归纳内容主题", desc: "映射兴趣方向与主题结构" },
  { id: 4, label: "生成报告", desc: "生成结构化内容画像与解读" },
];

export default function HomePage() {
  const router = useRouter();
  const { startDemoAnalysis, completeAllStages } = useMockTask();

  // Form states
  const [inputVal, setInputVal] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isOptionalOpen, setIsOptionalOpen] = React.useState(false);

  // Optional user-supplied session inputs
  const [recentFocus, setRecentFocus] = React.useState("");
  const [expectedGoal, setExpectedGoal] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Analysis progress states
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [isFinished, setIsFinished] = React.useState(false);
  const [createdTaskId, setCreatedTaskId] = React.useState<string | null>(null);

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

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = parseUid(inputVal);

    if (!uid) {
      setErrorMessage("请输入有效的纯数字 UID 或哔哩哔哩个人空间链接 (例如: 202688)");
      return;
    }

    setErrorMessage(null);
    setIsAnalyzing(true);
    setCurrentStepIndex(0);
    setIsFinished(false);

    // 1. Synchronize in-memory MockTaskContext
    startDemoAnalysis(uid);

    // 2. Call backend POST /api/tasks to create persistent record
    let persistentTaskId = `task-${Date.now()}`;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: uid }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.id) {
          persistentTaskId = data.id;
        }
      }
    } catch {
      // Fallback to local memory ID if offline
    }

    setCreatedTaskId(persistentTaskId);

    // 3. Step 1: 准备分析
    setCurrentStepIndex(0);
    await new Promise((r) => setTimeout(r, 600));

    // 4. Step 2: 整理可用信息
    setCurrentStepIndex(1);
    try {
      await fetch(`/api/tasks/${persistentTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskStatus: "RUNNING",
          pipelineStage: "EXTRACT",
          progress: 44,
          currentStageMessage: "正在整理可用信息...",
        }),
      });
    } catch {}
    await new Promise((r) => setTimeout(r, 700));

    // 5. Step 3: 归纳内容主题
    setCurrentStepIndex(2);
    try {
      await fetch(`/api/tasks/${persistentTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskStatus: "RUNNING",
          pipelineStage: "STATISTICAL_ANALYSIS",
          progress: 77,
          currentStageMessage: "正在归纳内容主题...",
        }),
      });
    } catch {}
    await new Promise((r) => setTimeout(r, 700));

    // 6. Step 4: 生成报告
    setCurrentStepIndex(3);
    try {
      await fetch(`/api/tasks/${persistentTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskStatus: "COMPLETED",
          pipelineStage: "REPORT",
          progress: 100,
          outcome: "FULL",
          currentStageMessage: "分析报告已完成",
          completedAt: new Date().toISOString(),
        }),
      });
    } catch {}
    completeAllStages();
    await new Promise((r) => setTimeout(r, 500));

    setIsFinished(true);
  };

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
          {!isAnalyzing ? (
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
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.99] transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  <span>开始分析</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            /* Natural Progress Display */
            <div className="space-y-6 py-2 animate-in fade-in duration-300">
              <div className="space-y-2 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                  {isFinished ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>{isFinished ? "分析已完成" : "正在生成内容偏好报告..."}</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-foreground">
                  {isFinished ? "已生成分析报告" : "正在逐步整理可用信息"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  正在汇总公开行为数据，生成内容偏好报告。
                </p>
              </div>

              {/* Natural 4-Step Progress List */}
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
                    onClick={() => router.push(`/analysis${createdTaskId ? `?taskId=${createdTaskId}` : ""}`)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>查看我的分析报告</span>
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
