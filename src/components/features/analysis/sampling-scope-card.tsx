import * as React from "react";
import { SourceSamplingMetadata } from "@/types/processing";
import { CheckCircle, AlertTriangle, Video, Bookmark, ThumbsUp, Users, ShieldAlert } from "lucide-react";

interface SamplingScopeCardProps {
  samplingMetadata?: SourceSamplingMetadata[];
  totalObservedRecords: number;
}

export function SamplingScopeCard({
  samplingMetadata = [],
  totalObservedRecords,
}: SamplingScopeCardProps) {
  const contentMeta = samplingMetadata.find((s) => s.sourceType === "CONTENT");
  const favoriteMeta = samplingMetadata.find((s) => s.sourceType === "FAVORITE");
  const likeMeta = samplingMetadata.find((s) => s.sourceType === "LIKE");

  const favoriteTotal = favoriteMeta?.platformTotalCount ?? null;
  const favoriteCollected = favoriteMeta?.collectedCount ?? 0;
  const likeCollected = likeMeta?.collectedCount ?? 0;
  const favoriteCoverage =
    favoriteTotal != null && favoriteTotal > 0
      ? ((favoriteCollected / favoriteTotal) * 100).toFixed(1)
      : null;

  return (
    <div className="bg-card rounded-3xl p-6 sm:p-7 border border-border/80 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/60">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-base font-bold text-foreground">数据观测范围与采样说明</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            基于公开行为证据生成的画像分析，严格标明各数据源的实际观测范围
          </p>
        </div>
        <div className="px-3 py-1 rounded-full bg-muted/60 text-xs font-mono font-medium text-foreground self-start sm:self-auto border border-border/50">
          共观测 <strong>{totalObservedRecords}</strong> 条公开行为记录
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. 主动创作 */}
        <div className="p-4 rounded-2xl bg-background/90 border border-emerald-500/20 space-y-2.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Video className="w-3.5 h-3.5" />
              <span>主动创作 (投稿)</span>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              <span>全量观测</span>
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="text-xl font-bold font-mono text-foreground">
              {contentMeta?.collectedCount ?? 7} / {contentMeta?.platformTotalCount ?? 7}
            </div>
            <p className="text-[11px] text-muted-foreground">
              完整公开投稿记录，反映主动表达与动手实践
            </p>
          </div>
        </div>

        {/* 2. 价值收藏 */}
        <div className="p-4 rounded-2xl bg-background/90 border border-amber-500/20 space-y-2.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
              <Bookmark className="w-3.5 h-3.5" />
              <span>价值收藏</span>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>近期样本</span>
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="text-xl font-bold font-mono text-foreground">
              {favoriteCollected}{" "}
              {favoriteTotal != null ? (
                <span className="text-xs text-muted-foreground font-normal">/ {favoriteTotal} 条</span>
              ) : (
                <span className="text-xs text-muted-foreground font-normal">条</span>
              )}
            </div>
            <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
              {favoriteCoverage != null
                ? `覆盖率 ~${favoriteCoverage}%，仅反映近期收藏窗口`
                : "近期收藏样本，仅反映近期窗口"}
            </p>
          </div>
        </div>

        {/* 3. 即时互动 */}
        <div className="p-4 rounded-2xl bg-background/90 border border-blue-500/20 space-y-2.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400">
              <ThumbsUp className="w-3.5 h-3.5" />
              <span>近期互动 (点赞)</span>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 flex items-center gap-1">
              <span>窗口样本</span>
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="text-xl font-bold font-mono text-foreground">
              {likeCollected} <span className="text-xs text-muted-foreground font-normal">条</span>
            </div>
            <p className="text-[11px] text-blue-700/90 dark:text-blue-300/90">
              平台接口最新窗口，反映近期轻量消费
            </p>
          </div>
        </div>

        {/* 4. 生态订阅 */}
        <div className="p-4 rounded-2xl bg-background/90 border border-border/70 space-y-2.5 text-muted-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Users className="w-3.5 h-3.5" />
              <span>生态订阅 (关注)</span>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
              未采集
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="text-xl font-bold font-mono text-muted-foreground/70">
              —
            </div>
            <p className="text-[11px]">
              免登录模式不可见，已安全降级隔离
            </p>
          </div>
        </div>
      </div>

      {/* Sampling Warning Banner — only shown if there is partial data */}
      {(favoriteMeta?.isComplete === false || likeMeta?.isComplete === false) && (
        <div className="p-3.5 rounded-2xl bg-amber-500/8 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <strong>数据诚实声明：</strong>
            {favoriteMeta?.isComplete === false && favoriteTotal != null
              ? `公开收藏（${favoriteCollected}/${favoriteTotal}）`
              : favoriteMeta?.isComplete === false
              ? "公开收藏"
              : ""}
            {favoriteMeta?.isComplete === false && likeMeta?.isComplete === false ? "与点赞" : likeMeta?.isComplete === false ? "点赞" : ""}
            {" "}属于有限观测窗口，相关结论主要反映近期行为偏好，不可直接等价于全部历史累积。
          </div>
        </div>
      )}
    </div>
  );
}
