"use client";

import * as React from "react";
import {
  AnalysisResultMock,
  ReportEvidenceSnapshot,
} from "@/types/analysis";
import { MOCK_ANALYSIS_RESULT } from "@/lib/mock-data";
import { EvidenceDrawer } from "./evidence-drawer";
import { MockQAChat } from "./mock-qa-chat";
import {
  Sparkles,
  Bookmark,
  BarChart3,
  Brain,
  Link2,
  FileCheck,
  Info,
  ShieldCheck,
} from "lucide-react";

interface ReportViewerProps {
  result?: AnalysisResultMock;
  customTargetName?: string;
  customUid?: string;
}

export function ReportViewer({
  result = MOCK_ANALYSIS_RESULT,
  customTargetName,
  customUid,
}: ReportViewerProps) {
  const [selectedEvidence, setSelectedEvidence] = React.useState<ReportEvidenceSnapshot | null>(null);
  const [isEvidenceOpen, setIsEvidenceOpen] = React.useState(false);

  const handleOpenEvidenceById = (evId: string) => {
    const found = result.evidenceSnapshots.find((e) => e.id === evId || e.evidenceId === evId);
    if (found) {
      setSelectedEvidence(found);
      setIsEvidenceOpen(true);
    }
  };

  const handleOpenEvidence = (ev: ReportEvidenceSnapshot) => {
    setSelectedEvidence(ev);
    setIsEvidenceOpen(true);
  };

  const displayTargetName = customTargetName || result.targetName;
  const displayUid = customUid || result.platformUid;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Banner & Disclaimer */}
      <div className="bg-primary/10 border border-primary/20 rounded-3xl p-5 sm:p-6 text-xs text-foreground/90 space-y-2 shadow-xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-bold text-sm text-primary">
            <Sparkles className="w-4 h-4" />
            <span>你的内容画像</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/15 text-primary border border-primary/25">
            本地演示报告
          </span>
        </div>
        <p className="text-muted-foreground leading-relaxed text-xs sm:text-[13px]">
          这是一份基于本次分析快照的有限解读，不代表对一个人的确定判断。所有分析均基于公开可见信息与你主动补充的内容。
        </p>
      </div>

      {/* 2. Main Report Container */}
      <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-8">
        {/* Profile Overview Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">分析对象</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                {result.outcome === "FULL" ? "信息较完整" : "信息不完整"}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {displayTargetName}
            </h2>
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <span>UID: <strong className="font-mono text-foreground font-semibold">{displayUid}</strong></span>
              <span>•</span>
              <span>生成时间: {result.generatedAt}</span>
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/50 text-xs self-start sm:self-auto text-left sm:text-right space-y-0.5">
            <div className="text-[11px] text-muted-foreground font-semibold">分析样本概况</div>
            <div className="font-bold text-foreground text-xs sm:text-sm">
              {result.metricsSnapshot.totalSampleCount} 条公开关注样本 • 18 条公开动态样本
            </div>
          </div>
        </div>

        {/* Section 0: 综合摘要 */}
        <div className="p-4 sm:p-5 rounded-2xl bg-secondary/50 border border-border/60 text-xs sm:text-sm leading-relaxed text-foreground space-y-1.5 shadow-inner">
          <div className="font-bold text-xs text-secondary-foreground flex items-center gap-1.5">
            <FileCheck className="w-4 h-4 text-primary" />
            <span>报告总览摘要</span>
          </div>
          <p className="text-muted-foreground leading-relaxed text-xs sm:text-sm">
            {result.summary}
          </p>
        </div>

        {/* Section 1: 你关心的方向 */}
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-foreground">
              <div className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
                <Bookmark className="w-4 h-4" />
              </div>
              <span>你关心的方向</span>
            </div>
            <span className="text-[11px] text-muted-foreground">你主动补充的信息</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-background/70 border border-border/60 space-y-1.5">
              <span className="font-bold text-muted-foreground text-[11px]">当前主要目标</span>
              <p className="font-medium text-foreground text-xs sm:text-sm">{result.selfProvidedSnapshot.currentGoals || "暂无"}</p>
            </div>

            <div className="p-4 rounded-2xl bg-background/70 border border-border/60 space-y-1.5">
              <span className="font-bold text-muted-foreground text-[11px]">专业 / 探索方向</span>
              <p className="font-medium text-foreground text-xs sm:text-sm">{result.selfProvidedSnapshot.careerOrMajor || "暂无"}</p>
            </div>

            <div className="p-4 rounded-2xl bg-background/70 border border-border/60 space-y-1.5 sm:col-span-2">
              <span className="font-bold text-muted-foreground text-[11px]">近期重点学习</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {result.selfProvidedSnapshot.learningDirections?.map((dir) => (
                  <span
                    key={dir}
                    className="px-3 py-1 rounded-xl text-xs bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 font-medium"
                  >
                    {dir}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-background/70 border border-border/60 space-y-1.5 sm:col-span-2">
              <span className="font-bold text-muted-foreground text-[11px]">兴趣标签</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {result.selfProvidedSnapshot.interestTags?.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-xl text-xs bg-secondary text-secondary-foreground border border-border/50 font-medium"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: 主要内容主题 */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-foreground">
              <div className="w-7 h-7 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span>主要内容主题</span>
            </div>
            <span className="text-[11px] text-muted-foreground">公开数据统计与分布</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {result.publicDataObservations.map((obs) => (
              <div
                key={obs.title}
                className="p-4 rounded-2xl bg-background/70 border border-border/60 space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <span className="font-bold text-foreground text-xs sm:text-sm">{obs.title}</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{obs.description}</p>
                </div>
                <div className="pt-2 border-t border-border/40 font-mono font-bold text-primary text-xs">
                  {obs.statValue}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: 分析解读 */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-foreground">
              <div className="w-7 h-7 rounded-xl bg-purple-500/15 text-purple-600 flex items-center justify-center">
                <Brain className="w-4 h-4" />
              </div>
              <span>分析解读</span>
            </div>
            <span className="text-[11px] text-muted-foreground">基于明确参考依据</span>
          </div>

          <div className="space-y-3.5">
            {result.aiClaims.map((claim) => (
              <div
                key={claim.id}
                className="p-5 rounded-2xl bg-background/80 border border-border/70 space-y-3 text-xs"
              >
                {/* Dimension & Tag */}
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25">
                    {claim.dimension}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Info className="w-3 h-3 text-muted-foreground" />
                    <span>分析解读 · 可能存在偏差</span>
                  </span>
                </div>

                {/* Claim Statement */}
                <p className="text-foreground leading-relaxed font-medium text-xs sm:text-sm">
                  {claim.claim}
                </p>

                {/* Evidence Linkage */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Link2 className="w-3.5 h-3.5 text-primary" />
                    <span>参考依据（点击查看说明）：</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {claim.evidenceIds.map((evId) => {
                      const ev = result.evidenceSnapshots.find((e) => e.id === evId || e.evidenceId === evId);
                      const displayTitle = ev?.title || "查看参考依据";
                      return (
                        <button
                          key={evId}
                          type="button"
                          onClick={() => handleOpenEvidenceById(evId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors shadow-2xs font-medium cursor-pointer"
                        >
                          <span>🔗</span>
                          <span>{displayTitle}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Scope & Uncertainty in natural phrasing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
                  <div className="p-3 rounded-xl bg-background/50 border border-border/40 space-y-0.5">
                    <span className="font-semibold text-muted-foreground text-[11px]">适用范围</span>
                    <p className="text-muted-foreground leading-relaxed">{claim.scope}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-background/50 border border-border/40 space-y-0.5">
                    <span className="font-semibold text-muted-foreground text-[11px]">可能存在的偏差</span>
                    <p className="text-amber-800 dark:text-amber-400 leading-relaxed">
                      {claim.uncertainty}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: 参考依据总览 (All Evidence Snapshots) */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-foreground">
              <div className="w-7 h-7 rounded-xl bg-sage-100 text-sage-900 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span>参考依据与说明</span>
            </div>
            <span className="text-[11px] text-muted-foreground">共 {result.evidenceSnapshots.length} 项快照依据</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.evidenceSnapshots.map((ev) => (
              <div
                key={ev.id || ev.evidenceId}
                onClick={() => handleOpenEvidence(ev)}
                className="p-4 rounded-2xl bg-card border border-border/70 hover:border-primary/50 transition-all cursor-pointer space-y-2 shadow-2xs hover:shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs sm:text-sm text-foreground">
                    {ev.title}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    点击查看详情
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {ev.excerptOrMetricValue}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Ask about this report (针对这份报告问一问) */}
      <MockQAChat
        evidenceSnapshots={result.evidenceSnapshots}
        onOpenEvidence={handleOpenEvidence}
      />

      {/* Accessible Evidence Drawer Modal */}
      <EvidenceDrawer
        evidence={selectedEvidence}
        isOpen={isEvidenceOpen}
        onClose={() => setIsEvidenceOpen(false)}
      />
    </div>
  );
}
