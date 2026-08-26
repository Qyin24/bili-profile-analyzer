"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MOCK_ANALYSIS_RESULT,
  MOCK_CATEGORY_METRICS,
} from "@/lib/mock-data";
import { ReportEvidenceSnapshot } from "@/types/analysis";
import { EvidenceDrawer } from "./evidence-drawer";
import {
  Sparkles,
  BookOpen,
  Music,
  Clock,
  Compass,
  FileCheck,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";

export function getEvidenceNaturalName(evidenceId: string): string {
  switch (evidenceId) {
    case "ev-self-goal-1":
      return "示例补充目标";
    case "ev-metric-edu-01":
      return "知识学习统计 (32.3%)";
    case "ev-metric-tech-1":
      return "技术数码统计 (28.3%)";
    case "ev-follow-tech-01":
      return "模拟关注：开源系统架构小站";
    case "ev-metric-music-1":
      return "音乐艺术统计 (14.1%)";
    case "ev-follow-music-01":
      return "模拟关注：古典吉他研习社";
    case "ev-follow-sports-01":
      return "模拟关注：羽毛球战术";
    case "ev-metric-time-01":
      return "模拟时段统计 (晚间集中)";
    case "ev-dynamic-sample-01":
      return "模拟动态摘录 #1";
    case "ev-dynamic-sample-02":
      return "模拟动态摘录 #2";
    default:
      return "示例数据快照";
  }
}

export function ReportViewer() {
  const [selectedEvidence, setSelectedEvidence] = React.useState<ReportEvidenceSnapshot | null>(null);
  const [expandedEvidenceInterpId, setExpandedEvidenceInterpId] = React.useState<Record<string, boolean>>({});

  const toggleEvidenceExpanded = (id: string) => {
    setExpandedEvidenceInterpId((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleOpenEvidence = (evidenceId: string) => {
    const found = MOCK_ANALYSIS_RESULT.evidenceSnapshots.find(
      (e) => e.id === evidenceId || e.evidenceId === evidenceId
    );
    if (found) {
      setSelectedEvidence(found);
    }
  };

  // Human-friendly interpretations mapping
  const friendlyInterpretations = [
    {
      id: "interp-01",
      icon: BookOpen,
      title: "技术与专业学习偏好",
      summary: "模拟关注与动态样本中呈现出显著的计算机工程与技术学习偏好，知识学习与技术开发类内容占比超过一半。",
      details: "结合示例学习目标与 28 个模拟技术关注样本，展示出对全栈架构、底层原理与工程实战的自主学习与技术输入偏好。",
      evidenceIds: ["ev-self-goal-1", "ev-metric-edu-01", "ev-metric-tech-1", "ev-follow-tech-01"],
      disclaimer: "这仅基于示例快照作出的有限演示，不代表真实学习途径或全部信息。",
    },
    {
      id: "interp-02",
      icon: Music,
      title: "业余生活与兴趣偏好",
      summary: "在专业技术之外，音乐艺术（特别是指弹吉他乐理）与羽毛球运动是主要的模拟关注兴趣点。",
      details: "模拟关注样本中包含了吉他乐理与羽毛球战术类博主，展示了在业余时间对乐器演奏与体育运动的偏好。",
      evidenceIds: ["ev-metric-music-1", "ev-follow-music-01", "ev-follow-sports-01"],
      disclaimer: "这仅反映模拟样本的分类分布，不代表线下实际参与频次或完整生活结构。",
    },
    {
      id: "interp-03",
      icon: Clock,
      title: "模拟互动与时间特征",
      summary: "模拟动态样本主要集中在晚间 20:00 ~ 23:00 时段，内容多为技术排查记录与学习笔记。",
      details: "模拟动态文本主要呈现为问题调试、工具踩坑备忘及日常学习笔记，活跃时段多为晚间休息与自习时间。",
      evidenceIds: ["ev-metric-time-01", "ev-dynamic-sample-01", "ev-dynamic-sample-02"],
      disclaimer: "这仅基于模拟文本样本与时间戳观察，不作任何个人作息或性格定性。",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Evidence Drawer Modal */}
      <EvidenceDrawer
        evidence={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
      />

      {/* 1. Top Overview Card */}
      <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
        <CardHeader className="p-5 sm:p-7 pb-3 bg-gradient-to-br from-cream-100/90 via-card to-sage-50/40 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-xs">
                  演示报告
                </span>
                <span className="text-xs text-muted-foreground">基于模拟数据快照生成</span>
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground pt-1">
                {MOCK_ANALYSIS_RESULT.targetName} 的内容偏好概览
              </CardTitle>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream-200 text-foreground text-xs font-medium border border-border/60 self-start sm:self-auto">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span>数据已本地锁定</span>
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-7 space-y-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-sage-50/80 border border-sage-200/80 text-xs sm:text-sm text-sage-900 leading-relaxed font-medium">
            {MOCK_ANALYSIS_RESULT.summary}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            以下内容基于示例快照中的 99 条模拟关注样本、18 条模拟动态样本以及示例自述信息生成。
          </p>
        </CardContent>
      </Card>

      {/* 2. Main Content Themes (主要关注主题分布) - Driven strictly by MOCK_CATEGORY_METRICS */}
      <Card className="border-border/80 bg-card rounded-3xl p-5 sm:p-7 space-y-5 shadow-warm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <Compass className="w-4 h-4 text-primary" />
              <span>主要关注主题分布（示例）</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              基于示例快照中的 99 条模拟关注样本分类聚合
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-xl text-xs gap-1.5 self-start sm:self-auto">
            <Link href="/entities">
              <span>查看示例关注博主</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>

        {/* Visual Topic Ratio Strip - Strictly from MOCK_CATEGORY_METRICS */}
        <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden flex shadow-inner">
          {MOCK_CATEGORY_METRICS.map((metric) => (
            <div
              key={metric.topicId}
              style={{
                width: `${metric.percentage}%`,
                backgroundColor: metric.color,
              }}
              title={`${metric.topicName}: ${metric.percentage}% (${metric.count} 条)`}
            />
          ))}
        </div>

        {/* Topic Highlights Cards - Strictly from MOCK_CATEGORY_METRICS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          {MOCK_CATEGORY_METRICS.map((metric) => (
            <div
              key={metric.topicId}
              className="p-3.5 rounded-2xl bg-cream-100/90 border border-border/70 space-y-1 hover:border-border transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: metric.color }}
                />
                <span className="text-xs font-bold text-foreground truncate">{metric.topicName}</span>
              </div>
              <div className="flex items-baseline justify-between pt-0.5">
                <span className="text-base sm:text-lg font-extrabold text-foreground">{metric.percentage}%</span>
                <span className="text-[11px] text-muted-foreground">{metric.count} 条模拟样本</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 3. Analysis Interpretations (分析解读) */}
      <div className="space-y-4">
        <div className="px-1">
          <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>深度内容解读（示例）</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            结合示例自述与模拟数据样本作出的理性解读，每项结论均可溯源
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {friendlyInterpretations.map((item) => {
            const Icon = item.icon;
            const isExpanded = Boolean(expandedEvidenceInterpId[item.id]);

            return (
              <Card
                key={item.id}
                className="border-border/80 bg-card rounded-3xl p-5 sm:p-6 space-y-3.5 hover:shadow-warm transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-foreground">{item.title}</h3>
                  </div>

                  {/* Single unified button for evidence */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => toggleEvidenceExpanded(item.id)}
                    className="h-7 px-3 rounded-xl text-xs gap-1.5 bg-cream-100 hover:bg-muted font-medium cursor-pointer self-start sm:self-auto"
                    aria-expanded={isExpanded}
                    aria-label={`查看 ${item.title} 的参考依据 (${item.evidenceIds.length} 项)`}
                  >
                    <FileCheck className="w-3.5 h-3.5 text-primary" />
                    <span>查看参考依据 ({item.evidenceIds.length} 项)</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>
                </div>

                <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                  {item.details}
                </p>

                {/* Collapsible Natural Evidence Badges */}
                {isExpanded && (
                  <div className="p-3.5 rounded-2xl bg-cream-200/90 border border-border/70 space-y-2 animate-in fade-in duration-200">
                    <span className="text-[11px] font-semibold text-muted-foreground block">
                      支撑此结论的模拟依据（点击查看详情）：
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {item.evidenceIds.map((evId) => (
                        <button
                          key={evId}
                          type="button"
                          onClick={() => handleOpenEvidence(evId)}
                          className="px-2.5 py-1 rounded-xl bg-card text-foreground border border-border/80 text-xs hover:border-primary hover:bg-muted/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          aria-label={`查看依据: ${getEvidenceNaturalName(evId)}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span>{getEvidenceNaturalName(evId)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Friendly Note */}
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40 text-[11px] text-muted-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span>{item.disclaimer}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 4. Safety & Privacy Assurance Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-cream-200/80 border border-border/70 text-xs text-muted-foreground space-y-1.5">
        <div className="font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>合规与表达边界说明</span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          本报告仅基于示例快照中的模拟内容主题与自述方向进行有限解释，严格禁止对个人性格、心理状态、身体健康、政治、宗教或敏感个人隐私进行任何未经科学验证的定性推断。
        </p>
      </div>
    </div>
  );
}
