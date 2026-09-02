"use client";

import * as React from "react";
import {
  SELF_PROVIDED_FIELD_NAMES,
  SelfProvidedFieldName,
  SelfProvidedProfileResponse,
  UpdateSelfProfilePayload,
  ConsentScope,
} from "@/types/self-profile";
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

type EditableField = {
  value: string;
  allowedForAnalysis: boolean;
  consentScope: ConsentScope;
};

type EditableProfile = Record<SelfProvidedFieldName, EditableField>;

const TEXT_FIELDS: { key: SelfProvidedFieldName; label: string; placeholder: string }[] = [
  { key: "currentGoals", label: "当前目标", placeholder: "例如: 深入探索分布式系统架构" },
  { key: "careerOrMajor", label: "专业 / 职业方向", placeholder: "例如: 计算机科学 / 全栈工程师" },
  { key: "learningDirections", label: "学习方向（用逗号分隔）", placeholder: "例如: Rust, 系统设计, 机器学习" },
  { key: "interestTags", label: "兴趣标签（用逗号分隔）", placeholder: "例如: 开源技术, 独立开发, 咖啡文化" },
];

const CONSENT_FIELDS: { key: SelfProvidedFieldName; label: string }[] = [
  { key: "currentGoals", label: "当前目标" },
  { key: "careerOrMajor", label: "专业 / 职业方向" },
  { key: "learningDirections", label: "学习方向" },
  { key: "interestTags", label: "兴趣标签" },
];

export function SelfProfileForm() {
  const [localFields, setLocalFields] = React.useState<EditableProfile | null>(null);
  const [profileId, setProfileId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmedConsent, setConfirmedConsent] = React.useState(false);
  const [saveToast, setSaveToast] = React.useState<string | null>(null);
  const [isPurgeDialogOpen, setIsPurgeDialogOpen] = React.useState(false);

  const fetchProfile = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/self-profile", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`加载失败 (${res.status})`);
      }
      const data: SelfProvidedProfileResponse = await res.json();
      setProfileId(data.id);

      const mapped: EditableProfile = {} as EditableProfile;
      for (const name of SELF_PROVIDED_FIELD_NAMES) {
        const item = data.fields[name];
        mapped[name] = {
          value: item?.value ?? "",
          allowedForAnalysis: item?.allowedForAnalysis ?? true,
          consentScope: item?.consentScope ?? "PERSISTENT_ACROSS_TASKS",
        };
      }
      setLocalFields(mapped);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "加载自述信息失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const handleFieldChange = (field: SelfProvidedFieldName, value: string) => {
    setLocalFields((prev) =>
      prev ? { ...prev, [field]: { ...prev[field], value } } : prev
    );
  };

  const handleToggleAllowed = (field: SelfProvidedFieldName) => {
    setLocalFields((prev) =>
      prev
        ? { ...prev, [field]: { ...prev[field], allowedForAnalysis: !prev[field].allowedForAnalysis } }
        : prev
    );
  };

  const handleScopeChange = (field: SelfProvidedFieldName, consentScope: ConsentScope) => {
    setLocalFields((prev) =>
      prev ? { ...prev, [field]: { ...prev[field], consentScope } } : prev
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmedConsent || !localFields || saving) return;
    setSaving(true);
    try {
      const fields: UpdateSelfProfilePayload["fields"] = {};
      for (const name of SELF_PROVIDED_FIELD_NAMES) {
        fields[name] = {
          value: localFields[name].value,
          allowedForAnalysis: localFields[name].allowedForAnalysis,
          consentScope: localFields[name].consentScope,
        };
      }
      const res = await fetch("/api/self-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || `保存失败 (${res.status})`);
      }
      await fetchProfile();
      setSaveToast("已保存你的补充信息设置。");
      setTimeout(() => setSaveToast(null), 3500);
    } catch (e) {
      setSaveToast(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeFuture = async () => {
    try {
      const res = await fetch("/api/self-profile/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldName: "ALL" }),
      });
      if (!res.ok) {
        throw new Error(`操作失败 (${res.status})`);
      }
      await fetchProfile();
      setSaveToast("已停止后续分析使用。已有历史报告保持原样。");
      setTimeout(() => setSaveToast(null), 4000);
    } catch (e) {
      setSaveToast(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleConfirmPurge = async () => {
    try {
      const res = await fetch("/api/self-profile/purge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldName: "ALL" }),
      });
      if (!res.ok) {
        throw new Error(`操作失败 (${res.status})`);
      }
      await fetchProfile();
      setConfirmedConsent(false);
      setSaveToast("已删除这项信息及关联历史结果。");
      setTimeout(() => setSaveToast(null), 4000);
    } catch (e) {
      setSaveToast(e instanceof Error ? e.message : "操作失败");
    }
  };

  if (!localFields) {
    return (
      <div className="bg-card rounded-3xl p-8 border border-border/80 shadow-sm text-center text-xs text-muted-foreground">
        {loading ? "正在加载你的补充信息…" : (
          <div className="space-y-3">
            <p>加载失败：{loadError}</p>
            <button
              type="button"
              onClick={() => void fetchProfile()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 transition-colors cursor-pointer"
            >
              重试
            </button>
          </div>
        )}
      </div>
    );
  }

  const allEmpty = SELF_PROVIDED_FIELD_NAMES.every((n) => !localFields[n].value.trim());

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

          {allEmpty && (
            <p className="text-[11px] text-muted-foreground/80 px-3 py-2 rounded-xl bg-background/60 border border-border/50">
              你还没有填写任何补充信息；填写的内容仅用于你主动发起的分析。
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {TEXT_FIELDS.map(({ key, label, placeholder }) => {
              const field = localFields[key];
              return (
                <div
                  key={key}
                  className={
                    key === "learningDirections" || key === "interestTags"
                      ? "space-y-1.5 sm:col-span-2"
                      : "space-y-1.5"
                  }
                >
                  <label className="font-semibold text-foreground block">{label}</label>
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                  {!field.value.trim() && (
                    <p className="text-[11px] text-muted-foreground/70">未填写</p>
                  )}
                </div>
              );
            })}
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
            {CONSENT_FIELDS.map(({ key, label }) => {
              const field = localFields[key];
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
                      onChange={() => handleToggleAllowed(key)}
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
                      onChange={(e) => handleScopeChange(key, e.target.value as ConsentScope)}
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
              disabled={!confirmedConsent || saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "保存中…" : "保存补充信息设置"}</span>
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
              onClick={() => void handleRevokeFuture()}
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
          void handleConfirmPurge();
        }}
      />
    </div>
  );
}
