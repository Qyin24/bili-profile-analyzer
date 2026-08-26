"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOCK_QA_PAIRS, MOCK_ANALYSIS_RESULT } from "@/lib/mock-data";
import { ReportEvidenceSnapshot } from "@/types/analysis";
import { EvidenceDrawer } from "./evidence-drawer";
import { getEvidenceNaturalName } from "./report-viewer";
import {
  MessageSquare,
  Send,
  Bot,
  User,
  FileCheck,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  sender: "USER" | "ASSISTANT";
  content: string;
  evidenceIds?: string[];
  timestamp: string;
}

// Local snapshot-based question answering generator (explicit demo tone)
function generateLocalAnswer(question: string): { answer: string; evidenceIds: string[] } {
  const q = question.toLowerCase();

  // 1. Prohibited inference topics
  if (
    q.includes("mbti") ||
    q.includes("性格") ||
    q.includes("心理") ||
    q.includes("抑郁") ||
    q.includes("疾病") ||
    q.includes("健康") ||
    q.includes("性取向") ||
    q.includes("同性") ||
    q.includes("政治") ||
    q.includes("宗教") ||
    q.includes("人品") ||
    q.includes("道德") ||
    q.includes("沉稳") ||
    q.includes("内向") ||
    q.includes("外向")
  ) {
    return {
      answer:
        "【合规与表达提示】这是基于示例报告的有限说明：依据合规规范，本系统严格禁止对个人性格、心理状态、疾病诊断、性取向或敏感个人属性作任何未经科学验证的推断。示例快照中不包含此类内容，亦不会生成此类判断。",
      evidenceIds: [],
    };
  }

  // 2. Technical / Computer Science / Learning Goals
  if (
    q.includes("技术") ||
    q.includes("开发") ||
    q.includes("代码") ||
    q.includes("架构") ||
    q.includes("学习") ||
    q.includes("毕设") ||
    q.includes("专业") ||
    q.includes("计算机") ||
    q.includes("工程") ||
    q.includes("全栈")
  ) {
    return {
      answer:
        "基于示例报告快照：示例自述目标显示其正在准备毕业设计并提升全栈工程能力；在 99 条模拟关注样本中，知识学习占比 32.3%，技术与数码分类占比 28.3%，包含了分布式系统与全栈开发类博主。这在演示中反映出对专业技术内容的浓厚偏好。",
      evidenceIds: ["ev-self-goal-1", "ev-metric-edu-01", "ev-metric-tech-1", "ev-follow-tech-01"],
    };
  }

  // 3. Music / Guitar / Sports / Badminton / Hobbies
  if (
    q.includes("音乐") ||
    q.includes("吉他") ||
    q.includes("体育") ||
    q.includes("羽毛球") ||
    q.includes("兴趣") ||
    q.includes("业余") ||
    q.includes("生活") ||
    q.includes("爱好")
  ) {
    return {
      answer:
        "基于示例报告快照：在模拟关注样本中，音乐艺术（占比 14.1%）与体育运动（占比 8.1%）是主要的模拟关注点，具体包括指弹吉他谱与乐理练习以及羽毛球战术技巧。需注意：这仅反映模拟样本分布，不等同于线下实际参与情况。",
      evidenceIds: ["ev-metric-music-1", "ev-follow-music-01", "ev-follow-sports-01"],
    };
  }

  // 4. Time / Dynamic / Active Hours
  if (
    q.includes("时间") ||
    q.includes("时段") ||
    q.includes("晚上") ||
    q.includes("动态") ||
    q.includes("活跃") ||
    q.includes("发帖") ||
    q.includes("更新")
  ) {
    return {
      answer:
        "基于示例报告快照：18 条模拟动态的时间戳显示，主要活跃区间集中在晚间 20:00 ~ 23:00；动态内容多为技术问题排查记录或日常学习笔记。结合示例自述，晚间活跃可能与自主学习安排相关，但这仅代表模拟样本中的行为呈现。",
      evidenceIds: ["ev-metric-time-01", "ev-dynamic-sample-01", "ev-dynamic-sample-02"],
    };
  }

  // 5. Ratio / Balance / Distribution
  if (
    q.includes("比例") ||
    q.includes("平衡") ||
    q.includes("多样性") ||
    q.includes("占比") ||
    q.includes("统计") ||
    q.includes("分布") ||
    q.includes("分类")
  ) {
    return {
      answer:
        "基于示例报告快照：根据受控规则聚合统计，知识学习占 32.3% 与技术数码占 28.3% 合计占 60.6%，涵盖 6 大受控分类。从模拟数据看，结构呈现出以技术学习为主、兼顾音乐与运动的分布特点。",
      evidenceIds: ["ev-metric-edu-01", "ev-metric-tech-1", "ev-metric-music-1"],
    };
  }

  // 6. Default Fallback
  return {
    answer:
      "当前示例快照中暂无足够模拟依据直接回答此问题。本解答仅基于已锁定的 99 条模拟关注样本、18 条模拟动态样本及示例自述目标，不会进行无依据的主观猜测。",
    evidenceIds: [],
  };
}

export function MockQAChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "msg-init",
      sender: "ASSISTANT",
      content:
        "你好！我是内容分析助手（演示）。你可以针对这份示例报告提出任何问题，例如关注重点、业余兴趣或活跃时段。所有解答严格基于已锁定的示例数据快照进行有限演示。",
      timestamp: "刚刚",
    },
    ...MOCK_QA_PAIRS.flatMap((qa, i) => [
      {
        id: `user-init-${i}`,
        sender: "USER" as const,
        content: qa.question,
        timestamp: "刚刚",
      },
      {
        id: `bot-init-${i}`,
        sender: "ASSISTANT" as const,
        content: qa.answer.replace(/\s*\(ev-[^)]+\)/g, "").replace(/ev-[a-zA-Z0-9_-]+/g, ""),
        evidenceIds: qa.referencedEvidenceIds,
        timestamp: "刚刚",
      },
    ]),
  ]);

  const [inputQuery, setInputQuery] = React.useState("");
  const [selectedEvidence, setSelectedEvidence] = React.useState<ReportEvidenceSnapshot | null>(null);

  const handleOpenEvidence = (evidenceId: string) => {
    const found = MOCK_ANALYSIS_RESULT.evidenceSnapshots.find(
      (e) => e.id === evidenceId || e.evidenceId === evidenceId
    );
    if (found) {
      setSelectedEvidence(found);
    }
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "USER",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const result = generateLocalAnswer(query);

    const assistantMsg: ChatMessage = {
      id: `bot-${Date.now() + 1}`,
      sender: "ASSISTANT",
      content: result.answer,
      evidenceIds: result.evidenceIds,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInputQuery("");
  };

  return (
    <div className="space-y-4">
      {/* Evidence Modal */}
      <EvidenceDrawer
        evidence={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
      />

      <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
        <CardHeader className="p-5 sm:p-6 pb-3 border-b border-border/40 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                  想继续了解什么？（演示问答）
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                回答只基于这份示例报告已有的信息，不会因此发起网络请求或重新采集数据。
              </p>
            </div>
          </div>
        </CardHeader>

        {/* Chat Stream Area */}
        <CardContent className="p-4 sm:p-6 space-y-3.5 max-h-[380px] overflow-y-auto">
          <div
            role="log"
            aria-label="偏好问答记录"
            aria-live="polite"
            className="space-y-3.5"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2.5 items-start text-xs sm:text-sm",
                  msg.sender === "USER" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-xs",
                    msg.sender === "USER"
                      ? "bg-terracotta-200 text-terracotta-800"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {msg.sender === "USER" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div
                  className={cn(
                    "p-3.5 rounded-2xl max-w-[85%] sm:max-w-[78%] space-y-2 leading-relaxed shadow-xs",
                    msg.sender === "USER"
                      ? "bg-primary text-primary-foreground rounded-tr-xs"
                      : "bg-cream-100/90 text-foreground border border-border/70 rounded-tl-xs"
                  )}
                >
                  <p>{msg.content}</p>

                  {/* Referenced Evidence Chips with Natural Names */}
                  {msg.evidenceIds && msg.evidenceIds.length > 0 && (
                    <div className="pt-2 border-t border-border/40 space-y-1">
                      <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1">
                        <FileCheck className="w-3 h-3 text-primary" />
                        <span>参考依据:</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.evidenceIds.map((evId) => (
                          <button
                            key={evId}
                            type="button"
                            onClick={() => handleOpenEvidence(evId)}
                            className="px-2.5 py-1 rounded-xl bg-card text-foreground border border-border text-xs hover:border-primary transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                            aria-label={`查看依据: ${getEvidenceNaturalName(evId)}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span>{getEvidenceNaturalName(evId)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>

        {/* Suggested Quick Questions */}
        <div className="px-4 sm:px-6 py-2 bg-muted/20 border-t border-border/30 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-primary" />
            <span>你可以问:</span>
          </span>
          {[
            "核心学习方向是什么？",
            "业余生活有哪些兴趣？",
            "活跃时段有什么规律？",
            "技术与生活内容的比例？",
          ].map((qText) => (
            <button
              key={qText}
              type="button"
              onClick={() => handleSendMessage(qText)}
              className="px-2.5 py-1 rounded-xl bg-card border border-border/70 text-[11px] text-foreground hover:border-primary hover:bg-muted/60 transition-colors shrink-0 cursor-pointer"
            >
              {qText}
            </button>
          ))}
        </div>

        {/* Message Input Box */}
        <CardFooter className="p-3.5 sm:p-4 bg-card border-t border-border/40">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex gap-2 w-full"
          >
            <label htmlFor="qa-input-field" className="sr-only">
              针对示例报告提问
            </label>
            <Input
              id="qa-input-field"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="输入你想了解的问题，如：TA 最常关注哪些领域的博主？"
              aria-label="输入针对当前示例报告的问题"
              className="text-xs sm:text-sm bg-cream-100/80 border-border/80 rounded-2xl h-10 px-3.5"
            />
            <Button
              type="submit"
              disabled={!inputQuery.trim()}
              className="h-10 px-4 rounded-2xl text-xs gap-1.5 font-semibold shrink-0 cursor-pointer"
              aria-label="发送提问"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">发送</span>
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
