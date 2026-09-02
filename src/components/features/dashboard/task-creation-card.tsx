"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskSummaryResponse } from "@/types/task-api";
import {
  PlusCircle,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  mapHttpErrorToSafeMessage,
  mapNetworkErrorToSafeMessage,
} from "@/lib/ui-error-mapper";
import { useAiConfig } from "@/lib/ai-config-context";

interface TaskCreationCardProps {
  onTaskCreated?: (task: TaskSummaryResponse) => void;
}

export function TaskCreationCard({ onTaskCreated }: TaskCreationCardProps) {
  const { aiConfig } = useAiConfig();
  const [rawInput, setRawInput] = React.useState("");
  const [displayNameInput, setDisplayNameInput] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [hasSelfProfileFields, setHasSelfProfileFields] = React.useState(false);
  const [selfProvidedConsentConfirmed, setSelfProvidedConsentConfirmed] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [showConsentHelp, setShowConsentHelp] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const activeRequestIdRef = React.useRef<number>(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const refreshSelfProfileStatus = React.useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestId = ++activeRequestIdRef.current;

    try {
      const res = await fetch("/api/self-profile", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (activeRequestIdRef.current !== requestId) return;

      if (res.ok) {
        const data = await res.json();
        if (activeRequestIdRef.current !== requestId) return;

        const active = Boolean(data?.hasAllowedFieldsForAnalysis);
        setHasSelfProfileFields(active);
        if (!active) {
          setSelfProvidedConsentConfirmed(false);
        }
      }
    } catch {
      // Ignore background check failure
    }
  }, []);

  // Check on mount if user has active self-profile fields
  React.useEffect(() => {
    refreshSelfProfileStatus();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [refreshSelfProfileStatus]);

  /**
   * Strictly validates and extracts numeric UID:
   * Accepts:
   *  1. Pure digits: e.g. "202688"
   *  2. Valid space link: e.g. "https://space.bilibili.com/202688", "space.bilibili.com/202688/dynamic"
   * Rejects:
   *  Arbitrary strings, fake domains, incomplete URLs, negative numbers
   */
  const extractAndValidateUid = (
    input: string
  ): { valid: true; uid: string } | { valid: false; reason: string } => {
    const trimmed = input.trim();
    if (!trimmed) {
      return { valid: false, reason: "请输入 B 站 UID 或个人空间链接。" };
    }

    // 1. Pure numeric UID
    if (/^\d+$/.test(trimmed)) {
      return { valid: true, uid: trimmed };
    }

    // 2. Strict space.bilibili.com/<uid> pattern
    const spaceRegex = /^(?:https?:\/\/)?(?:www\.)?space\.bilibili\.com\/(\d+)(?:\/.*)?$/i;
    const match = trimmed.match(spaceRegex);
    if (match && match[1]) {
      return { valid: true, uid: match[1] };
    }

    return {
      valid: false,
      reason: "请输入合法的纯数字 UID 或哔哩哔哩个人空间链接（例如 space.bilibili.com/202688）。",
    };
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setShowConsentHelp(false);
    setSuccessMessage(null);

    const validation = extractAndValidateUid(rawInput);
    if (!validation.valid) {
      setErrorMessage(validation.reason);
      return;
    }

    const platformUid = validation.uid;
    setIsSubmitting(true);

    try {
      const payload = {
        platformUid,
        displayName: displayNameInput.trim() || `用户 (${platformUid})`,
        // Strict Fail-Closed Authorization: Always submit the actual user consent state
        selfProvidedConsentConfirmed: selfProvidedConsentConfirmed,
      };

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const safeErr = mapHttpErrorToSafeMessage(res.status, data?.error?.code);
        if (safeErr.isConsentRequired) {
          setShowConsentHelp(true);
          // Re-fetch self-profile status immediately to recover genuine checkbox UI state
          await refreshSelfProfileStatus();
        }
        setErrorMessage(safeErr.message);
        return;
      }

      // Task Created
      const createdTask: TaskSummaryResponse = data;
      setRawInput("");
      setDisplayNameInput("");
      onTaskCreated?.(createdTask);
      setSuccessMessage(`分析任务已创建，正在执行分析流程...`);

      // Re-fetch self profile status in case THIS_TASK_ONLY fields were consumed
      await refreshSelfProfileStatus();

      // Trigger automatic execution
      try {
        const execPayload: {
          provider?: string;
          config?: { apiBaseUrl: string; apiKey: string; model: string };
        } = {};

        if (aiConfig.isConfigured && aiConfig.apiKey) {
          execPayload.provider = "OPENAI_COMPATIBLE";
          execPayload.config = {
            apiBaseUrl: aiConfig.apiBaseUrl,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
          };
        } else {
          execPayload.provider = "MOCK";
        }

        const execRes = await fetch(`/api/tasks/${createdTask.id}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(execPayload),
        });

        if (execRes.ok) {
          const completedTask: TaskSummaryResponse = await execRes.json();
          onTaskCreated?.(completedTask);
          setSuccessMessage(`分析已执行完成，可在下方查看结果或点击「查看报告」。`);
        } else {
          const execData = await execRes.json().catch(() => null);
          const safeErr = mapHttpErrorToSafeMessage(execRes.status, execData?.error?.code);
          setErrorMessage(safeErr.message);
        }
      } catch (execErr: unknown) {
        const safeErr = mapNetworkErrorToSafeMessage(execErr);
        if (safeErr) {
          setErrorMessage(safeErr.message);
        }
      }
    } catch (err: unknown) {
      const safeErr = mapNetworkErrorToSafeMessage(err);
      if (safeErr) {
        setErrorMessage(safeErr.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
      <CardHeader className="p-5 sm:p-7 pb-4 border-b border-border/40 bg-gradient-to-br from-cream-100/90 via-card to-sage-50/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs shrink-0">
                <PlusCircle className="w-4 h-4" />
              </div>
              <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                发起新分析
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed break-words">
              输入目标 UID 或个人空间链接，在本地创建一份分析记录。
            </p>
          </div>
          <span className="self-start sm:self-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cream-200 text-foreground text-[11px] font-medium border border-border/60 shrink-0">
            <ShieldCheck className="w-3 h-3 text-primary" />
            <span>本地保存</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-7 space-y-4">
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Target UID / URL Input */}
            <div className="space-y-1 min-w-0">
              <label
                htmlFor="target-uid-input"
                className="text-xs font-semibold text-foreground block cursor-pointer"
              >
                目标 UID 或空间链接 *
              </label>
              <p className="text-[11px] text-muted-foreground">
                支持纯数字或 space 空间主页链接
              </p>
              <Input
                id="target-uid-input"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="例如：202688"
                className="text-xs sm:text-sm bg-cream-100/70 rounded-xl w-full"
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Display Name Input */}
            <div className="space-y-1 min-w-0">
              <label
                htmlFor="target-name-input"
                className="text-xs font-semibold text-foreground block cursor-pointer"
              >
                显示名称（可选）
              </label>
              <p className="text-[11px] text-muted-foreground">
                便于识别的备注名称
              </p>
              <Input
                id="target-name-input"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                placeholder="例如：技术博主研究样本"
                className="text-xs sm:text-sm bg-cream-100/70 rounded-xl w-full"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Self-Profile Consent Confirmation Checkbox */}
          {hasSelfProfileFields && (
            <div className="p-3.5 rounded-2xl bg-cream-100/90 border border-border/80 space-y-2">
              <div className="space-y-1.5">
                <p className="text-xs text-foreground font-medium">
                  你已选择允许使用部分个人说明。本次分析前需要再次确认。
                </p>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="self-consent-checkbox"
                    checked={selfProvidedConsentConfirmed}
                    onChange={(e) => setSelfProvidedConsentConfirmed(e.target.checked)}
                    disabled={isSubmitting}
                    className="w-4 h-4 mt-0.5 text-primary rounded accent-primary cursor-pointer"
                  />
                  <label
                    htmlFor="self-consent-checkbox"
                    className="text-xs text-foreground font-medium leading-relaxed cursor-pointer select-none"
                  >
                    我确认有权提供，并授权本次使用这些个人说明。
                  </label>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1 pl-6 leading-relaxed">
                <UserCheck className="w-3 h-3 text-primary shrink-0" />
                <span>已在设置中开启个人说明。若不希望使用，可在</span>
                <Link
                  href="/settings"
                  className="text-primary hover:underline inline-flex items-center gap-0.5 font-medium"
                >
                  <span>设置页面</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
                <span>关闭或撤回授权。</span>
              </div>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1.5 animate-in fade-in duration-200"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>创建失败</span>
              </div>
              <p className="leading-relaxed pl-5.5">{errorMessage}</p>
              {showConsentHelp && (
                <div className="pl-5.5 pt-1">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/15"
                  >
                    <Link href="/settings">
                      <span>前往设置页面调整自述信息</span>
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Success Message Alert */}
          {successMessage && (
            <div
              role="status"
              className="p-3.5 rounded-2xl bg-sage-50 border border-sage-200 text-sage-900 text-xs space-y-1 flex items-start gap-2 animate-in fade-in duration-200"
            >
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold block">任务创建成功</span>
                <p className="text-sage-800 leading-relaxed">{successMessage}</p>
              </div>
            </div>
          )}

          {/* AI Engine Selection Indicator */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-cream-100/90 border border-border/80 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-foreground">AI 分析引擎：</span>
                {aiConfig.provider === "OPENAI_COMPATIBLE" && aiConfig.isConfigured ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    已接入自定义 AI ({aiConfig.model})
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    基础分析（内置，无需 API Key）
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/settings"
              className="text-primary hover:underline inline-flex items-center gap-0.5 text-xs font-semibold shrink-0 ml-2"
            >
              <span>{aiConfig.isConfigured ? "管理配置" : "配置 API Key"}</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          {/* Submit Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <span className="text-[11px] text-muted-foreground">
              新建任务将自动采集公开数据并生成报告。
            </span>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto rounded-xl text-xs gap-1.5 shadow-xs font-semibold cursor-pointer shrink-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在创建...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>创建分析任务</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
