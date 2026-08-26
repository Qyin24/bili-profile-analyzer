"use client";

import * as React from "react";
import { ReportEvidenceSnapshot } from "@/types/analysis";
import {
  X,
  FileCheck,
  Calendar,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface EvidenceDrawerProps {
  evidence: ReportEvidenceSnapshot | null;
  onClose: () => void;
}

export function EvidenceDrawer({ evidence, onClose }: EvidenceDrawerProps) {
  const [showTechnicalDetails, setShowTechnicalDetails] = React.useState(false);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (evidence) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [evidence, onClose]);

  if (!evidence) return null;

  const getFriendlySourceName = (type: string) => {
    switch (type) {
      case "SELF_REPORTED":
        return "示例自述目标说明";
      case "STATISTICAL_METRIC":
        return "模拟内容主题统计";
      case "FOLLOW_RECORD":
        return "模拟关注博主样本";
      case "CONTENT_SAMPLE":
        return "模拟动态摘录";
      default:
        return "模拟数据快照";
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-drawer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-card border border-border shadow-warm-lg overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-border/40 flex items-center justify-between bg-cream-100/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 id="evidence-drawer-title" className="text-base font-bold text-foreground">
                参考依据详情
              </h2>
              <p className="text-xs text-muted-foreground">{getFriendlySourceName(evidence.sourceType)}</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="关闭参考依据详情"
            className="w-8 h-8 p-0 rounded-full hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Title & Type */}
          <div className="space-y-1.5">
            <span className="inline-block px-2.5 py-0.5 rounded-md bg-sage-100 text-sage-900 text-xs font-semibold">
              {getFriendlySourceName(evidence.sourceType)}
            </span>
            <h3 className="text-sm sm:text-base font-bold text-foreground">{evidence.title}</h3>
          </div>

          {/* Excerpt / Value Box */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground block">内容摘录与数据值:</span>
            <div className="p-4 rounded-2xl bg-cream-200/90 border border-border/80 text-xs sm:text-sm text-foreground leading-relaxed">
              {evidence.excerptOrMetricValue}
            </div>
          </div>

          {/* Generation and Lock Status */}
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1">
            <div className="p-2.5 rounded-xl bg-muted/40 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>生成时间: {evidence.createdAt}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-muted/40 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-primary" />
              <span>已锁定最小化快照</span>
            </div>
          </div>

          {/* Collapsible Technical Details (evidenceId, hash, taskId) */}
          <div className="pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((v) => !v)}
              className="flex items-center justify-between w-full text-[11px] text-muted-foreground hover:text-foreground py-1 cursor-pointer transition-colors"
              aria-expanded={showTechnicalDetails}
            >
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                <span>技术追溯详情 (开发审计)</span>
              </span>
              {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showTechnicalDetails && (
              <div className="mt-2 p-3 rounded-2xl bg-muted/50 border border-border/60 text-[11px] font-mono space-y-1 text-muted-foreground animate-in fade-in duration-200">
                <p>快照编号 (ID): {evidence.id}</p>
                <p>实体字段 (evidenceId): {evidence.evidenceId}</p>
                <p>任务编号 (taskId): {evidence.taskId}</p>
                <p className="truncate">内容哈希: {evidence.contentHash}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/40 bg-muted/20 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            <span>示例依据已与报告锁定保存</span>
          </span>
          <Button size="sm" onClick={onClose} className="rounded-xl text-xs h-8 px-4">
            知道了
          </Button>
        </div>
      </div>
    </div>
  );
}
