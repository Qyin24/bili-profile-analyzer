"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { SelfProfileForm } from "@/components/features/settings/self-profile-form";
import { AiConfigForm } from "@/components/features/settings/ai-config-form";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { useMockTask } from "@/lib/mock-task-context";

export default function SettingsPage() {
  const { resetDemoTask } = useMockTask();
  const [resetMessage, setResetMessage] = React.useState<string | null>(null);

  const handleResetTask = () => {
    resetDemoTask();
    setResetMessage("演示任务状态已成功恢复！");
    setTimeout(() => setResetMessage(null), 3000);
  };

  return (
    <AppLayout
      headerTitle="设置"
      headerSubtitle="管理你的自述信息、AI 模型接口与数据隐私。"
      showNewAnalysisButton
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* OpenAI-compatible AI Config Form */}
        <AiConfigForm />

        {/* Self Profile Form */}
        <SelfProfileForm />

        {/* Demo Content Notice Card */}
        <div className="bg-card rounded-3xl p-6 sm:p-7 border border-border/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-foreground">
            <RefreshCw className="w-4 h-4 text-primary" />
            <span>演示内容说明</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            当前修改仅用于演示预览；刷新页面后会恢复示例内容。点击下方按钮可随时恢复初始演示状态。
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetTask}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>恢复初始演示状态</span>
            </button>

            {resetMessage && (
              <p className="text-xs text-primary font-medium">{resetMessage}</p>
            )}
          </div>
        </div>

        {/* Privacy Notice Card */}
        <div className="bg-card rounded-3xl p-6 sm:p-7 border border-border/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>隐私说明 (演示)</span>
          </div>
          <ul className="space-y-2.5 text-xs text-muted-foreground">
            <li className="p-3.5 rounded-2xl bg-background/60 border border-border/50 space-y-1">
              <span className="font-bold text-foreground">演示原始样本会按规则清理：</span>
              <p className="leading-relaxed text-[11px]">
                用于分析的演示原始记录会定期清理；报告引用的必要依据会作为快照保留，用于回看说明。
              </p>
            </li>
            <li className="p-3.5 rounded-2xl bg-background/60 border border-border/50 space-y-1">
              <span className="font-bold text-foreground">支持停止以后使用与删除历史：</span>
              <p className="leading-relaxed text-[11px]">
                支持“停止以后使用”，或“删除相关自述与历史结果”（演示模式下将作废当前关联的示例报告）。
              </p>
            </li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
