"use client";

import * as React from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { TaskSummaryResponse } from "@/types/task-api";
import {
  History,
  CheckCircle2,
  AlertCircle,
  Clock3,
  ArrowRight,
  Database,
  RefreshCw,
  Loader2,
  Inbox,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  mapHttpErrorToSafeMessage,
  mapNetworkErrorToSafeMessage,
} from "@/lib/ui-error-mapper";

export default function HistoryPage() {
  const [tasks, setTasks] = React.useState<TaskSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const fetchTasks = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const safeErr = mapHttpErrorToSafeMessage(res.status, errJson?.error?.code);
        setLoadError(safeErr.message);
        return;
      }
      const data: TaskSummaryResponse[] = await res.json();
      setTasks(data);
    } catch (err: unknown) {
      const safeErr = mapNetworkErrorToSafeMessage(err);
      if (safeErr) {
        setLoadError(safeErr.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const getNaturalStatus = (status: string, outcome?: string) => {
    switch (status) {
      case "COMPLETED":
        return outcome === "PARTIAL"
          ? { label: "信息不完整", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" }
          : { label: "分析完成", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" };
      case "FAILED":
        return { label: "分析失败", badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20" };
      case "CANCELLED":
        return { label: "已取消", badge: "bg-muted text-muted-foreground border-border/80" };
      case "RUNNING":
        return { label: "正在分析", badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" };
      case "PENDING":
      default:
        return { label: "准备开始", badge: "bg-cream-200 text-foreground border-border/80" };
    }
  };

  const getSummaryText = (task: TaskSummaryResponse) => {
    if (!task.dataSourceRuns || task.dataSourceRuns.length === 0) {
      return "无可用信息";
    }

    const content = task.dataSourceRuns.find((d) => d.sourceName === "PUBLIC_CONTENT");
    const fav = task.dataSourceRuns.find((d) => d.sourceName === "PUBLIC_FAVORITES");
    const like = task.dataSourceRuns.find((d) => d.sourceName === "PUBLIC_LIKES");

    const parts: string[] = [];
    if (content && content.status === "SUCCEEDED") {
      parts.push(`${content.recordsCount} 条投稿`);
    }
    if (fav && fav.status === "SUCCEEDED") {
      parts.push(`${fav.recordsCount} 条近期收藏`);
    }
    if (like && like.status === "SUCCEEDED") {
      parts.push(`${like.recordsCount} 条近期点赞`);
    }

    return parts.length > 0 ? parts.join(" · ") : "未采集到公开行为数据";
  };

  return (
    <AppLayout
      headerTitle="我的分析"
      headerSubtitle="查看设备上已保存的历史分析记录与偏好画像报告。"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 1. Environment Banner */}
        <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/80 text-xs text-muted-foreground leading-relaxed flex items-start gap-2.5 shadow-xs">
          <Database className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <span className="font-semibold text-foreground block">
              当前设备上的分析记录
            </span>
            <p className="break-words">
              这里显示你在当前浏览器/设备上发起的分析记录。未接入外部账户，数据仅保存在本地数据库中。
            </p>
          </div>
        </div>

        {/* Retry Alert */}
        {loadError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>加载分析记录失败: {loadError}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchTasks}
              className="text-xs gap-1 self-start sm:self-auto border-rose-300 text-rose-800 hover:bg-rose-100"
            >
              <RefreshCw className="w-3 h-3" />
              重试加载
            </Button>
          </div>
        )}

        {/* Header toolbar */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <History className="w-4.5 h-4.5 text-primary" />
            <span>分析历史 ({tasks.length})</span>
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchTasks}
            disabled={isLoading}
            className="rounded-xl text-xs gap-1.5 h-8 font-medium shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>刷新列表</span>
          </Button>
        </div>

        {/* List of Tasks */}
        {isLoading && tasks.length === 0 ? (
          <div className="p-12 text-center space-y-3 bg-card rounded-3xl border border-border/80 shadow-xs">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">正在加载你的分析历史记录...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center space-y-4 bg-card rounded-3xl border border-border/80 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
              <Inbox className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">暂无分析历史</h4>
              <p className="text-xs text-muted-foreground">你还没有在此设备上发起过任何分析任务。</p>
            </div>
            <div className="pt-2">
              <Button asChild size="sm" className="rounded-xl text-xs gap-1.5">
                <Link href="/">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>立即开始分析</span>
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {tasks.map((task) => {
              const natural = getNaturalStatus(task.taskStatus, task.outcome);
              const isCompleted = task.taskStatus === "COMPLETED";
              const isRunning = task.taskStatus === "RUNNING" || task.taskStatus === "PENDING";
              const isFailed = task.taskStatus === "FAILED";

              return (
                <Card
                  key={task.id}
                  className="bg-card border-border/80 rounded-3xl p-5 hover:border-primary/30 transition-all shadow-xs space-y-3.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${natural.badge}`}>
                          {natural.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          UID {task.target?.platformUid || task.targetId}
                        </span>
                      </div>
                      <h4 className="text-sm sm:text-base font-bold text-foreground">
                        {task.target?.displayName || "分析目标"}
                      </h4>
                    </div>

                    <div className="shrink-0 self-start sm:self-auto">
                      {isCompleted ? (
                        <Button
                          asChild
                          size="sm"
                          className="rounded-xl text-xs font-semibold gap-1.5 shadow-xs"
                        >
                          <Link href={`/analysis?taskId=${task.id}`}>
                            <span>查看报告</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </Button>
                      ) : isRunning ? (
                        <Button
                          asChild
                          variant="secondary"
                          size="sm"
                          className="rounded-xl text-xs font-semibold gap-1.5"
                        >
                          <Link href="/">
                            <span>查看进度</span>
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-xs font-semibold gap-1.5 border-rose-300 text-rose-800 hover:bg-rose-100"
                        >
                          <Link href="/">
                            <span>重新尝试</span>
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Summary of items or failures */}
                  {isCompleted && (
                    <p className="text-xs text-muted-foreground font-medium">
                      {getSummaryText(task)}
                    </p>
                  )}

                  {isFailed && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-700 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{task.currentStageMessage || "此次分析未能完成，请重新尝试。"}</span>
                    </div>
                  )}

                  {isRunning && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{task.currentStageMessage || "正在执行分析步骤..."}</span>
                        <span className="font-mono font-bold text-primary">{task.progress}%</span>
                      </div>
                      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="flex items-center gap-3 pt-2 text-[10px] text-muted-foreground border-t border-border/40 font-medium">
                    <span className="flex items-center gap-1">
                      <Clock3 className="w-3 h-3 text-primary shrink-0" />
                      <span>发起于: {new Date(task.createdAt).toLocaleString("zh-CN")}</span>
                    </span>
                    {task.completedAt && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>完成于: {new Date(task.completedAt).toLocaleString("zh-CN")}</span>
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
