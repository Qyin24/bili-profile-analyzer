"use client";

import * as React from "react";
import {
  Search,
  Filter,
  Bookmark,
  ShieldAlert,
} from "lucide-react";

export interface EntityFollowItem {
  id: string;
  name: string;
  sign: string;
  topicId: string;
  topicName: string;
  entityType: string;
  mappingMethod: string;
  confidence: number;
}

export interface EntityTargetInfo {
  name: string;
  category: string;
  platform: string;
  platformUid: string;
}

export interface TopicTaxonomyItem {
  id: string;
  code: string;
  name: string;
  description: string;
  color?: string;
}

export interface SelfProfileItem {
  currentGoals?: { value: string };
  careerOrMajor?: { value: string };
  learningDirections?: { value: string[] };
}

export interface EntitiesViewProps {
  target?: EntityTargetInfo;
  topicTaxonomy?: TopicTaxonomyItem[];
  entities?: EntityFollowItem[];
  selfProfile?: SelfProfileItem;
  isDemo?: boolean;
}

export function EntitiesView({
  target,
  topicTaxonomy = [],
  entities = [],
  selfProfile,
  isDemo = false,
}: EntitiesViewProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTopicId, setSelectedTopicId] = React.useState<string | "ALL">("ALL");
  const [activeTab, setActiveTab] = React.useState("FOLLOWS");

  const filteredEntities = React.useMemo(() => {
    return entities.filter((item) => {
      const matchTopic = selectedTopicId === "ALL" || item.topicId === selectedTopicId;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sign.toLowerCase().includes(q) ||
        item.topicName.toLowerCase().includes(q);
      return matchTopic && matchQuery;
    });
  }, [entities, searchQuery, selectedTopicId]);

  return (
    <div className="space-y-6">
      {/* Demo Notice Banner */}
      {isDemo && (
        <div className="bg-primary/10 border border-primary/25 rounded-3xl p-5 text-xs text-foreground/90 space-y-1.5 shadow-sm">
          <div className="font-bold flex items-center gap-2 text-primary text-sm">
            <ShieldAlert className="w-4 h-4" />
            <span>受控演示模式声明</span>
          </div>
          <p className="text-muted-foreground leading-relaxed text-xs">
            当前展示为受控演示数据：用于演示关注博主与内容主题分类映射交互；不代表真实账号数据。
          </p>
        </div>
      )}

      {/* Target Summary Card */}
      {target && (
        <div className="bg-card rounded-3xl p-6 sm:p-7 border border-border/80 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center font-extrabold text-lg shadow-sm">
                {target.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground">{target.name}</h2>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-secondary text-secondary-foreground rounded-full border border-border/60">
                    {target.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  演示目标账号
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-background/80 border border-border/60 text-muted-foreground">
                样本规模: <strong className="text-foreground font-mono">{entities.length} 关注</strong>
              </div>
            </div>
          </div>

          {/* Sub Tabs */}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50">
            {[
              { id: "SELF", name: "基础/自述信息" },
              { id: "FOLLOWS", name: "关注账号", badge: `${filteredEntities.length}` },
              { id: "TIMELINE", name: "时间线" },
              { id: "INTERACTION", name: "互动样本" },
              { id: "SNAPSHOTS", name: "快照存档" },
              { id: "HISTORY", name: "分析历史" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm font-bold"
                    : "bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{tab.name}</span>
                {tab.badge && (
                  <span className="px-1.5 py-0.2 text-[9px] rounded-full bg-primary-foreground/20 text-primary-foreground font-mono">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === "SELF" ? (
        /* Self Profile Tab Preview */
        <div className="bg-card rounded-3xl p-6 sm:p-7 border border-border/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-foreground">
            <Bookmark className="w-4 h-4 text-primary" />
            <span>自述信息快照</span>
          </div>
          {selfProfile ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {selfProfile.currentGoals?.value && (
                <div className="p-4 rounded-2xl bg-background/70 border border-border/60 space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">当前目标</span>
                  <p className="font-medium text-foreground">{selfProfile.currentGoals.value}</p>
                </div>
              )}
              {selfProfile.careerOrMajor?.value && (
                <div className="p-4 rounded-2xl bg-background/70 border border-border/60 space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">专业职业</span>
                  <p className="font-medium text-foreground">{selfProfile.careerOrMajor.value}</p>
                </div>
              )}
              {selfProfile.learningDirections?.value && (
                <div className="p-4 rounded-2xl bg-background/70 border border-border/60 space-y-1 sm:col-span-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">学习方向</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selfProfile.learningDirections.value.map((d) => (
                      <span key={d} className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-medium border border-amber-500/20">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground bg-background/50 rounded-2xl border border-border/50 space-y-1">
              <div className="font-bold text-foreground">暂无可验证实体数据</div>
              <p>当前任务未配置自述信息快照；不代表该用户在 B 站没有关注博主或公开内容。</p>
            </div>
          )}
        </div>
      ) : (
        /* Follows List Tab */
        <div className="bg-card rounded-3xl p-6 sm:p-7 border border-border/80 shadow-sm space-y-5">
          {/* Search & Topic Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索关注博主名称、签名或分类..."
                aria-label="搜索关注博主"
                className="w-full pl-10 pr-4 py-2 rounded-2xl bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
              />
            </div>
          </div>

          {/* Topic Filter Chips */}
          {topicTaxonomy.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Filter className="w-3 h-3 text-primary" />
                <span>内容主题分类筛选：</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedTopicId("ALL")}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                    selectedTopicId === "ALL"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-background/80 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  全部 ({entities.length})
                </button>
                {topicTaxonomy.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTopicId(t.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      selectedTopicId === t.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-background/80 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />}
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Entities Grid */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>已展示：{filteredEntities.length} 个关注内容</span>
            </div>

            {filteredEntities.length === 0 ? (
              <div className="p-8 text-center space-y-2 bg-background/50 rounded-2xl border border-border/50">
                <div className="font-bold text-foreground text-sm">暂无内容数据</div>
                <p className="text-xs text-muted-foreground">
                  受控数据门控下未检索到符合条件的关注博主或公开内容样本；不代表该用户在 B 站没有关注博主或公开内容。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredEntities.map((f) => (
                  <div
                    key={f.id}
                    className="p-4 rounded-2xl bg-background/80 border border-border/70 space-y-2.5 text-xs hover:border-primary/40 transition-colors shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-foreground text-xs sm:text-sm">{f.name}</div>
                        <span className="inline-block mt-0.5 px-2 py-0.2 rounded-md text-[10px] font-semibold bg-secondary text-secondary-foreground border border-border/60">
                          {f.entityType}
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/25 shrink-0">
                        {f.topicName}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {f.sign}
                    </p>

                    {/* Collapsible Classification Details */}
                    <details className="group pt-1 border-t border-border/30">
                      <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground list-none flex items-center justify-between select-none">
                        <span>查看分类说明</span>
                        <span className="group-open:hidden text-primary text-[10px]">展开</span>
                      </summary>
                      <div className="pt-1.5 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <span>分类参考: {f.mappingMethod === "RULE_BASED" ? "规则匹配" : f.mappingMethod === "MANUAL" ? "验证标注" : f.mappingMethod}</span>
                        <span>匹配度: {Math.round(f.confidence * 100)}%</span>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
