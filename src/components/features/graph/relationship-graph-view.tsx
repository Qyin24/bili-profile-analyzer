"use client";

import * as React from "react";
import { Network, Tag } from "lucide-react";

interface NodeData {
  id: string;
  label: string;
  type: "USER" | "TOPIC" | "FOLLOW";
  x: number;
  y: number;
  r: number;
  color: string;
  topicName?: string;
  method?: string;
  confidence?: string;
  desc?: string;
}

const GRAPH_NODES: NodeData[] = [
  { id: "node-user", label: "YJ (目标用户)", type: "USER", x: 250, y: 160, r: 28, color: "#4E878C", desc: "当前分析的目标用户（演示账号）" },
  { id: "node-topic-edu", label: "知识学习 (32%)", type: "TOPIC", x: 120, y: 80, r: 24, color: "#D4A373", topicName: "知识学习", desc: "涵盖知识分享、技能教程与学术前沿" },
  { id: "node-topic-tech", label: "技术数码 (28%)", type: "TOPIC", x: 380, y: 80, r: 24, color: "#4E878C", topicName: "技术与数码", desc: "涵盖软件开发、硬件架构与系统实践" },
  { id: "node-topic-music", label: "音乐艺术 (14%)", type: "TOPIC", x: 100, y: 250, r: 22, color: "#C27D66", topicName: "音乐艺术", desc: "涵盖指弹乐理、音乐演奏与艺术创作" },
  { id: "node-topic-sports", label: "体育运动 (8%)", type: "TOPIC", x: 400, y: 250, r: 20, color: "#5B8E7D", topicName: "体育运动", desc: "涵盖羽毛球技巧、战术拆解与运动日常" },
  { id: "node-follow-1", label: "开源架构小站", type: "FOLLOW", x: 440, y: 20, r: 16, color: "#4E878C", topicName: "技术与数码", method: "规则匹配", confidence: "98%", desc: "专注分布式与现代系统架构分享" },
  { id: "node-follow-2", label: "全栈开发者日志", type: "FOLLOW", x: 340, y: 15, r: 16, color: "#4E878C", topicName: "技术与数码", method: "规则匹配", confidence: "96%", desc: "Web 全栈架构与性能调优笔记" },
  { id: "node-follow-3", label: "古典吉他研习社", type: "FOLLOW", x: 40, y: 290, r: 16, color: "#C27D66", topicName: "音乐艺术", method: "验证标注", confidence: "100%", desc: "指弹吉他谱与乐理练习日常" },
  { id: "node-follow-4", label: "羽毛球战术拆解", type: "FOLLOW", x: 460, y: 290, r: 16, color: "#5B8E7D", topicName: "体育运动", method: "规则匹配", confidence: "94%", desc: "双打步法与技战术实战配合" },
];

const GRAPH_EDGES = [
  { from: "node-user", to: "node-topic-edu" },
  { from: "node-user", to: "node-topic-tech" },
  { from: "node-user", to: "node-topic-music" },
  { from: "node-user", to: "node-topic-sports" },
  { from: "node-topic-tech", to: "node-follow-1" },
  { from: "node-topic-tech", to: "node-follow-2" },
  { from: "node-topic-music", to: "node-follow-3" },
  { from: "node-topic-sports", to: "node-follow-4" },
];

export function RelationshipGraphView() {
  const [selectedNode, setSelectedNode] = React.useState<NodeData | null>(GRAPH_NODES[0]);

  const handleNodeClick = (node: NodeData) => {
    setSelectedNode(node);
  };

  const handleKeyDown = (e: React.KeyboardEvent, node: NodeData) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedNode(node);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-primary/10 border border-primary/20 rounded-3xl p-5 text-xs text-foreground/90 space-y-1">
        <div className="font-bold flex items-center gap-2 text-primary">
          <Network className="w-4 h-4" />
          <span>关系概览</span>
        </div>
        <p className="text-muted-foreground leading-relaxed text-xs">
          帮助你查看主题与关注内容之间的示例联系。通过直观的关系图，清晰了解自己在不同主题方向上的关注分布。
        </p>
      </div>

      {/* SVG Graph Canvas Card */}
      <div className="bg-card rounded-3xl p-4 sm:p-6 border border-border/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-border/40">
          <div className="font-bold text-foreground flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-primary" />
            <span>关系图</span>
          </div>
          <span className="text-[11px] text-muted-foreground">点击或键盘聚焦节点查看拓扑属性</span>
        </div>

        {/* SVG Container */}
        <div className="w-full overflow-x-auto flex justify-center py-2">
          <svg
            viewBox="0 0 500 340"
            className="w-full max-w-[500px] h-[340px] select-none"
            aria-label="只读关系拓扑图"
          >
            {/* Edges */}
            {GRAPH_EDGES.map((edge, idx) => {
              const source = GRAPH_NODES.find((n) => n.id === edge.from)!;
              const target = GRAPH_NODES.find((n) => n.id === edge.to)!;
              const isHighlighted =
                selectedNode && (selectedNode.id === source.id || selectedNode.id === target.id);

              return (
                <line
                  key={`edge-${idx}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={isHighlighted ? "#4E878C" : "#C4A493"}
                  strokeWidth={isHighlighted ? "2.5" : "1.2"}
                  strokeDasharray={edge.to.includes("follow") ? "4 2" : "none"}
                  opacity={isHighlighted ? 0.9 : 0.4}
                />
              );
            })}

            {/* Nodes */}
            {GRAPH_NODES.map((node) => {
              const isSelected = selectedNode?.id === node.id;

              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`选择节点: ${node.label}`}
                  onClick={() => handleNodeClick(node)}
                  onKeyDown={(e) => handleKeyDown(e, node)}
                  className="cursor-pointer focus:outline-none group"
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? node.r + 3 : node.r}
                    fill={node.color}
                    fillOpacity={node.type === "USER" ? 1 : isSelected ? 0.9 : 0.75}
                    stroke={isSelected ? "#362921" : "#FDFCFA"}
                    strokeWidth={isSelected ? 3 : 2}
                    className="transition-all duration-200 group-hover:scale-110"
                  />
                  <text
                    x={node.x}
                    y={node.y + (node.type === "USER" ? 38 : node.r + 13)}
                    textAnchor="middle"
                    className="text-[10px] font-bold fill-foreground select-none pointer-events-none"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Node Inspector (Zero Internal IDs leaked) */}
        {selectedNode && (
          <div className="p-4 rounded-2xl bg-background/80 border border-border/70 space-y-2 text-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground text-sm">{selectedNode.label}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/15 text-primary">
                  {selectedNode.type === "USER" ? "分析目标" : selectedNode.type === "TOPIC" ? "内容主题" : "关注对象"}
                </span>
              </div>
            </div>

            <p className="text-muted-foreground text-[11px] leading-relaxed">{selectedNode.desc}</p>

            {selectedNode.method && (
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>分类方式: <strong>{selectedNode.method}</strong></span>
                <span>置信度: <strong className="text-primary">{selectedNode.confidence}</strong></span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
