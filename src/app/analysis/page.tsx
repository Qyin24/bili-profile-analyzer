"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import {
  filterCompletedTasks,
  buildAnalysisViewModel,
  mapApiStatusToErrorMessage,
  AnalysisPageState,
} from "@/lib/analysis-view-model";
import { TaskSummaryResponse } from "@/types/task-api";
import {
  TaskDeterministicReportResponse,
  ReportEvidence,
} from "@/types/processing";
import { TaskAiAnalysisResponse } from "@/types/ai-analysis";
import {
  BarChart3,
  Brain,
  FileCheck,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  PlusCircle,
  Layers,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SamplingScopeCard } from "@/components/features/analysis/sampling-scope-card";
import { FindingCard } from "@/components/features/analysis/finding-card";
import { EvidenceModal } from "@/components/features/analysis/evidence-modal";

function AnalysisPageContent() {
  const searchParams = useSearchParams();
  const requestedTaskId = searchParams.get("taskId");

  const [pageState, setPageState] = React.useState<AnalysisPageState>({
    type: "LOADING",
  });
  const [selectedEvidence, setSelectedEvidence] = React.useState<ReportEvidence | null>(null);
  const [activeEvidenceListIds, setActiveEvidenceListIds] = React.useState<string[] | null>(null);

  const loadAnalysisData = React.useCallback(async () => {
    setPageState({ type: "LOADING" });

    try {
      // 1. Fetch task list
      const tasksRes = await fetch("/api/tasks", { cache: "no-store" });
      if (!tasksRes.ok) {
        const mapped = mapApiStatusToErrorMessage(tasksRes.status);
        setPageState({ type: "ERROR", code: mapped.code, message: mapped.message });
        return;
      }

      const tasks: TaskSummaryResponse[] = await tasksRes.json();
      if (!Array.isArray(tasks) || tasks.length === 0) {
        setPageState({
          type: "EMPTY",
          message: "暂无任何分析任务，请先在控制台创建并执行分析任务",
        });
        return;
      }

      // Filter completed tasks
      const completedTasks = filterCompletedTasks(tasks);
      if (completedTasks.length === 0) {
        setPageState({
          type: "EMPTY",
          message: "暂无已完成的分析任务。任务完成后方可查看画像报告。",
        });
        return;
      }

      // Determine target task
      let targetTask = completedTasks[0];
      if (requestedTaskId) {
        const matched = completedTasks.find((t) => t.id === requestedTaskId);
        if (matched) {
          targetTask = matched;
        }
      }

      // 2. Fetch deterministic report and AI analysis in parallel
      const [reportRes, aiRes] = await Promise.all([
        fetch(`/api/tasks/${targetTask.id}/deterministic-report`, { cache: "no-store" }),
        fetch(`/api/tasks/${targetTask.id}/ai-analysis`, { cache: "no-store" }),
      ]);

      if (!reportRes.ok) {
        const mapped = mapApiStatusToErrorMessage(reportRes.status);
        setPageState({ type: "ERROR", code: mapped.code, message: mapped.message });
        return;
      }
      if (!aiRes.ok) {
        const mapped = mapApiStatusToErrorMessage(aiRes.status);
        setPageState({ type: "ERROR", code: mapped.code, message: mapped.message });
        return;
      }

      const reportData: TaskDeterministicReportResponse = await reportRes.json();
      const aiData: TaskAiAnalysisResponse = await aiRes.json();

      // 3. Build unified view model
      const state = buildAnalysisViewModel(targetTask, reportData, aiData);
      setPageState(state);
    } catch {
      setPageState({
        type: "ERROR",
        code: "SERVER_ERROR",
        message: "暂时无法加载分析结果，请检查网络后重试。",
      });
    }
  }, [requestedTaskId]);

  React.useEffect(() => {
    loadAnalysisData();
  }, [loadAnalysisData]);

  // Loading State
  if (pageState.type === "LOADING") {
    return (
      <div className="bg-card rounded-3xl p-12 border border-border/80 text-center space-y-4 shadow-warm">
        <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">正在加载行为画像报告...</h3>
          <p className="text-xs text-muted-foreground">稍等片刻，正在整理分析结果</p>
        </div>
      </div>
    );
  }

  // Empty State
  if (pageState.type === "EMPTY") {
    return (
      <div className="bg-card rounded-3xl p-10 border border-border/80 text-center space-y-4 shadow-warm">
        <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
          <Layers className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">暂无可展示的分析报告</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {pageState.message.replace("请先在控制台创建并执行分析任务", "请先在首页输入 UID 发起分析")}
          </p>
        </div>
        <div className="pt-2">
          <Button asChild className="rounded-xl text-xs gap-1.5 font-semibold">
            <Link href="/dashboard">
              <PlusCircle className="w-3.5 h-3.5" />
              <span>前往发起分析</span>
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Error State
  if (pageState.type === "ERROR") {
    return (
      <div className="bg-card rounded-3xl p-10 border border-border/80 text-center space-y-4 shadow-warm">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">报告加载受阻</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {pageState.message}
          </p>
        </div>
        <div className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={loadAnalysisData}
            className="rounded-xl text-xs gap-1.5 font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重新加载</span>
          </Button>
        </div>
      </div>
    );
  }

  // SUCCESS State
  const { task, deterministicReport, aiAnalysis } = pageState;

  // Calculate top observed topics
  const topTopics = deterministicReport.topicShares
    .slice(0, 3)
    .map((t) => t.topicName);

  // Content items count
  const totalObservedRecords = deterministicReport.diagnostics.totalInputRecords;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* 1. Header Overview: Target Profile & Executive Banner */}
      <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">分析对象</span>
              <span className="px-2.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full border border-primary/20">
                {task.isRealProfile ? "公开基础资料 (已验证)" : "公开行为样本"}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {task.targetDisplayName}
            </h2>
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 font-mono">
              <span>UID: <strong className="text-foreground font-semibold">{task.platformUid || "未关联真实UID"}</strong></span>
              <span>•</span>
              <span>完成时间: {task.completedAt ? new Date(task.completedAt).toLocaleString("zh-CN") : "刚刚"}</span>
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-secondary/60 border border-border/50 text-xs self-start sm:self-auto text-left sm:text-right space-y-1">
            <div className="text-[11px] text-muted-foreground font-medium">主要观察主题</div>
            <div className="font-bold text-foreground text-xs sm:text-sm">
              {topTopics.length > 0 ? topTopics.join(" · ") : "泛兴趣分布"}
            </div>
          </div>
        </div>

        {/* Executive Summary Card */}
        <div className="p-5 sm:p-6 rounded-2xl bg-secondary/40 border border-border/60 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-foreground">
            <div className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <FileCheck className="w-3.5 h-3.5" />
            </div>
            <span>核心画像总结</span>
          </div>
          <div className="text-foreground/90 leading-relaxed text-xs sm:text-sm whitespace-pre-line font-normal">
            {aiAnalysis.summary || deterministicReport.summary}
          </div>
        </div>
      </div>

      {/* 2. Data Observation Scope & Sampling Limits (Section 4) */}
      <SamplingScopeCard
        samplingMetadata={deterministicReport.samplingMetadata}
        totalObservedRecords={totalObservedRecords}
      />

      {/* 3. Core Behavioral Findings (Section 3) */}
      <div className="space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-2 font-bold text-base sm:text-lg text-foreground">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-600 flex items-center justify-center">
              <Brain className="w-4.5 h-4.5" />
            </div>
            <span>核心行为洞察与实践分析</span>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            共 {aiAnalysis.findings.length} 项核心洞察
          </span>
        </div>

        <div className="space-y-6">
          {aiAnalysis.findings.map((finding, index) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              index={index}
              evidenceMap={deterministicReport.evidenceMap}
              contentItemsMap={deterministicReport.contentItemsMap}
              behaviorTopicMatrix={deterministicReport.behaviorTopicMatrix}
              temporalPatterns={deterministicReport.temporalPatterns}
              samplingMetadata={deterministicReport.samplingMetadata}
              onSelectEvidence={(ev) => {
                setActiveEvidenceListIds(null);
                setSelectedEvidence(ev);
              }}
              onOpenAllEvidence={(ids) => {
                setSelectedEvidence(null);
                setActiveEvidenceListIds(ids);
              }}
            />
          ))}
        </div>
      </div>

      {/* 4. Cross-Source Behavioral Patterns & Deterministic Topic Shares (Section 11) */}
      <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2 font-bold text-base text-foreground">
            <div className="w-7 h-7 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <span>多源行为分布与客观统计</span>
          </div>
          <span className="text-xs text-muted-foreground">基于公开行为记录统计</span>
        </div>

        {/* Topic Distribution Grid */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground">主题跨源分布与占比</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {deterministicReport.topicShares.map((topic) => (
              <div
                key={topic.topicId}
                className="p-4 rounded-2xl bg-background/80 border border-border/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-xs sm:text-sm">
                    {topic.topicName}
                  </span>
                  <span className="font-mono font-bold text-primary">{topic.percentage}</span>
                </div>
                <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: topic.percentage }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Deterministic Observations */}
        {deterministicReport.observations.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-border/40">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span>行为特征客观观察</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {deterministicReport.observations.map((obs) => (
                <div
                  key={obs.id}
                  className="p-4 rounded-2xl bg-background/80 border border-border/60 space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300">
                      {obs.category === "SAMPLE_SIZE"
                        ? "样本规模"
                        : obs.category === "TOP_TOPIC"
                        ? "核心主题"
                        : obs.category === "TOPIC_DISTRIBUTION"
                        ? "分布概览"
                        : obs.category === "DIVERSITY"
                        ? "多样性评估"
                        : obs.category}
                    </span>
                    <p className="text-xs text-foreground font-medium pt-1 leading-relaxed">
                      {obs.statement}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. Methodological Limitations & Boundaries (Section 5) */}
      <div className="p-6 sm:p-7 rounded-3xl bg-muted/30 border border-border/60 text-xs sm:text-sm space-y-3">
        <div className="font-bold text-sm text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>无法判断什么与推断边界说明</span>
        </div>
        <ul className="space-y-2 text-muted-foreground list-disc list-inside leading-relaxed text-xs sm:text-sm">
          {Array.from(
            new Set([
              ...(deterministicReport.limitations || []),
              ...(aiAnalysis.limitations || []),
            ])
          ).map((lim, idx) => (
            <li key={idx}>{lim}</li>
          ))}
        </ul>
      </div>

      {/* Unified Evidence Modal / List Drawer */}
      <EvidenceModal
        evidence={selectedEvidence}
        evidenceListIds={activeEvidenceListIds}
        evidenceMap={deterministicReport.evidenceMap}
        contentItemsMap={deterministicReport.contentItemsMap}
        onClose={() => {
          setSelectedEvidence(null);
          setActiveEvidenceListIds(null);
        }}
        onSelectEvidence={(ev) => {
          setActiveEvidenceListIds(null);
          setSelectedEvidence(ev);
        }}
      />
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <AppLayout
      headerTitle="用户行为画像"
      headerSubtitle="基于 Bilibili 公开行为证据的可追溯画像分析，严格标明数据观测范围与推断边界。"
      showNewAnalysisButton
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <React.Suspense
          fallback={
            <div className="bg-card rounded-3xl p-12 border border-border/80 text-center space-y-3 shadow-warm">
              <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
              <h3 className="text-sm font-bold text-foreground">正在初始化页面...</h3>
            </div>
          }
        >
          <AnalysisPageContent />
        </React.Suspense>
      </div>
    </AppLayout>
  );
}
