"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskSummaryResponse } from "@/types/task-api";
import {
  FileText,
  Clock,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  ShieldAlert,
  Database,
  Activity,
  Layers,
  Network,
} from "lucide-react";
import Link from "next/link";

interface TaskDetailCardProps {
  task: TaskSummaryResponse | null;
}

export function TaskDetailCard({ task }: TaskDetailCardProps) {
  if (!task) {
    return (
      <Card className="border-border/80 bg-card rounded-3xl p-8 shadow-warm text-center space-y-2">
        <div className="w-10 h-10 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
          <FileText className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-bold text-foreground">未选择分析记录</h3>
        <p className="text-xs text-muted-foreground">请在下方列表中选择一条分析记录查看详情。</p>
      </Card>
    );
  }

  const isCompleted = task.taskStatus === "COMPLETED";

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

  const natural = getNaturalStatus(task.taskStatus, task.pipelineStage, task.outcome);

  return (
    <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm space-y-0">
      <CardHeader className="p-5 sm:p-6 pb-3 border-b border-border/40 bg-gradient-to-br from-cream-100/70 via-card to-sage-50/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-0.5 rounded-full text-xs font-semibold border ${natural.badge}`}>
                {natural.label}
              </span>
              {task.outcome === "FULL" && (
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground border border-border/60">
                  信息较完整
                </span>
              )}
            </div>
            <CardTitle className="text-base sm:text-lg font-bold text-foreground pt-1">
              {task.target?.displayName || "目标账号"} ({task.target?.platformUid || task.targetId})
            </CardTitle>
          </div>

          {/* Quick Actions: Content Topics, Relationship Graph, Analysis Report */}
          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-xl text-xs gap-1.5 h-8 font-medium cursor-pointer"
            >
              <Link href={`/entities?taskId=${task.id}`}>
                <Layers className="w-3.5 h-3.5" />
                <span>内容主题</span>
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-xl text-xs gap-1.5 h-8 font-medium cursor-pointer"
            >
              <Link href={`/graph?taskId=${task.id}`}>
                <Network className="w-3.5 h-3.5" />
                <span>关系概览</span>
              </Link>
            </Button>

            {isCompleted && !task.needsRegeneration ? (
              <Button
                asChild
                size="sm"
                className="rounded-xl text-xs gap-1.5 h-8 shadow-xs font-semibold cursor-pointer"
              >
                <Link href={`/analysis?taskId=${task.id}`}>
                  <span>查看报告</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            ) : task.needsRegeneration ? (
              <span className="text-[11px] text-amber-900 bg-amber-100/90 px-3 py-1.5 rounded-xl border border-amber-200 font-medium">
                补充信息已变更，需重新生成
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-4">
        {/* Needs Regeneration Alert */}
        {task.needsRegeneration && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">你补充的信息快照已变更</span>
              <p className="text-amber-900/90 leading-relaxed">
                该分析关联的自述补充已被修改或删除，原报告已作废。
              </p>
            </div>
          </div>
        )}

        {/* Progress & Current Message */}
        <div className="p-4 rounded-2xl bg-cream-100/80 border border-border/70 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span>分析进度: {task.progress}%</span>
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${task.progress}%` }}
            />
          </div>

          <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
            {task.currentStageMessage || "分析已就绪"}
          </p>
        </div>

        {/* Attributes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Created At */}
          <div className="p-3 rounded-xl bg-cream-100/60 border border-border/60 text-xs space-y-0.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3 text-primary" />
              <span>创建时间</span>
            </span>
            <span className="font-medium text-foreground block">
              {new Date(task.createdAt).toLocaleString("zh-CN")}
            </span>
          </div>

          {/* Completed At */}
          <div className="p-3 rounded-xl bg-cream-100/60 border border-border/60 text-xs space-y-0.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-primary" />
              <span>完成时间</span>
            </span>
            <span className="font-medium text-foreground block">
              {task.completedAt ? new Date(task.completedAt).toLocaleString("zh-CN") : "尚未完成"}
            </span>
          </div>

          {/* Snapshot Info */}
          <div className="p-3 rounded-xl bg-cream-100/60 border border-border/60 text-xs space-y-0.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-primary" />
              <span>补充信息</span>
            </span>
            <span className="font-medium text-foreground block">
              {task.hasSelfProvidedSnapshot
                ? `包含补充 (${task.selfProvidedFieldsCount} 项)`
                : "未提供补充"}
            </span>
          </div>
        </div>

        {/* Processing Details (Collapsed by default for regular users) */}
        <details className="group rounded-2xl border border-border/60 bg-cream-100/40 p-3.5 text-xs">
          <summary className="cursor-pointer font-semibold text-muted-foreground text-xs select-none hover:text-foreground flex items-center justify-between list-none">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-primary" />
              <span>查看本次可用信息（点击展开）</span>
            </span>
            <span className="text-[11px] text-muted-foreground group-open:hidden">展开</span>
          </summary>
          <div className="pt-3 mt-2 border-t border-border/40 space-y-3">
            {task.dataSourceRuns && task.dataSourceRuns.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {task.dataSourceRuns.map((ds) => (
                  <div
                    key={ds.id || ds.sourceName}
                    className="p-2.5 rounded-xl bg-card border border-border/70 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{ds.sourceName}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                        {ds.status === "SUCCEEDED" ? "可用" : ds.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>可用样本: {ds.recordsCount ?? 0}</span>
                      {ds.message && <span className="truncate max-w-[120px]">{ds.message}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">暂无额外可用信息。</p>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
