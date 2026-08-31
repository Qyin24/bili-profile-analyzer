import * as React from "react";
import { AiFinding } from "@/types/ai-analysis";
import {
  ReportEvidence,
  ContentItemEvidence,
  BehaviorTopicMatrixItem,
  TemporalPatternItem,
} from "@/types/processing";
import {
  Sparkles,
  Link2,
  Video,
  Bookmark,
  ThumbsUp,
  Clock,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";

import { SourceSamplingMetadata } from "@/types/processing";

interface FindingCardProps {
  finding: AiFinding;
  index: number;
  evidenceMap: Record<string, ReportEvidence>;
  contentItemsMap: Record<string, ContentItemEvidence>;
  behaviorTopicMatrix?: BehaviorTopicMatrixItem[];
  temporalPatterns?: TemporalPatternItem[];
  samplingMetadata?: SourceSamplingMetadata[];
  onSelectEvidence: (ev: ReportEvidence) => void;
  onOpenAllEvidence: (evidenceIds: string[]) => void;
}

export function FindingCard({
  finding,
  index,
  evidenceMap,
  contentItemsMap,
  behaviorTopicMatrix = [],
  temporalPatterns = [],
  samplingMetadata = [],
  onSelectEvidence,
  onOpenAllEvidence,
}: FindingCardProps) {
  // 1. Parse Finding title and body
  const rawText = finding.statement.trim();
  const firstLineEnd = rawText.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? rawText : rawText.slice(0, firstLineEnd).trim();

  let title = `洞察 ${String(index + 1).padStart(2, "0")}`;
  let body = rawText;

  const titleMatch = firstLine.match(
    /^(?:###\s*|[#【]\s*|第[一二三四五六七八九十\d]+章[：:\s]\s*)([^\n】#]+)[】]?$/
  );
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
    body = firstLineEnd === -1 ? "" : rawText.slice(firstLineEnd).trim();
  } else if (firstLine.length < 50 && firstLine.endsWith("】")) {
    title = firstLine.replace(/^[【]/, "").replace(/[】]$/, "").trim();
    body = firstLineEnd === -1 ? "" : rawText.slice(firstLineEnd).trim();
  }

  // 2. Identify referenced content items
  const validEvidenceIds = (finding.evidenceIds || []).filter(
    (id) => evidenceMap[id] || contentItemsMap[id]
  );
  const referencedContentItems: ContentItemEvidence[] = [];
  for (const id of validEvidenceIds) {
    if (contentItemsMap[id]) {
      referencedContentItems.push(contentItemsMap[id]);
    }
  }

  // 3. Determine behavioral sources in this finding
  const hasContent = referencedContentItems.some((c) => c.sourceType === "CONTENT");
  const hasFavorite = referencedContentItems.some((c) => c.sourceType === "FAVORITE");
  const hasLike = referencedContentItems.some((c) => c.sourceType === "LIKE");

  // 4. Match topic metadata for temporal & cross-source strength
  const matchedTopics = referencedContentItems.flatMap((c) =>
    (c.matchedTopics || []).map((m) => m.topicId)
  );
  const uniqueTopicIds = Array.from(new Set(matchedTopics));

  const relevantMatrixItem = behaviorTopicMatrix.find((m) =>
    uniqueTopicIds.includes(m.topicId)
  );
  const relevantTemporalItem = temporalPatterns.find((t) =>
    uniqueTopicIds.includes(t.topicId)
  );

  // 5. Evidence Strength Badge
  let strengthLabel = "中等证据";
  let strengthColor = "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
  if (
    (hasContent && (hasFavorite || hasLike)) ||
    relevantMatrixItem?.crossSourcePresence?.level === "HIGH_CROSS_SOURCE" ||
    (hasContent && referencedContentItems.length >= 3)
  ) {
    strengthLabel = "强证据";
    strengthColor = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
  } else if (
    referencedContentItems.length <= 1 &&
    !hasContent &&
    (hasLike || hasFavorite)
  ) {
    strengthLabel = "弱信号";
    strengthColor = "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20";
  }

  // 6. Temporal badge
  let temporalLabel = "";
  if (relevantTemporalItem?.pattern === "LONG_TERM_STABLE" && relevantTemporalItem.timeSpanDays > 0) {
    temporalLabel = `长期稳定 · ${relevantTemporalItem.timeSpanDays}天`;
  } else if (relevantTemporalItem?.pattern === "RECENT_ONLY" || relevantTemporalItem?.pattern === "RECENT_RISING") {
    temporalLabel = "近期信号";
  } else if (hasContent && !hasFavorite && !hasLike) {
    temporalLabel = "创作实践";
  }

  // 7. Extract lead conclusion (first paragraph of body)
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const leadParagraph = paragraphs.length > 0 ? paragraphs[0] : body;
  const remainingParagraphs = paragraphs.length > 1 ? paragraphs.slice(1) : [];

  // Key evidence snippets (top 2~3)
  const topEvidenceSnippets = referencedContentItems.slice(0, 2);

  return (
    <article className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-6 transition-all hover:border-primary/30">
      {/* Header: Number, Title & Badges */}
      <div className="space-y-3 pb-4 border-b border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-primary/15 text-primary text-xs font-mono font-bold flex items-center justify-center">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${strengthColor}`}>
              {strengthLabel}
            </span>
            {temporalLabel && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border/50 flex items-center gap-1">
                <Clock className="w-3 h-3 text-primary" />
                <span>{temporalLabel}</span>
              </span>
            )}
          </div>

          {/* Behavioral Sources Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasContent && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                <Video className="w-3 h-3" />
                <span>主动创作</span>
              </span>
            )}
            {hasFavorite && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                <Bookmark className="w-3 h-3" />
                <span>价值收藏</span>
              </span>
            )}
            {hasLike && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                <ThumbsUp className="w-3 h-3" />
                <span>近期互动</span>
              </span>
            )}
          </div>
        </div>

        <h3 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
          {title}
        </h3>
      </div>

      {/* Core Lead Conclusion Highlight */}
      <div className="p-4 sm:p-5 rounded-2xl bg-secondary/50 border border-border/70 text-foreground text-sm sm:text-[15px] leading-relaxed space-y-1.5 font-medium">
        <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
          <Sparkles className="w-3.5 h-3.5" />
          <span>核心洞察结论</span>
        </div>
        <p>{leadParagraph}</p>
      </div>

      {/* Remaining Narrative Paragraphs */}
      {remainingParagraphs.length > 0 && (
        <div className="text-foreground/90 leading-relaxed text-sm sm:text-[14px] space-y-3 font-normal">
          {remainingParagraphs.map((para, pIdx) => (
            <p key={pIdx} className="whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      )}

      {/* Sampling Limitation Note within card */}
      {(hasFavorite || hasLike) && (() => {
        const favMeta = samplingMetadata.find((s) => s.sourceType === "FAVORITE");
        const likMeta = samplingMetadata.find((s) => s.sourceType === "LIKE");
        const favCollected = favMeta?.collectedCount ?? 20;
        const favTotal = favMeta?.platformTotalCount;
        const likeCollected = likMeta?.collectedCount ?? 20;
        const favDesc = favTotal != null
          ? `收藏基于最近 ${favCollected} 条样本（平台共 ${favTotal} 条）`
          : `收藏基于近期 ${favCollected} 条样本`;
        const likeDesc = `点赞基于最新 ${likeCollected} 条窗口`;
        const noteText = hasFavorite && hasLike
          ? `此洞察包含有限样本证据：${favDesc}，${likeDesc}，不能完全等价于全部历史累积。`
          : hasFavorite
          ? `此洞察包含有限样本证据：${favDesc}，反映近期沉淀倾向。`
          : `此洞察包含有限样本证据：${likeDesc}，反映近期互动偏好。`;
        return (
          <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{noteText}</span>
          </div>
        );
      })()}

      {/* Key Evidence Snippets */}
      {topEvidenceSnippets.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-primary" />
              <span>关键行为证据（{referencedContentItems.length} 条相关）:</span>
            </span>
            {validEvidenceIds.length > 2 && (
              <button
                type="button"
                onClick={() => onOpenAllEvidence(validEvidenceIds)}
                className="text-primary hover:underline inline-flex items-center gap-0.5 cursor-pointer font-medium"
              >
                <span>查看全部 {validEvidenceIds.length} 条证据</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {topEvidenceSnippets.map((item) => {
              const ev = evidenceMap[item.evidenceId];
              return (
                <div
                  key={item.evidenceId}
                  onClick={() => ev && onSelectEvidence(ev)}
                  className="p-3 rounded-2xl bg-background/80 hover:bg-background border border-border/70 hover:border-primary/40 cursor-pointer transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground">
                      {item.sourceType === "CONTENT"
                        ? "主动投稿"
                        : item.sourceType === "FAVORITE"
                        ? "公开收藏"
                        : "即时点赞"}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {item.interactionAt ? item.interactionAt.slice(0, 10) : item.publishedAt ? item.publishedAt.slice(0, 10) : ""}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-foreground line-clamp-1">
                    {item.title}
                  </h4>
                  {item.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}
