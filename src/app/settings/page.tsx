"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { SelfProfileForm } from "@/components/features/settings/self-profile-form";
import { AiConfigForm } from "@/components/features/settings/ai-config-form";
import { ShieldCheck } from "lucide-react";

export default function SettingsPage() {
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

        {/* Privacy Notice Card */}
        <div className="bg-card rounded-3xl p-6 sm:p-7 border border-border/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>隐私说明</span>
          </div>
          <ul className="space-y-2.5 text-xs text-muted-foreground">
            <li className="p-3.5 rounded-2xl bg-background/60 border border-border/50 space-y-1">
              <span className="font-bold text-foreground">原始样本会按规则清理：</span>
              <p className="leading-relaxed text-[11px]">
                用于分析的原始记录会定期清理；报告引用的必要依据会作为快照保留，用于回看说明。
              </p>
            </li>
            <li className="p-3.5 rounded-2xl bg-background/60 border border-border/50 space-y-1">
              <span className="font-bold text-foreground">支持停止以后使用与删除历史：</span>
              <p className="leading-relaxed text-[11px]">
                支持“停止以后使用”，或“删除相关自述与历史结果”，相应数据会被清除以保护你的隐私。
              </p>
            </li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
