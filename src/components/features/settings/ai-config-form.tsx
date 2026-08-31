"use client";

import * as React from "react";
import { useAiConfig } from "@/lib/ai-config-context";
import {
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Trash2,
  Save,
  ShieldCheck,
  Server,
  Cpu,
} from "lucide-react";

export function AiConfigForm() {
  const { aiConfig, applyAiConfig, clearAiConfig } = useAiConfig();

  const [baseUrl, setBaseUrl] = React.useState(aiConfig.apiBaseUrl);
  const [apiKey, setApiKey] = React.useState(aiConfig.apiKey);
  const [model, setModel] = React.useState(aiConfig.model);
  const [showKey, setShowKey] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setBaseUrl(aiConfig.apiBaseUrl);
    setApiKey(aiConfig.apiKey);
    setModel(aiConfig.model);
  }, [aiConfig]);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const result = applyAiConfig({
      apiBaseUrl: baseUrl,
      apiKey,
      model,
    });

    if (result.success) {
      setToastMessage("AI API 配置已临时应用到当前会话！");
      setTimeout(() => setToastMessage(null), 3500);
    } else {
      setErrorMessage(result.error || "配置参数有误，请检查输入。");
    }
  };

  const handleClear = () => {
    clearAiConfig();
    setBaseUrl("https://api.openai.com/v1");
    setApiKey("");
    setModel("gpt-4o-mini");
    setErrorMessage(null);
    setToastMessage("已清除临时 AI API 配置，恢复默认内置 Mock。");
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="bg-card rounded-3xl p-6 sm:p-8 border border-border/80 shadow-warm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              自带 AI API 配置 (OpenAI-compatible)
            </h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            支持接入任意兼容 OpenAI Chat Completions 规范的 API 服务（如 OpenAI、DeepSeek、Qwen、Ollama 等）。
          </p>
        </div>

        <div>
          {aiConfig.isConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>已临时配置</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border/60">
              <span>默认内置 Mock</span>
            </span>
          )}
        </div>
      </div>

      {/* Security Banner */}
      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>API Key 仅存在于当前浏览标签页内存中</span>
        </div>
        <p className="leading-relaxed text-[11px]">
          为保障你的凭证安全，API Key 绝不写入数据库、本地存储 (localStorage/Cookie) 或持久化文件。刷新页面或关闭标签页后自动失效。
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleApply} className="space-y-4">
        {/* API Base URL */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-muted-foreground" />
            <span>API Base URL</span>
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-background border border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            服务接口根地址，如 <code>https://api.openai.com/v1</code> 或 <code>https://api.deepseek.com</code>。
          </p>
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
            <span>API Key</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl text-xs bg-background border border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              title={showKey ? "隐藏 API Key" : "显示 API Key"}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Model Name */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
            <span>模型名称 (Model)</span>
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-background border border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            如 <code>gpt-4o-mini</code>, <code>deepseek-chat</code>, <code>qwen-plus</code> 等。
          </p>
        </div>

        {/* Errors & Toasts */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {toastMessage && (
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 text-xs font-medium">
            {toastMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>临时应用配置</span>
          </button>

          {aiConfig.isConfigured && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清除临时配置</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
