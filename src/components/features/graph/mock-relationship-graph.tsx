"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  MOCK_TARGET,
  MOCK_TOPIC_TAXONOMY,
  MOCK_FOLLOW_ENTITIES,
} from "@/lib/mock-data";
import { GitFork, Info } from "lucide-react";

interface GraphNode {
  id: string;
  label: string;
  type: "TARGET" | "TOPIC" | "ENTITY";
  x: number;
  y: number;
  color: string;
  details?: string;
  topicName?: string;
}

interface GraphLink {
  sourceId: string;
  targetId: string;
  color: string;
  dashed?: boolean;
}

export function MockRelationshipGraph() {
  const [selectedNode, setSelectedNode] = React.useState<GraphNode | null>(null);

  // Coordinates on a 700x500 canvas
  const centerX = 350;
  const centerY = 250;

  const nodes: GraphNode[] = React.useMemo(() => {
    const list: GraphNode[] = [
      {
        id: "target-main",
        label: MOCK_TARGET.name,
        type: "TARGET",
        x: centerX,
        y: centerY,
        color: "#B89582",
        details: `分析主体 (UID: ${MOCK_TARGET.platformUid}) · 99 位关注博主`,
      },
    ];

    // Inner circle: 6 topics
    const topicRadius = 115;
    MOCK_TOPIC_TAXONOMY.forEach((topic, i) => {
      const angle = (i * 2 * Math.PI) / MOCK_TOPIC_TAXONOMY.length - Math.PI / 2;
      const tx = centerX + topicRadius * Math.cos(angle);
      const ty = centerY + topicRadius * Math.sin(angle);
      list.push({
        id: topic.id,
        label: topic.name,
        type: "TOPIC",
        x: tx,
        y: ty,
        color: topic.color,
        details: topic.description,
        topicName: topic.name,
      });
    });

    // Outer layer: Sample entities
    const entityPositions = [
      { entity: MOCK_FOLLOW_ENTITIES[0], angleOffset: -0.25 },
      { entity: MOCK_FOLLOW_ENTITIES[1], angleOffset: 0.25 },
      { entity: MOCK_FOLLOW_ENTITIES[2], angleOffset: -0.25 },
      { entity: MOCK_FOLLOW_ENTITIES[3], angleOffset: 0.25 },
      { entity: MOCK_FOLLOW_ENTITIES[5], angleOffset: 0.0 },
      { entity: MOCK_FOLLOW_ENTITIES[6], angleOffset: 0.0 },
      { entity: MOCK_FOLLOW_ENTITIES[7], angleOffset: 0.0 },
      { entity: MOCK_FOLLOW_ENTITIES[8], angleOffset: 0.0 },
    ];

    entityPositions.forEach(({ entity, angleOffset }) => {
      const topicIndex = MOCK_TOPIC_TAXONOMY.findIndex((t) => t.id === entity.topicId);
      if (topicIndex >= 0) {
        const baseAngle = (topicIndex * 2 * Math.PI) / MOCK_TOPIC_TAXONOMY.length - Math.PI / 2;
        const finalAngle = baseAngle + angleOffset;
        const ex = centerX + 215 * Math.cos(finalAngle);
        const ey = centerY + 205 * Math.sin(finalAngle);
        list.push({
          id: entity.id,
          label: entity.name.replace("（演示）", ""),
          type: "ENTITY",
          x: ex,
          y: ey,
          color: MOCK_TOPIC_TAXONOMY[topicIndex].color,
          details: `${entity.sign || "暂无简介"} (分类: ${entity.topicName})`,
          topicName: entity.topicName,
        });
      }
    });

    return list;
  }, [centerX, centerY]);

  const links: GraphLink[] = React.useMemo(() => {
    const list: GraphLink[] = [];

    // Target -> Topics
    MOCK_TOPIC_TAXONOMY.forEach((topic) => {
      list.push({
        sourceId: "target-main",
        targetId: topic.id,
        color: topic.color,
      });
    });

    // Topics -> Entities
    nodes
      .filter((n) => n.type === "ENTITY")
      .forEach((entityNode) => {
        const matchingTopic = MOCK_TOPIC_TAXONOMY.find((t) => t.name === entityNode.topicName);
        if (matchingTopic) {
          list.push({
            sourceId: matchingTopic.id,
            targetId: entityNode.id,
            color: matchingTopic.color,
            dashed: true,
          });
        }
      });

    return list;
  }, [nodes]);

  return (
    <div className="space-y-6">
      <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
        <CardHeader className="p-5 sm:p-6 pb-3 border-b border-border/40 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                  <GitFork className="w-4 h-4" />
                </div>
                <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                  关系概览图谱
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                直观展示“你 — 内容主题 — 关注博主”之间的关联结构（点击节点查看详情）
              </CardDescription>
            </div>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 self-start sm:self-auto">
              <Info className="w-3.5 h-3.5" />
              <span>支持点击节点展开详情</span>
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* Friendly Visual Legend */}
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap p-2.5 rounded-2xl bg-cream-100/90 border border-border/60">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-terracotta-400 border border-terracotta-600 inline-block" />
              <span className="font-semibold text-foreground">分析主体 (中心)</span>
            </div>
            <span className="text-muted-foreground/60">→</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-primary inline-block" />
              <span className="font-semibold text-foreground">主要内容主题 (中间层)</span>
            </div>
            <span className="text-muted-foreground/60">→</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sage-300 border border-primary inline-block" />
              <span className="font-semibold text-foreground">代表性博主 (外层)</span>
            </div>
          </div>

          {/* SVG Canvas Container */}
          <div className="w-full overflow-x-auto no-scrollbar rounded-2xl bg-cream-200/50 border border-border/70 p-2 flex justify-center">
            <svg
              viewBox="0 0 700 500"
              className="w-full max-w-[700px] h-auto select-none"
              style={{ minWidth: "500px" }}
            >
              {/* Links */}
              {links.map((link, idx) => {
                const source = nodes.find((n) => n.id === link.sourceId);
                const target = nodes.find((n) => n.id === link.targetId);
                if (!source || !target) return null;

                const isHighlighted =
                  selectedNode &&
                  (selectedNode.id === source.id || selectedNode.id === target.id);

                return (
                  <line
                    key={idx}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={link.color}
                    strokeWidth={isHighlighted ? 2.5 : link.dashed ? 1.2 : 1.8}
                    strokeDasharray={link.dashed ? "4 4" : undefined}
                    strokeOpacity={isHighlighted ? 0.9 : 0.45}
                  />
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isTarget = node.type === "TARGET";
                const isTopic = node.type === "TOPIC";
                const radius = isTarget ? 34 : isTopic ? 24 : 14;

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer transition-transform duration-200 hover:scale-110 focus:outline-hidden"
                    onClick={() => setSelectedNode(node)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedNode(node);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`选择节点: ${node.label} (${node.type})`}
                  >
                    {/* Outer selection ring */}
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={radius + 6}
                        fill="none"
                        stroke="#4E878C"
                        strokeWidth="2.5"
                        strokeDasharray="4 2"
                        className="animate-spin-slow"
                      />
                    )}

                    {/* Node circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius}
                      fill={isTarget ? "#FDFCFA" : node.color}
                      stroke={isTarget ? "#B89582" : "#FDFCFA"}
                      strokeWidth={isTarget ? 3 : 2}
                      className="shadow-sm"
                    />

                    {/* Node text / icon */}
                    <text
                      x={node.x}
                      y={node.y + (isTarget ? 4 : isTopic ? 4 : 3)}
                      textAnchor="middle"
                      fill={isTarget ? "#362921" : "#FFFFFF"}
                      fontSize={isTarget ? 11 : isTopic ? 9 : 8}
                      fontWeight={isTarget || isTopic ? "bold" : "normal"}
                      className="pointer-events-none"
                    >
                      {node.label.length > 5 ? `${node.label.slice(0, 4)}..` : node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected Node Details Card */}
          <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/80 text-xs space-y-1.5 min-h-[72px] flex flex-col justify-center">
            {selectedNode ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: selectedNode.color }}
                    />
                    <span>{selectedNode.label}</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                    {selectedNode.type === "TARGET"
                      ? "分析主体"
                      : selectedNode.type === "TOPIC"
                      ? "主题分类"
                      : "关注博主"}
                  </span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {selectedNode.details || "暂无更多详细说明"}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-center">
                点击上方任意图谱节点，查看该博主或主题的详细关联
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
