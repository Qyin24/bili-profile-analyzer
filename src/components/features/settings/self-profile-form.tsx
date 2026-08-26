"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SelfProvidedProfileResponse,
  SelfProvidedFieldName,
  ConsentScope,
  SELF_PROVIDED_FIELD_NAMES,
} from "@/types/self-profile";
import { PrivacyActionDialog } from "./privacy-action-dialog";
import {
  UserCheck,
  ShieldAlert,
  Save,
  Lock,
  Trash2,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  AlertCircle,
} from "lucide-react";

export function SelfProfileForm() {
  const [profile, setProfile] = React.useState<SelfProvidedProfileResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [activeDialog, setActiveDialog] = React.useState<"REVOKE_FUTURE" | "PURGE_DATA" | null>(null);
  const [isProcessingAction, setIsProcessingAction] = React.useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = React.useState<{ text: string; isError?: boolean } | null>(null);

  const showFeedback = (text: string, isError = false) => {
    setFeedbackMessage({ text, isError });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const fetchProfile = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/self-profile");
      if (!res.ok) throw new Error("获取配置失败");
      const data: SelfProvidedProfileResponse = await res.json();
      setProfile(data);
    } catch {
      showFeedback("无法连接本地数据库读取个人说明", true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleUpdateFieldValue = (name: SelfProvidedFieldName, value: string) => {
    if (!profile) return;
    setProfile((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [name]: {
            ...prev.fields[name],
            value,
          },
        },
      };
    });
  };

  const handleUpdateFieldAllowed = (name: SelfProvidedFieldName, allowed: boolean) => {
    if (!profile) return;
    setProfile((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [name]: {
            ...prev.fields[name],
            allowedForAnalysis: allowed,
          },
        },
      };
    });
  };

  const handleUpdateFieldScope = (name: SelfProvidedFieldName, scope: ConsentScope) => {
    if (!profile) return;
    setProfile((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [name]: {
            ...prev.fields[name],
            consentScope: scope,
          },
        },
      };
    });
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    try {
      setIsSaving(true);
      const payload = {
        fields: Object.fromEntries(
          SELF_PROVIDED_FIELD_NAMES.map((name) => [
            name,
            {
              value: profile.fields[name]?.value || "",
              allowedForAnalysis: profile.fields[name]?.allowedForAnalysis ?? true,
              consentScope: profile.fields[name]?.consentScope ?? "PERSISTENT_ACROSS_TASKS",
            },
          ])
        ),
      };

      const res = await fetch("/api/self-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("保存失败");
      const updated: SelfProvidedProfileResponse = await res.json();
      setProfile(updated);
      showFeedback("已成功保存至本地 SQLite 数据库！");
    } catch {
      showFeedback("保存失败，请检查数据库状态", true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmAction = async () => {
    try {
      setIsProcessingAction(true);
      if (activeDialog === "REVOKE_FUTURE") {
        const res = await fetch("/api/self-profile/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldName: "ALL" }),
        });
        if (!res.ok) throw new Error("撤回失败");
        showFeedback("已停止所有个人说明的未来分析使用（历史快照已保留）");
      } else if (activeDialog === "PURGE_DATA") {
        const res = await fetch("/api/self-profile/purge", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldName: "ALL" }),
        });
        if (!res.ok) throw new Error("清除失败");
        const data = await res.json();
        showFeedback(`已彻底清除个人说明及关联历史快照（影响 ${data.affectedTasksCount} 个历史任务）`);
      }
      await fetchProfile();
    } catch {
      showFeedback("操作执行失败", true);
    } finally {
      setIsProcessingAction(false);
      setActiveDialog(null);
    }
  };

  if (isLoading || !profile) {
    return (
      <Card className="border-border/80 bg-card rounded-3xl p-10 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="text-xs text-muted-foreground">正在读取本地自述信息与授权状态...</span>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PrivacyActionDialog
        actionType={activeDialog}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleConfirmAction}
        isProcessing={isProcessingAction}
      />

      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 right-4 z-50 p-4 rounded-2xl text-xs shadow-warm-lg flex items-center gap-2 border animate-in fade-in slide-in-from-top-3 duration-200 ${
            feedbackMessage.isError
              ? "bg-rose-900 text-white border-rose-700"
              : "bg-sage-800 text-white border-sage-600"
          }`}
        >
          {feedbackMessage.isError ? (
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-sage-200 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Form Master Card */}
      <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
        <CardHeader className="p-5 sm:p-7 pb-4 border-b border-border/40 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                  <UserCheck className="w-4 h-4" />
                </div>
                <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                  个人说明与授权设置
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                信息仅保存在当前设备的本地 SQLite 数据库，用于后续分析生成不可变快照，可随时停止使用或彻底删除。
              </CardDescription>
            </div>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 self-start sm:self-auto">
              <Clock className="w-3.5 h-3.5" />
              <span>本地更新时间: {new Date(profile.updatedAt).toLocaleString()}</span>
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-7 space-y-5">
          {/* Notice Banner */}
          <div className="p-3.5 rounded-2xl bg-sage-50/90 border border-sage-200/80 text-xs text-sage-900 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              <strong>本地隐私承诺</strong>：填写的内容仅存储在本机本地数据库，不会上传至任何云端服务器；创建分析任务时会复制为不可变的任务快照。
            </span>
          </div>

          {/* Field 1: currentGoals */}
          <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="field-goals-input" className="text-xs font-bold text-foreground">
                1. 当前想完成的事 (currentGoals)
              </label>
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="field-goals-allowed" className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="field-goals-allowed"
                    checked={profile.fields.currentGoals.allowedForAnalysis}
                    onChange={(e) => handleUpdateFieldAllowed("currentGoals", e.target.checked)}
                    className="w-3.5 h-3.5 text-primary rounded accent-primary cursor-pointer"
                  />
                  <span className="text-muted-foreground text-[11px]">允许用于分析</span>
                </label>
                <select
                  id="field-goals-scope"
                  aria-label="主要目标使用范围"
                  value={profile.fields.currentGoals.consentScope}
                  onChange={(e) => handleUpdateFieldScope("currentGoals", e.target.value as ConsentScope)}
                  className="bg-card border border-border rounded-xl text-[11px] px-2.5 py-1 text-foreground"
                >
                  <option value="PERSISTENT_ACROSS_TASKS">用于之后的分析</option>
                  <option value="THIS_TASK_ONLY">只用于下次分析</option>
                </select>
              </div>
            </div>
            <Input
              id="field-goals-input"
              value={profile.fields.currentGoals.value}
              onChange={(e) => handleUpdateFieldValue("currentGoals", e.target.value)}
              aria-label="当前想完成的事"
              placeholder="例如：梳理近期的科技学习脉络，构建系统化的 AI 知识体系"
              className="text-xs sm:text-sm bg-card rounded-xl"
            />
          </div>

          {/* Field 2: learningDirections */}
          <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="field-directions-input" className="text-xs font-bold text-foreground">
                2. 学习或关注方向 (learningDirections)
              </label>
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="field-directions-allowed" className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="field-directions-allowed"
                    checked={profile.fields.learningDirections.allowedForAnalysis}
                    onChange={(e) => handleUpdateFieldAllowed("learningDirections", e.target.checked)}
                    className="w-3.5 h-3.5 text-primary rounded accent-primary cursor-pointer"
                  />
                  <span className="text-muted-foreground text-[11px]">允许用于分析</span>
                </label>
                <select
                  id="field-directions-scope"
                  aria-label="学习方向使用范围"
                  value={profile.fields.learningDirections.consentScope}
                  onChange={(e) => handleUpdateFieldScope("learningDirections", e.target.value as ConsentScope)}
                  className="bg-card border border-border rounded-xl text-[11px] px-2.5 py-1 text-foreground"
                >
                  <option value="PERSISTENT_ACROSS_TASKS">用于之后的分析</option>
                  <option value="THIS_TASK_ONLY">只用于下次分析</option>
                </select>
              </div>
            </div>
            <Input
              id="field-directions-input"
              value={profile.fields.learningDirections.value}
              onChange={(e) => handleUpdateFieldValue("learningDirections", e.target.value)}
              placeholder="例如：大模型应用架构、全栈工程、数据可视化、系统设计"
              aria-label="学习或关注方向"
              className="text-xs sm:text-sm bg-card rounded-xl"
            />
          </div>

          {/* Field 3: careerOrMajor */}
          <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="field-career-input" className="text-xs font-bold text-foreground">
                3. 专业或职业背景 (careerOrMajor)
              </label>
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="field-career-allowed" className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="field-career-allowed"
                    checked={profile.fields.careerOrMajor.allowedForAnalysis}
                    onChange={(e) => handleUpdateFieldAllowed("careerOrMajor", e.target.checked)}
                    className="w-3.5 h-3.5 text-primary rounded accent-primary cursor-pointer"
                  />
                  <span className="text-muted-foreground text-[11px]">允许用于分析</span>
                </label>
                <select
                  id="field-career-scope"
                  aria-label="职业背景使用范围"
                  value={profile.fields.careerOrMajor.consentScope}
                  onChange={(e) => handleUpdateFieldScope("careerOrMajor", e.target.value as ConsentScope)}
                  className="bg-card border border-border rounded-xl text-[11px] px-2.5 py-1 text-foreground"
                >
                  <option value="PERSISTENT_ACROSS_TASKS">用于之后的分析</option>
                  <option value="THIS_TASK_ONLY">只用于下次分析</option>
                </select>
              </div>
            </div>
            <Input
              id="field-career-input"
              value={profile.fields.careerOrMajor.value}
              onChange={(e) => handleUpdateFieldValue("careerOrMajor", e.target.value)}
              placeholder="例如：软件工程师 / 终身学习者"
              aria-label="专业或职业背景"
              className="text-xs sm:text-sm bg-card rounded-xl"
            />
          </div>

          {/* Field 4: interestTags */}
          <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="field-interest-input" className="text-xs font-bold text-foreground">
                4. 兴趣标签 (interestTags)
              </label>
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="field-interest-allowed" className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="field-interest-allowed"
                    checked={profile.fields.interestTags.allowedForAnalysis}
                    onChange={(e) => handleUpdateFieldAllowed("interestTags", e.target.checked)}
                    className="w-3.5 h-3.5 text-primary rounded accent-primary cursor-pointer"
                  />
                  <span className="text-muted-foreground text-[11px]">允许用于分析</span>
                </label>
                <select
                  id="field-interest-scope"
                  aria-label="兴趣标签使用范围"
                  value={profile.fields.interestTags.consentScope}
                  onChange={(e) => handleUpdateFieldScope("interestTags", e.target.value as ConsentScope)}
                  className="bg-card border border-border rounded-xl text-[11px] px-2.5 py-1 text-foreground"
                >
                  <option value="PERSISTENT_ACROSS_TASKS">用于之后的分析</option>
                  <option value="THIS_TASK_ONLY">只用于下次分析</option>
                </select>
              </div>
            </div>
            <Input
              id="field-interest-input"
              value={profile.fields.interestTags.value}
              onChange={(e) => handleUpdateFieldValue("interestTags", e.target.value)}
              placeholder="用逗号分隔，如：开源生态, 开发者工具, 人工智能, 界面美学"
              aria-label="兴趣标签"
              className="text-xs sm:text-sm bg-card rounded-xl"
            />
          </div>

          {/* Field 5: questionsForAnalysis */}
          <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="field-questions-input" className="text-xs font-bold text-foreground">
                5. 希望重点了解的问题 (questionsForAnalysis)
              </label>
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="field-questions-allowed" className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="field-questions-allowed"
                    checked={profile.fields.questionsForAnalysis.allowedForAnalysis}
                    onChange={(e) => handleUpdateFieldAllowed("questionsForAnalysis", e.target.checked)}
                    className="w-3.5 h-3.5 text-primary rounded accent-primary cursor-pointer"
                  />
                  <span className="text-muted-foreground text-[11px]">允许用于分析</span>
                </label>
                <select
                  id="field-questions-scope"
                  aria-label="重点问题使用范围"
                  value={profile.fields.questionsForAnalysis.consentScope}
                  onChange={(e) => handleUpdateFieldScope("questionsForAnalysis", e.target.value as ConsentScope)}
                  className="bg-card border border-border rounded-xl text-[11px] px-2.5 py-1 text-foreground"
                >
                  <option value="PERSISTENT_ACROSS_TASKS">用于之后的分析</option>
                  <option value="THIS_TASK_ONLY">只用于下次分析</option>
                </select>
              </div>
            </div>
            <Input
              id="field-questions-input"
              value={profile.fields.questionsForAnalysis.value}
              onChange={(e) => handleUpdateFieldValue("questionsForAnalysis", e.target.value)}
              placeholder="例如：我的内容关注重点是否过度集中？有哪些前沿方向值得拓展？"
              aria-label="希望重点了解的问题"
              className="text-xs sm:text-sm bg-card rounded-xl"
            />
          </div>

          {/* Field 6: additionalContext */}
          <div className="p-4 rounded-2xl bg-cream-100/90 border border-border/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="field-context-input" className="text-xs font-bold text-foreground">
                6. 其他想补充的内容 (additionalContext)
              </label>
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="field-context-allowed" className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="field-context-allowed"
                    checked={profile.fields.additionalContext.allowedForAnalysis}
                    onChange={(e) => handleUpdateFieldAllowed("additionalContext", e.target.checked)}
                    className="w-3.5 h-3.5 text-primary rounded accent-primary cursor-pointer"
                  />
                  <span className="text-muted-foreground text-[11px]">允许用于分析</span>
                </label>
                <select
                  id="field-context-scope"
                  aria-label="补充说明使用范围"
                  value={profile.fields.additionalContext.consentScope}
                  onChange={(e) => handleUpdateFieldScope("additionalContext", e.target.value as ConsentScope)}
                  className="bg-card border border-border rounded-xl text-[11px] px-2.5 py-1 text-foreground"
                >
                  <option value="PERSISTENT_ACROSS_TASKS">用于之后的分析</option>
                  <option value="THIS_TASK_ONLY">只用于下次分析</option>
                </select>
              </div>
            </div>

            <textarea
              id="field-context-input"
              value={profile.fields.additionalContext.value}
              onChange={(e) => handleUpdateFieldValue("additionalContext", e.target.value)}
              rows={2}
              aria-label="其他想补充的内容"
              placeholder="例如：用于本地学习偏好探索，不包含私密敏感数据..."
              className="w-full rounded-2xl border border-border bg-card p-3 text-xs sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            {/* Privacy Alert Banner */}
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 text-xs leading-relaxed flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>⚠️ 隐私安全提示</strong>：请勿填写身份证号、精准住址、密码/Token、医疗健康状况或未经他人授权的隐私信息。
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveDialog("REVOKE_FUTURE")}
                className="text-xs gap-1.5 rounded-xl cursor-pointer"
                aria-label="停止以后使用"
              >
                <Lock className="w-3.5 h-3.5 text-amber-700" />
                <span>停止以后使用</span>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setActiveDialog("PURGE_DATA")}
                className="text-xs gap-1.5 rounded-xl cursor-pointer"
                aria-label="彻底删除所有个人说明与快照"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>彻底删除个人说明与快照</span>
              </Button>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="text-xs gap-1.5 rounded-xl shadow-xs cursor-pointer font-semibold"
              aria-label="保存到本地数据库"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>保存到本地数据库</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
