"use client";

import * as React from "react";
import { MockQAPair, ReportEvidenceSnapshot } from "@/types/analysis";
import { MOCK_QA_PAIRS } from "@/lib/mock-data";
import {
  MessageSquare,
  Send,
  Sparkles,
  User,
  Link2,
} from "lucide-react";

interface MockQAChatProps {
  evidenceSnapshots: ReportEvidenceSnapshot[];
  onOpenEvidence: (evidence: ReportEvidenceSnapshot) => void;
}

interface ChatMessage {
  id: string;
  sender: "USER" | "AI";
  text: string;
  referencedEvidenceIds?: string[];
  timestamp: string;
}

export function MockQAChat({ evidenceSnapshots, onOpenEvidence }: MockQAChatProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      sender: "AI",
      text: "你好！你可以向我提问关于这份分析报告的内容。问答仅基于当前报告已包含的内容与参考依据，不发送任何外部网络请求。",
      timestamp: "10:15",
    },
  ]);
  const [inputVal, setInputVal] = React.useState("");

  const presetQuestions = [
    "该用户的核心学习方向主要集中在哪些方面？",
    "用户的非专业兴趣都有哪些？有依据吗？",
    "该画像报告是否有推断用户的性格或人格特征？",
  ];

  const handleSend = (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: "USER",
      text: trimmed,
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal("");

    // Local simulated matching strictly bounded by existing report evidence
    setTimeout(() => {
      let matchedPair: MockQAPair | undefined = undefined;

      if (trimmed.includes("学习") || trimmed.includes("专业") || trimmed.includes("技术")) {
        matchedPair = MOCK_QA_PAIRS.find((q) => q.id === "qa-01");
      } else if (trimmed.includes("兴趣") || trimmed.includes("业余") || trimmed.includes("音乐") || trimmed.includes("体育")) {
        matchedPair = MOCK_QA_PAIRS.find((q) => q.id === "qa-02");
      } else if (trimmed.includes("性格") || trimmed.includes("人格") || trimmed.includes("MBTI") || trimmed.includes("定性")) {
        matchedPair = MOCK_QA_PAIRS.find((q) => q.id === "qa-03");
      } else {
        matchedPair = MOCK_QA_PAIRS.find((q) => q.question === trimmed);
      }

      const allEvidenceAvailable =
        matchedPair !== undefined &&
        matchedPair.referencedEvidenceIds.length > 0 &&
        matchedPair.referencedEvidenceIds.every((evId) =>
          evidenceSnapshots.some((e) => e.id === evId || e.evidenceId === evId)
        );

      let aiResponseText = "";
      let referencedIds: string[] | undefined = undefined;

      if (matchedPair && allEvidenceAvailable) {
        aiResponseText = matchedPair.answer;
        referencedIds = matchedPair.referencedEvidenceIds;
      } else {
        aiResponseText =
          "这份报告中暂无足够依据回答此问题。问答仅基于当前报告已包含的内容，不进行额外推测或联网搜索。";
        referencedIds = undefined;
      }

      const aiMsg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        sender: "AI",
        text: aiResponseText,
        referencedEvidenceIds: referencedIds,
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    }, 400);
  };

  const handleOpenEvidenceById = (evId: string) => {
    const found = evidenceSnapshots.find((e) => e.id === evId || e.evidenceId === evId);
    if (found) {
      onOpenEvidence(found);
    }
  };

  return (
    <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/50">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              针对这份报告问一问
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            仅基于本次报告已有的参考依据作答，不发起外部网络请求。
          </p>
        </div>

        <span className="self-start sm:self-auto text-[11px] px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/60">
          本地问答
        </span>
      </div>

      {/* Preset Quick Question Chips */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-primary" />
          <span>推荐问题（点击快速提问）：</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {presetQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleSend(q)}
              className="px-3 py-1.5 rounded-xl text-xs bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground border border-border/60 transition-colors text-left cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Thread Container */}
      <div className="space-y-3.5 max-h-96 overflow-y-auto p-4 rounded-2xl bg-background/60 border border-border/60">
        {messages.map((msg) => {
          const isAi = msg.sender === "AI";
          return (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs animate-in fade-in duration-200 ${
                isAi ? "items-start" : "items-start justify-end"
              }`}
            >
              {isAi && (
                <div className="w-7 h-7 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl space-y-2 ${
                  isAi
                    ? "bg-card border border-border/70 text-foreground shadow-2xs"
                    : "bg-primary text-primary-foreground font-medium shadow-xs"
                }`}
              >
                <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                {/* Referenced Evidence Chips (if any) */}
                {isAi && msg.referencedEvidenceIds && msg.referencedEvidenceIds.length > 0 && (
                  <div className="pt-2 border-t border-border/40 space-y-1">
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
                      <Link2 className="w-3 h-3 text-primary" />
                      <span>解答参考了以下依据：</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.referencedEvidenceIds.map((evId) => {
                        const ev = evidenceSnapshots.find((e) => e.id === evId || e.evidenceId === evId);
                        const label = ev?.title || "查看参考依据";
                        return (
                          <button
                            key={evId}
                            type="button"
                            onClick={() => handleOpenEvidenceById(evId)}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 transition-colors cursor-pointer"
                          >
                            <span>🔗</span>
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="text-[10px] opacity-70 text-right">{msg.timestamp}</div>
              </div>

              {!isAi && (
                <div className="w-7 h-7 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Input Box Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(inputVal);
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="针对这份报告输入你的问题..."
          className="flex-1 px-4 py-2.5 rounded-2xl bg-background border border-border/80 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
        />
        <button
          type="submit"
          disabled={!inputVal.trim()}
          aria-label="发送问题"
          className="px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer shrink-0 flex items-center gap-1.5"
        >
          <span>发送</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
