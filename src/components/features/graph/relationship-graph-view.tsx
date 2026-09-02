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

// 真实关系图数据由分析任务产出。当前没有可展示的真实数据时保持为空，
// 不渲染任何虚构节点或“示例联系”，由下方空状态清晰告知用户。
const GRAPH_NODES: NodeData[] = [];
const GRAPH_EDGES: { from: string; to: string }[] = [];

export function RelationshipGraphView() {
  const [selectedNode, setSelectedNode] = React.useState<NodeData | null>(null);

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
          帮助你查看主题与关注内容之间的关系。完成一次分析后，这里会展示你的关系图谱。
        </p>
      </div>

      {/* Graph Canvas Card */}
      <div className="bg-card rounded-3xl p-4 sm:p-6 border border-border/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-border/40">
          <div className="font-bold text-foreground flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-primary" />
            <span>关系图</span>
          </div>
          <span className="text-[11px] text-muted-foreground">点击或键盘聚焦节点查看拓扑属性</span>
        </div>

        {GRAPH_NODES.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="font-bold text-foreground text-sm">还没有关系图谱</div>
            <p className="text-xs text-muted-foreground">
              完成一次分析后，这里会展示你的主题与关注关系图谱。当前还没有可展示的数据。
            </p>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
