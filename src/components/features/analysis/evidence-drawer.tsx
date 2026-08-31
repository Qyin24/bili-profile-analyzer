"use client";

import * as React from "react";
import { ReportEvidenceSnapshot } from "@/types/analysis";
import { X, ShieldCheck, Clock, FileText, Database, Bookmark, BarChart2 } from "lucide-react";

interface EvidenceDrawerProps {
  evidence: ReportEvidenceSnapshot | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EvidenceDrawer({ evidence, isOpen, onClose }: EvidenceDrawerProps) {
  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !evidence) return null;

  const getSourceTypeInfo = (sourceType: ReportEvidenceSnapshot["sourceType"]) => {
    switch (sourceType) {
      case "SELF_REPORTED":
        return {
          label: "你补充的信息",
          icon: Bookmark,
          badgeColor: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
          origin: "由你在本次分析开始前主动填写并授权的自述快照。",
          limitation: "仅代表你填写时的个人说明，不反映历史长期动态。",
        };
      case "STATISTICAL_METRIC":
        return {
          label: "公开数据统计指标",
          icon: BarChart2,
          badgeColor: "bg-primary/15 text-primary border-primary/30",
          origin: "基于公开可见样本，由统计程序直接汇总计算得出。",
          limitation: "受限于公开展示的样本数量，可能无法覆盖所有历史互动。",
        };
      case "FOLLOW_RECORD":
        return {
          label: "公开关注内容样本",
          icon: Database,
          badgeColor: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
          origin: "公开主页可见的关注账号列表样本及分类映射。",
          limitation: "关注仅代表兴趣关注倾向，不能等同于深度参与或职业身份。",
        };
      case "CONTENT_SAMPLE":
        return {
          label: "公开动态或投稿样本",
          icon: FileText,
          badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
          origin: "公开主页展示的动态或投稿内容文本与标签样本。",
          limitation: "发布内容受时间周期与发布意愿影响，具有一定的时效性。",
        };
      default:
        return {
          label: "参考依据",
          icon: ShieldCheck,
          badgeColor: "bg-muted text-muted-foreground border-border",
          origin: "公开页面样本或主动补充信息。",
          limitation: "仅作为有限解读参考。",
        };
    }
  };

  const sourceInfo = getSourceTypeInfo(evidence.sourceType);
  const BadgeIcon = sourceInfo.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-drawer-title"
        className="bg-card w-full max-w-lg rounded-3xl p-6 sm:p-7 border border-border shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-border/50">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sourceInfo.badgeColor}`}>
                <BadgeIcon className="w-3.5 h-3.5" />
                <span>{sourceInfo.label}</span>
              </span>
            </div>
            <h3 id="evidence-drawer-title" className="text-base sm:text-lg font-bold text-foreground pt-1">
              {evidence.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭参考依据详情"
            className="p-2 rounded-xl bg-background hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. 参考了什么内容 */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span>参考了什么内容</span>
          </div>
          <div className="p-4 rounded-2xl bg-background/90 border border-border/70 text-xs font-medium text-foreground leading-relaxed shadow-inner">
            {evidence.excerptOrMetricValue}
          </div>
        </div>

        {/* 2. 这条信息来自哪里 & 3. 为什么只能作为有限解释 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-background/60 border border-border/60 space-y-1">
            <span className="font-bold text-foreground text-[11px] block">这条信息来自哪里</span>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {sourceInfo.origin}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-background/60 border border-border/60 space-y-1">
            <span className="font-bold text-foreground text-[11px] block">为什么只能作为有限解释</span>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {sourceInfo.limitation}
            </p>
          </div>
        </div>

        {/* Footer timestamp & info */}
        <div className="p-3 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-primary" />
            <span>记录生成时间: {evidence.createdAt}</span>
          </div>
          <span className="text-[10px]">受控分析快照</span>
        </div>
      </div>
    </div>
  );
}
