"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskSummaryResponse } from "@/types/task-api";
import {
  Users,
  History,
  CheckCircle2,
  RefreshCw,
  Clock,
  Loader2,
  Inbox,
  ArrowRight,
  Sparkles,
  FileText,
} from "lucide-react";
import Link from "next/link";

export type PersistedTaskSummaryItem = TaskSummaryResponse;

interface TaskSummaryProps {
  tasks: TaskSummaryResponse[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function TaskSummary({
  tasks,
  selectedTaskId,
  onSelectTask,
  isLoading = false,
  onRefresh,
}: TaskSummaryProps) {
  const [filterQuery, setFilterQuery] = React.useState("");

  const totalTasks = tasks.length;
  const uniqueTargets =
    tasks.length === 0
      ? 0
      : new Set(tasks.map((t) => t.target?.platformUid || t.targetId)).size;
  const completedTasks = tasks.filter((t) => t.taskStatus === "COMPLETED").length;

  const filteredTasks = tasks.filter((t) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    const uid = t.target?.platformUid?.toLowerCase() || "";
    const name = t.target?.displayName?.toLowerCase() || "";
    const status = t.taskStatus.toLowerCase();
    return uid.includes(q) || name.includes(q) || status.includes(q);
  });

  const getNaturalStatus = (status: string, stage?: string, outcome?: string) => {
    if (status === "COMPLETED") {
      if (outcome === "PARTIAL") {
        return { label: "信息不完整", badge: "bg-amber-100 text-amber-800 border-amber-200" };
      }
      return { label: "已完成", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    }
    if (status === "FAILED") {
      return { label: "未能完成", badge: "bg-rose-100 text-rose-800 border-rose-200" };
    }
    if (status === "CANCELLED") {
      return { label: "已取消", badge: "bg-muted text-muted-foreground border-border/80" };
    }
    if (status === "PENDING") {
      return { label: "准备开始", badge: "bg-cream-200 text-foreground border-border/80" };
    }
    if (status === "RUNNING") {
      if (stage === "STATISTICAL_ANALYSIS" || stage === "AI_ANALYSIS" || stage === "SYNTHESIS" || stage === "REPORT") {
        return { label: "正在生成结果", badge: "bg-amber-100 text-amber-800 border-amber-200" };
      }
      return { label: "正在整理可用信息", badge: "bg-amber-100 text-amber-800 border-amber-200" };
    }
    return { label: "准备开始", badge: "bg-cream-200 text-foreground border-border/80" };
  };

  return (
    <div className="space-y-6">
      {/* 1. Overview Metric Cards (3 Cards Max) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <Card className="border-border/80 bg-card rounded-3xl p-5 shadow-warm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">已创建分析</span>
            <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <History className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{totalTasks}</div>
          <span className="text-[11px] text-muted-foreground">历史分析记录总数</span>
        </Card>

        <Card className="border-border/80 bg-card rounded-3xl p-5 shadow-warm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">已完成报告</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{completedTasks}</div>
          <span className="text-[11px] text-muted-foreground">可直接查看完整报告</span>
        </Card>

        <Card className="border-border/80 bg-card rounded-3xl p-5 shadow-warm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">已分析目标</span>
            <div className="w-7 h-7 rounded-xl bg-sage-100 text-sage-900 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{uniqueTargets}</div>
          <span className="text-[11px] text-muted-foreground">已分析的目标账号数</span>
        </Card>
      </div>

      {/* 2. Historical Analysis Cards Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="space-y-0.5">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span>历史分析记录</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            点击任意记录查看进度详情或阅读已生成的分析报告。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="搜索 UID 或状态..."
            className="px-3.5 py-1.5 rounded-xl bg-card border border-border/80 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-48"
          />

          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="rounded-xl text-xs gap-1.5 h-8 font-medium cursor-pointer shrink-0"
              aria-label="刷新任务列表"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">刷新</span>
            </Button>
          )}
        </div>
      </div>

      {/* 3. Task Cards List */}
      {isLoading && tasks.length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-card/60 rounded-3xl border border-border/60">
          <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">正在加载你的分析报告记录...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="p-10 text-center space-y-3 bg-card/60 rounded-3xl border border-border/60">
          <div className="w-10 h-10 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Inbox className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">暂无分析记录</h4>
            <p className="text-xs text-muted-foreground">
              {filterQuery ? "未找到匹配的分析记录" : "你还没有创建过分析，输入 UID 开始第一次分析吧！"}
            </p>
          </div>
          {!filterQuery && (
            <div className="pt-2">
              <Button asChild size="sm" className="rounded-xl text-xs gap-1.5">
                <Link href="/">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>立即开始分析</span>
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredTasks.map((t) => {
            const isSelected = t.id === selectedTaskId;
            const natural = getNaturalStatus(t.taskStatus, t.pipelineStage, t.outcome);
            const isCompleted = t.taskStatus === "COMPLETED";

            return (
              <div
                key={t.id}
                onClick={() => onSelectTask(t.id)}
                className={`p-4 sm:p-5 rounded-3xl border transition-all cursor-pointer space-y-3 ${
                  isSelected
                    ? "bg-card border-primary ring-2 ring-primary/20 shadow-md"
                    : "bg-card/70 border-border/70 hover:bg-card hover:border-border shadow-xs"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${natural.badge}`}>
                        {natural.label}
                      </span>
                      {t.outcome === "FULL" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-secondary text-secondary-foreground border border-border/60">
                          信息较完整
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-foreground truncate">
                      {t.target?.displayName || "目标账号"} ({t.target?.platformUid || t.targetId})
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    {isCompleted && (
                      <Button
                        asChild
                        size="sm"
                        className="rounded-xl text-xs gap-1.5 h-8 font-semibold shadow-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/analysis?taskId=${t.id}`}>
                          <span>查看报告</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress bar if running */}
                {t.taskStatus === "RUNNING" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{t.currentStageMessage || "正在整理可用信息..."}</span>
                      <span className="font-mono font-bold text-primary">{t.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 rounded-full"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Meta info & Collapsible available information */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground border-t border-border/40">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-primary" />
                      <span>{new Date(t.createdAt).toLocaleString("zh-CN")}</span>
                    </span>
                    {t.hasSelfProvidedSnapshot && (
                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                        • 包含补充信息
                      </span>
                    )}
                  </div>

                  {/* Expandable data source info */}
                  {t.dataSourceRuns && t.dataSourceRuns.length > 0 && (
                    <details
                      className="group"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <summary className="cursor-pointer text-primary hover:underline list-none font-medium text-[11px]">
                        查看本次可用信息 ({t.dataSourceRuns.length})
                      </summary>
                      <div className="p-2.5 mt-1.5 rounded-xl bg-muted/40 border border-border/50 space-y-1 text-xs text-foreground">
                        {t.dataSourceRuns.map((ds) => (
                          <div key={ds.id || ds.sourceName} className="flex items-center justify-between text-[11px]">
                            <span>{ds.sourceName}</span>
                            <span className="text-muted-foreground font-mono">
                              {ds.status === "SUCCEEDED" ? "可用" : ds.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
