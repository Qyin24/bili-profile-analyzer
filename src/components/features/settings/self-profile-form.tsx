"use client";

import * as React from "react";
import { SelfProvidedProfile, ConsentScope } from "@/types/analysis";
import { useMockTask } from "@/lib/mock-task-context";
import { PrivacyActionDialog } from "./privacy-action-dialog";
import {
  Bookmark,
  CheckCircle2,
  Trash2,
  Save,
  ShieldCheck,
  RotateCcw,
  Sliders,
} from "lucide-react";

export function SelfProfileForm() {
  const {
    selfProfile,
    updateSelfProfile,
    revokeSelfProfileConsent,
    purgeSelfProfileAndDerivedData,
  } = useMockTask();

  const [localProfile, setLocalProfile] = React.useState<SelfProvidedProfile>(selfProfile);
  const [confirmedConsent, setConfirmedConsent] = React.useState(false);
  const [saveToast, setSaveToast] = React.useState<string | null>(null);
  const [isPurgeDialogOpen, setIsPurgeDialogOpen] = React.useState(false);

  React.useEffect(() => {
    setLocalProfile(selfProfile);
  }, [selfProfile]);

  const handleTextChange = (
    field: "currentGoals" | "careerOrMajor" | "additionalContext",
    value: string
  ) => {
    setLocalProfile((prev) => ({
      ...prev,
      [field]: { ...prev[field], value },
    }));
  };

  const handleArrayChange = (
    field: "learningDirections" | "interestTags" | "questionsForAnalysis",
    rawString: string
  ) => {
    const arr = rawString.split(",").map((s) => s.trim()).filter(Boolean);
    setLocalProfile((prev) => ({
      ...prev,
      [field]: { ...prev[field], value: arr },
    }));
  };

  const handleToggleAllowed = (field: keyof Omit<SelfProvidedProfile, "id" | "targetId" | "updatedAt">) => {
    setLocalProfile((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        allowedForAnalysis: !prev[field].allowedForAnalysis,
      },
    }));
  };

  const handleScopeChange = (
    field: keyof Omit<SelfProvidedProfile, "id" | "targetId" | "updatedAt">,
    consentScope: ConsentScope
  ) => {
    setLocalProfile((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        consentScope,
      },
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmedConsent) return;

    updateSelfProfile(localProfile);
    setSaveToast("设置演示预览已更新！");
    setTimeout(() => setSaveToast(null), 3500);
  };

  const handleRevokeFuture = () => {
    revokeSelfProfileConsent();
    setSaveToast("已停止后续分析使用。已有历史报告保持原样。");
    setTimeout(() => setSaveToast(null), 4000);
  };

  const handleConfirmPurge = () => {
    purgeSelfProfileAndDerivedData();
    setSaveToast("已删除这项信息！关联的历史分析报告已作废。");
    setTimeout(() => setSaveToast(null), 4000);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-6">
        {/* ========================================================================= */}
        {/* Group 1: 你补充的信息 */}
        {/* ========================================================================= */}
        <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border/40">
            <div className="w-7 h-7 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Bookmark className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">一、你补充的信息</h3>
              <p className="text-xs text-muted-foreground">主动填写的学习、兴趣与探索方向，用于生成更贴合的报告。</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground block">当前目标</label>
              <input
                type="text"
                value={localProfile.currentGoals.value}
                onChange={(e) => handleTextChange("currentGoals", e.target.value)}
                placeholder="例如: 深入探索分布式系统架构"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground block">专业 / 职业方向</label>
              <input
                type="text"
                value={localProfile.careerOrMajor.value}
                onChange={(e) => handleTextChange("careerOrMajor", e.target.value)}
                placeholder="例如: 计算机科学 / 全栈工程师"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-foreground block">
                学习方向（用逗号分隔）
              </label>
              <input
                type="text"
                value={localProfile.learningDirections.value.join(", ")}
                onChange={(e) => handleArrayChange("learningDirections", e.target.value)}
                placeholder="例如: Rust, 系统设计, 机器学习"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-foreground block">
                兴趣标签（用逗号分隔）
              </label>
              <input
                type="text"
                value={localProfile.interestTags.value.join(", ")}
                onChange={(e) => handleArrayChange("interestTags", e.target.value)}
                placeholder="例如: 开源技术, 独立开发, 咖啡文化"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
              />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Group 2: 分析使用范围 */}
        {/* ========================================================================= */}
        <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border/40">
            <div className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">二、分析使用范围</h3>
              <p className="text-xs text-muted-foreground">控制每项补充信息是否允许用于分析，以及单次与后续使用的范围。</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { key: "currentGoals", label: "当前目标" },
              { key: "careerOrMajor", label: "专业 / 职业方向" },
              { key: "learningDirections", label: "学习方向" },
              { key: "interestTags", label: "兴趣标签" },
            ].map(({ key, label }) => {
              const fieldKey = key as keyof Omit<SelfProvidedProfile, "id" | "targetId" | "updatedAt">;
              const field = localProfile[fieldKey];
              return (
                <div
                  key={key}
                  className="p-4 rounded-2xl bg-background/70 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`allow-${key}`}
                      checked={field.allowedForAnalysis}
                      onChange={() => handleToggleAllowed(fieldKey)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                    />
                    <label htmlFor={`allow-${key}`} className="font-semibold text-foreground cursor-pointer">
                      允许在分析中使用「{label}」
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pl-7 sm:pl-0">
                    <span className="text-[11px] text-muted-foreground">使用范围:</span>
                    <select
                      value={field.consentScope}
                      onChange={(e) => handleScopeChange(fieldKey, e.target.value as ConsentScope)}
                      disabled={!field.allowedForAnalysis}
                      className="px-2.5 py-1 rounded-xl bg-card border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 cursor-pointer"
                    >
                      <option value="THIS_TASK_ONLY">仅用于这次分析</option>
                      <option value="PERSISTENT_ACROSS_TASKS">允许用于后续分析</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Explicit Confirmation Checkbox */}
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 space-y-2">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="explicit-consent"
                checked={confirmedConsent}
                onChange={(e) => setConfirmedConsent(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary mt-0.5 cursor-pointer"
              />
              <label htmlFor="explicit-consent" className="text-xs text-foreground font-medium leading-relaxed cursor-pointer">
                我确认并授权上述勾选的信息仅在声明的使用范围内用于内容偏好分析解读。
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!confirmedConsent}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存补充信息设置</span>
            </button>

            {saveToast && (
              <span className="text-xs text-primary font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{saveToast}</span>
              </span>
            )}
          </div>
        </div>
      </form>

      {/* ========================================================================= */}
      {/* Group 3: 数据与隐私 */}
      {/* ========================================================================= */}
      <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-border/40">
          <div className="w-7 h-7 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">三、数据与隐私</h3>
            <p className="text-xs text-muted-foreground">管理补充信息的撤回与永久删除操作。</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Action 1: Revoke */}
          <div className="p-5 rounded-2xl bg-background/80 border border-border/70 space-y-3 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="font-bold text-foreground flex items-center gap-1.5 text-xs sm:text-sm">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>停止以后使用 (Revoke)</span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                停止这项信息在未来的任何新分析中使用。已生成的历史报告不会受到影响。
              </p>
            </div>

            <button
              type="button"
              onClick={handleRevokeFuture}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 transition-colors cursor-pointer w-full"
            >
              <span>停止以后使用</span>
            </button>
          </div>

          {/* Action 2: Purge */}
          <div className="p-5 rounded-2xl bg-destructive/5 border border-destructive/20 space-y-3 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="font-bold text-destructive flex items-center gap-1.5 text-xs sm:text-sm">
                <Trash2 className="w-4 h-4 text-destructive" />
                <span>删除这项信息及相关历史结果 (Purge)</span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                彻底删除此项补充信息。所有依赖此信息的已有历史报告将立即作废。
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsPurgeDialogOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-xs cursor-pointer w-full"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>彻底删除这项信息</span>
            </button>
          </div>
        </div>
      </div>

      {/* Accessible Confirmation Dialog */}
      <PrivacyActionDialog
        isOpen={isPurgeDialogOpen}
        onClose={() => setIsPurgeDialogOpen(false)}
        onConfirm={() => {
          setIsPurgeDialogOpen(false);
          handleConfirmPurge();
        }}
      />
    </div>
  );
}
