"use client";

import * as React from "react";
import { ReportEvidence, ContentItemEvidence } from "@/types/processing";
import {
  X,
  User,
  Tag,
  Clock,
  CheckCircle2,
  FileText,
  Video,
  Bookmark,
  ThumbsUp,
  Link2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface EvidenceModalProps {
  evidence: ReportEvidence | null;
  evidenceListIds?: string[] | null;
  evidenceMap: Record<string, ReportEvidence>;
  contentItemsMap: Record<string, ContentItemEvidence>;
  onClose: () => void;
  onSelectEvidence: (ev: ReportEvidence) => void;
}

export function EvidenceModal({
  evidence,
  evidenceListIds,
  evidenceMap,
  contentItemsMap,
  onClose,
  onSelectEvidence,
}: EvidenceModalProps) {
  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!evidence && (!evidenceListIds || evidenceListIds.length === 0)) return null;

  // Mode 1: Multi-Evidence List Drawer (when evidenceListIds is present and evidence is null)
  if (!evidence && evidenceListIds && evidenceListIds.length > 0) {
    const items = evidenceListIds
      .map((id) => ({
        ev: evidenceMap[id],
        content: contentItemsMap[id],
      }))
      .filter((i) => i.ev || i.content);

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="bg-card w-full max-w-2xl rounded-3xl p-6 sm:p-7 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <div className="space-y-0.5">
              <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                <span>支撑行为证据清单（共 {items.length} 项）</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                点击任意条目可查看底层原始快照与分类匹配明细
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* List Body */}
          <div className="overflow-y-auto space-y-2.5 pr-1 py-1 flex-1">
            {items.map(({ ev, content }, idx) => {
              if (content) {
                return (
                  <div
                    key={content.evidenceId}
                    onClick={() => ev && onSelectEvidence(ev)}
                    className="p-3.5 rounded-2xl bg-background/80 hover:bg-background border border-border/70 hover:border-primary/40 cursor-pointer transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-muted text-muted-foreground font-mono text-[10px] flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary">
                          {content.sourceType === "CONTENT"
                            ? "主动创作"
                            : content.sourceType === "FAVORITE"
                            ? "价值收藏"
                            : "即时点赞"}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {content.interactionAt?.slice(0, 10) || content.publishedAt?.slice(0, 10) || ""}
                      </span>
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-foreground">
                      {content.title}
                    </h4>

                    {content.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {content.description}
                      </p>
                    )}

                    {content.matchedTopics && content.matchedTopics.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {content.matchedTopics.map((m, mIdx) => (
                          <span
                            key={mIdx}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-foreground font-medium border border-border/40"
                          >
                            {m.topicName} ({m.matchedTerm})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (ev) {
                return (
                  <div
                    key={ev.id}
                    onClick={() => onSelectEvidence(ev)}
                    className="p-3.5 rounded-2xl bg-background/80 hover:bg-background border border-border/70 hover:border-primary/40 cursor-pointer transition-all space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                      <span>{ev.label}</span>
                      <span className="font-mono text-primary font-bold">
                        {String(ev.value)} {ev.unit || ""}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      证据 ID: {ev.id}
                    </p>
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* Footer */}
          <div className="pt-2 text-right border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-xl text-xs cursor-pointer"
            >
              关闭
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Mode 2: Single Evidence Detail Modal
  if (!evidence) return null;

  const contentItem = contentItemsMap[evidence.id];

  const getSourceBadge = () => {
    if (!contentItem) {
      return {
        label: evidence.type === "PROFILE_ITEM" ? "主页公开资料" : "统计指标",
        color: "bg-muted text-muted-foreground border-border",
        behaviorMeaning: "公开可观测的基础数据指标与特征。",
        icon: Sparkles,
      };
    }
    switch (contentItem.sourceType) {
      case "CONTENT":
        return {
          label: "主动投稿 · 动手实践",
          color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
          behaviorMeaning: "此行为表明用户主动制作、调试并公开发布了该内容，具备最高的主动实践属性。",
          icon: Video,
        };
      case "FAVORITE":
        return {
          label: `价值收藏 · 长期沉淀${contentItem.metadata?.folderName ? ` (${contentItem.metadata.folderName})` : ""}`,
          color: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
          behaviorMeaning: "此行为表明用户主动将该内容保存至个人收藏夹，反映其对该内容的长期参考或审美认可。",
          icon: Bookmark,
        };
      case "LIKE":
        return {
          label: "即时点赞 · 近期趣味",
          color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
          behaviorMeaning: "此行为表明用户在近期浏览中进行了即时点赞互动，反映其轻量消费与即时正向趣味。",
          icon: ThumbsUp,
        };
      default:
        return {
          label: "公开内容",
          color: "bg-primary/15 text-primary border-primary/30",
          behaviorMeaning: "公开主页可见的内容样本。",
          icon: FileText,
        };
    }
  };

  const badge = getSourceBadge();
  const BadgeIcon = badge.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-card w-full max-w-lg rounded-3xl p-6 sm:p-7 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-border/50">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.color}`}>
                <BadgeIcon className="w-3.5 h-3.5" />
                <span>{badge.label}</span>
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {evidence.id}
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground pt-0.5">
              {contentItem ? contentItem.title : evidence.label}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {contentItem ? (
          <div className="space-y-3.5 text-xs">
            {/* Behavior Meaning Banner */}
            <div className="p-3 rounded-2xl bg-secondary/60 border border-border/60 text-muted-foreground leading-relaxed text-[11px]">
              <strong className="text-foreground">行为意义：</strong>
              {badge.behaviorMeaning}
            </div>

            {/* Author / UP主 */}
            {contentItem.authorName && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <User className="w-3.5 h-3.5 text-primary" />
                <span>UP主 / 发布者:</span>
                <span className="font-semibold text-foreground">{contentItem.authorName}</span>
              </div>
            )}

            {/* Description */}
            {contentItem.description && (
              <div className="p-3.5 rounded-2xl bg-background/80 border border-border/60 space-y-1">
                <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span>内容简介 / 制作细节</span>
                </div>
                <p className="text-foreground leading-relaxed whitespace-pre-line">
                  {contentItem.description}
                </p>
              </div>
            )}

            {/* Tags */}
            {contentItem.tags && contentItem.tags.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-primary" />
                  <span>内容标签</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contentItem.tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md text-[11px] bg-muted text-muted-foreground border border-border/50"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Matched Topics by Rule Engine */}
            {contentItem.matchedTopics && contentItem.matchedTopics.length > 0 && (
              <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 space-y-1.5">
                <div className="text-[11px] font-semibold text-primary flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>规则引擎命中分类</span>
                </div>
                <div className="space-y-1">
                  {contentItem.matchedTopics.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-foreground">{m.topicName}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        命中词: &quot;{m.matchedTerm}&quot; ({m.matchType})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div className="space-y-0.5 pt-1 text-[11px] text-muted-foreground">
              {contentItem.interactionAt && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-primary" />
                  <span>互动/收藏时间: {contentItem.interactionAt}</span>
                </div>
              )}
              {contentItem.publishedAt && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>视频发布时间: {contentItem.publishedAt}</span>
                </div>
              )}
              {contentItem.observedAt && !contentItem.interactionAt && !contentItem.publishedAt && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>采集观测时间: {contentItem.observedAt}</span>
                </div>
              )}
            </div>
          </div>
        ) : evidence.type === "PROFILE_ITEM" ? (
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-background/80 border border-border/60 space-y-1">
              <span className="text-[11px] text-muted-foreground font-semibold">主页描述 / 空间签名</span>
              <p className="text-foreground leading-relaxed">{String(evidence.value)}</p>
            </div>
            {evidence.sourceKey && (
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40 text-[11px] text-muted-foreground font-mono">
                来源标识: {evidence.sourceKey}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="p-3.5 rounded-xl bg-background/80 border border-border/60 space-y-1">
              <span className="text-[11px] text-muted-foreground font-semibold">指标取值</span>
              <p className="font-mono text-sm font-bold text-primary">
                {String(evidence.value)} {evidence.unit || ""}
              </p>
            </div>
            {evidence.sourceKey && (
              <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-[11px] text-muted-foreground font-mono">
                来源标识: {evidence.sourceKey}
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="pt-2 text-right">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-xl text-xs cursor-pointer"
          >
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
