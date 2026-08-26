"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Users,
  History,
  Tag,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TaskStatus, PipelineStage, TaskOutcome, DataSourceRunStatus } from "@/types/analysis";
import { Button } from "@/components/ui/button";

export interface PersistedTaskSummaryItem {
  id: string;
  targetId: string;
  taskStatus: TaskStatus;
  pipelineStage: PipelineStage;
  outcome: TaskOutcome;
  progress: number;
  currentStageMessage: string;
  needsRegeneration?: boolean;
  hasSelfProvidedSnapshot?: boolean;
  selfProvidedFieldsCount?: number;
  snapshotCreatedAt?: string | null;
  createdAt: string;
  completedAt?: string | null;
  target?: {
    id: string;
    platform: string;
    platformUid: string;
    displayName?: string | null;
  };
  dataSourceRuns: {
    id: string;
    sourceName: string;
    status: DataSourceRunStatus;
    recordsCount: number;
    message?: string | null;
  }[];
}

interface TaskSummaryProps {
  tasks: PersistedTaskSummaryItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

function getUnifiedStageMessage(task: PersistedTaskSummaryItem): string {
  if (task.taskStatus === "PENDING") return "本地模拟任务已创建，等待开始。";
  if (task.taskStatus === "RUNNING") return "本地模拟流程正在运行。";
  if (task.taskStatus === "COMPLETED") {
    if (task.outcome === "PARTIAL") return "示例流程已完成，部分模拟信息不可用。";
    return "示例流程已完成。";
  }
  if (task.taskStatus === "CANCELLED") return "本地模拟流程已取消。";
  if (task.taskStatus === "FAILED") return "本地模拟流程已中断。";
  return "本地模拟流程已就绪。";
}

function getUnifiedSourceName(sourceName: string): string {
  if (sourceName.includes("基础")) return "演示基础资料";
  if (sourceName.includes("关注")) return "演示关注样本";
  if (sourceName.includes("动态") || sourceName.includes("投稿")) return "演示动态样本";
  return "演示数据项";
}

export function TaskSummary({ tasks, isLoading, onRefresh }: TaskSummaryProps) {
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Record<string, boolean>>({});

  const toggleTaskExpanded = (id: string) => {
    setExpandedTaskIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const totalTasks = tasks.length;
  const uniqueTargets = tasks.length === 0 ? 0 : new Set(tasks.map((t) => t.target?.platformUid || t.targetId)).size;

  const latestCompletedTask = tasks.find((t) => t.taskStatus === "COMPLETED");
  const sampledFollowingsCount = latestCompletedTask
    ? latestCompletedTask.dataSourceRuns.find((ds) => ds.sourceName.includes("关注"))?.recordsCount ?? 99
    : 0;

  const getFriendlyStatusBadge = (task: PersistedTaskSummaryItem) => {
    if (task.taskStatus === "RUNNING") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>正在模拟中</span>
        </span>
      );
    }
    if (task.taskStatus === "COMPLETED") {
      if (task.outcome === "PARTIAL") {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3" />
            <span>部分信息不可用</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          <span>示例结果已生成</span>
        </span>
      );
    }
    if (task.taskStatus === "FAILED") {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
          模拟中断
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
        已取消
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 3 Overview Insight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 sm:p-5 rounded-2xl bg-card border-border/70 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">本地演示对象</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : uniqueTargets}
          </div>
          <p className="text-[11px] text-muted-foreground">位模拟目标</p>
        </Card>

        <Card className="p-4 sm:p-5 rounded-2xl bg-card border-border/70 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">演示记录总数</span>
            <History className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : totalTasks}
          </div>
          <p className="text-[11px] text-muted-foreground">次模拟流程</p>
        </Card>

        <Card className="p-4 sm:p-5 rounded-2xl bg-card border-border/70 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">示例样本规模</span>
            <Tag className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `${sampledFollowingsCount} 条`}
          </div>
          <p className="text-[11px] text-muted-foreground">条模拟关注样本</p>
        </Card>
      </div>

      {/* Recent Analyses List */}
      <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
        <CardHeader className="p-5 sm:p-6 pb-3 flex flex-row items-center justify-between">
          <div className="space-y-0.5">
            <CardTitle className="text-base sm:text-lg font-bold text-foreground">
              最近分析记录（本地演示）
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              查看本地生成的示例报告与模拟任务状态
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                aria-label="刷新历史分析记录"
                className="text-xs gap-1 h-8 rounded-xl cursor-pointer"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                <span className="hidden sm:inline">刷新</span>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 pt-1 space-y-3">
          {isLoading && tasks.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>正在读取本地任务记录...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">暂无本地演示记录</p>
              <p>在上方输入 UID 或主页链接，开启你的第一次流程体验吧。</p>
            </div>
          ) : (
            tasks.map((task) => {
              const targetUid = task.target?.platformUid || "demo_space_202688";
              const formattedDate = new Date(task.createdAt).toLocaleString("zh-CN", {
                dateStyle: "medium",
                timeStyle: "short",
                hour12: false,
              });

              const isExpanded = Boolean(expandedTaskIds[task.id]);

              return (
                <div
                  key={task.id}
                  className="p-4 sm:p-5 rounded-2xl bg-cream-100/90 border border-border/70 hover:border-border transition-all space-y-3 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">本地模拟对象</span>
                        <span className="px-2 py-0.5 rounded-md bg-cream-200 text-foreground text-xs font-mono border border-border/50">
                          输入 UID: {targetUid}
                        </span>
                        {task.hasSelfProvidedSnapshot ? (
                          <span className="px-2 py-0.5 rounded-md bg-sage-100 text-sage-900 text-xs border border-sage-200/80 font-medium">
                            已使用 {task.selfProvidedFieldsCount} 项个人说明
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-xs">
                            未使用个人说明
                          </span>
                        )}
                        {task.needsRegeneration && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-xs border border-amber-300 font-medium">
                            自述已清除需重新分析
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>模拟时间: {formattedDate}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      {getFriendlyStatusBadge(task)}
                      {task.taskStatus === "COMPLETED" && (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1 rounded-xl bg-card hover:bg-muted font-medium"
                        >
                          <Link href="/analysis">
                            <span>查看示例报告</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Sanitized Stage Message */}
                  <p className="text-xs text-foreground/85 leading-relaxed bg-card/60 p-2.5 rounded-xl border border-border/40">
                    {getUnifiedStageMessage(task)}
                  </p>

                  {/* Collapsible details for data sources */}
                  {task.dataSourceRuns && task.dataSourceRuns.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleTaskExpanded(task.id)}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors py-0.5"
                        aria-expanded={isExpanded}
                      >
                        <span>{isExpanded ? "收起演示数据源情况" : "查看演示数据源情况"}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 p-3 rounded-xl bg-muted/40 border border-border/50 text-[11px] space-y-1.5 animate-in fade-in duration-200">
                          {task.dataSourceRuns.map((ds) => (
                            <div key={ds.id} className="flex items-center justify-between text-muted-foreground">
                              <span>{getUnifiedSourceName(ds.sourceName)}</span>
                              <span className="font-medium">
                                {ds.status === "SUCCEEDED"
                                  ? `已加载 ${ds.recordsCount} 条模拟记录`
                                  : ds.status === "SKIPPED_UNAVAILABLE"
                                  ? "模拟私密，已跳过"
                                  : "未予加载"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
