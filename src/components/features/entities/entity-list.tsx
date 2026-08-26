"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MOCK_TARGET,
  MOCK_FOLLOW_ENTITIES,
  MOCK_TOPIC_TAXONOMY,
} from "@/lib/mock-data";
import {
  Search,
  Sparkles,
  GitFork,
  Filter,
  User,
  Building2,
  Radio,
  FileText,
  Calendar,
  Layers,
  Heart,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function EntityList() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTopicId, setSelectedTopicId] = React.useState<string>("ALL");
  const [activeSubTab, setActiveSubTab] = React.useState("follows");

  const filteredEntities = React.useMemo(() => {
    return MOCK_FOLLOW_ENTITIES.filter((entity) => {
      const matchesSearch =
        entity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entity.sign.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTopic =
        selectedTopicId === "ALL" || entity.topicId === selectedTopicId;
      return matchesSearch && matchesTopic;
    });
  }, [searchQuery, selectedTopicId]);

  return (
    <div className="space-y-6">
      {/* Target Summary & Action Area */}
      <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
        <CardHeader className="p-5 sm:p-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-lg font-bold border border-primary/20 shadow-xs">
                YJ
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg font-bold">{MOCK_TARGET.name}</CardTitle>
                  <span className="px-2 py-0.5 rounded-md bg-cream-200 text-foreground text-xs font-mono border border-border/60">
                    UID: {MOCK_TARGET.platformUid}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  已获取 {MOCK_TARGET.totalFollowingsSampled} 位公开关注博主 · 覆盖 6 个主要内容主题
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild className="rounded-xl text-xs gap-1.5 h-8">
                <Link href="/graph" aria-label="前往关系概览图">
                  <GitFork className="w-3.5 h-3.5" />
                  <span>关系概览</span>
                </Link>
              </Button>
              <Button size="sm" asChild className="rounded-xl text-xs gap-1.5 h-8 shadow-xs font-semibold">
                <Link href="/analysis" aria-label="前往分析报告">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>分析报告</span>
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Demo Sub-Tabs Switch Group */}
        <div
          role="group"
          aria-label="内容分类切换"
          className="border-t border-border/40 px-4 sm:px-6 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2 bg-muted/20"
        >
          {[
            { id: "follows", label: "关注博主", icon: User, badge: "99" },
            { id: "info", label: "账号信息", icon: FileText },
            { id: "timeline", label: "动态记录", icon: Calendar, badge: "18" },
            { id: "interactions", label: "互动记录", icon: Heart, badge: "0" },
            { id: "snapshots", label: "数据快照", icon: Layers, badge: "1" },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={isActive}
                aria-label={`切换至 ${tab.label}`}
                onClick={() => setActiveSubTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 select-none cursor-pointer",
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <label htmlFor="entity-search-input" className="sr-only">
            搜索博主名称或简介关键词
          </label>
          <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
          <Input
            id="entity-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索博主名称或简介关键词..."
            aria-label="搜索博主名称或简介关键词"
            className="pl-9 text-xs sm:text-sm bg-card rounded-2xl border-border/80 h-10"
          />
        </div>

        {/* Topic Filter Pills */}
        <div
          role="group"
          aria-label="按主题分类筛选"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1"
        >
          <button
            type="button"
            onClick={() => setSelectedTopicId("ALL")}
            aria-pressed={selectedTopicId === "ALL"}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 cursor-pointer",
              selectedTopicId === "ALL"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "bg-card border border-border/70 text-foreground/80 hover:bg-muted"
            )}
          >
            全部 ({MOCK_FOLLOW_ENTITIES.length})
          </button>
          {MOCK_TOPIC_TAXONOMY.map((topic) => {
            const count = MOCK_FOLLOW_ENTITIES.filter((e) => e.topicId === topic.id).length;
            const isSelected = selectedTopicId === topic.id;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => setSelectedTopicId(topic.id)}
                aria-pressed={isSelected}
                aria-label={`筛选 ${topic.name} 分类 (${count} 条)`}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer",
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-card border border-border/70 text-foreground/80 hover:bg-muted"
                )}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: topic.color }}
                />
                <span>{topic.name}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Entities Cards Grid */}
      <div className="space-y-3">
        {filteredEntities.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-3xl border border-border/60 p-6 space-y-2">
            <Filter className="w-8 h-8 text-muted-foreground/60 mx-auto" />
            <p className="text-sm font-medium text-foreground">没有找到匹配的博主</p>
            <p className="text-xs text-muted-foreground">请尝试调整搜索关键词或选择其他分类</p>
          </div>
        ) : (
          filteredEntities.map((entity) => (
            <Card
              key={entity.id}
              className="p-4 sm:p-5 rounded-2xl bg-card border-border/70 hover:border-border transition-all hover:shadow-warm space-y-2.5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sage-100 text-sage-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    {entity.entityType === "机构媒体" ? (
                      <Building2 className="w-4 h-4" />
                    ) : entity.entityType === "官方号" ? (
                      <Radio className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">{entity.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-medium">
                        {entity.entityType}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {entity.sign || "暂无公开简介"}
                    </p>
                  </div>
                </div>

                {/* Topic Badge */}
                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream-200 text-foreground text-xs font-medium border border-border/60">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor:
                          MOCK_TOPIC_TAXONOMY.find((t) => t.id === entity.topicId)?.color || "#4E878C",
                      }}
                    />
                    <span>{entity.topicName}</span>
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
