"use client";

import * as React from "react";
import { useAiConfig } from "@/lib/ai-config-context";
import { AiProviderType } from "@/types/ai-analysis";
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
  Radio,
  Loader2,
  AlertCircle,
  Activity,
} from "lucide-react";

export function AiConfigForm() {
  const { aiConfig, applyAiConfig, clearAiConfig } = useAiConfig();

  const [provider, setProvider] = React.useState<AiProviderType>(aiConfig.provider || "OPENAI_COMPATIBLE");
  const [baseUrl, setBaseUrl] = React.useState(aiConfig.apiBaseUrl || "https://api.openai.com/v1");
  const [apiKey, setApiKey] = React.useState(aiConfig.apiKey || "");
  const [model, setModel] = React.useState(aiConfig.model || "gpt-4o-mini");
  const [showKey, setShowKey] = React.useState(false);

  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setProvider(aiConfig.provider || "OPENAI_COMPATIBLE");
    setBaseUrl(aiConfig.apiBaseUrl || "https://api.openai.com/v1");
    setApiKey(aiConfig.apiKey || "");
    setModel(aiConfig.model || "gpt-4o-mini");
  }, [aiConfig]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setTestResult(null);

    const result = applyAiConfig({
      provider,
      apiBaseUrl: baseUrl,
      apiKey,
      model,
    });

    if (result.success) {
      setToastMessage("AI 配置已保存，后续分析将使用该配置。");
      setTimeout(() => setToastMessage(null), 4000);
    } else {
      setErrorMessage(result.error || "配置参数有误，请检查输入。");
    }
  };

  const handleTestConnection = async () => {
    setErrorMessage(null);
    setToastMessage(null);
    setTestResult(null);

    if (provider === "MOCK") {
      setTestResult({
        success: true,
        message: "当前为基础分析（无需 API Key）模式，无需进行外部 API 连接测试。",
      });
      return;
    }

    if (!baseUrl.trim()) {
      setErrorMessage("请先输入 API 地址。");
      return;
    }
    if (!apiKey.trim()) {
      setErrorMessage("请先输入 API Key。");
      return;
    }
    if (!model.trim()) {
      setErrorMessage("请先输入模型名称。");
      return;
    }

    setIsTesting(true);

    try {
      const res = await fetch("/api/ai/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiBaseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setTestResult({
          success: true,
          message: data.message || "连接成功，可以使用该 AI 配置进行分析。",
        });
      } else {
        setTestResult({
          success: false,
          message: data?.error || "连接失败，请检查 API 地址、API Key 和模型名称。",
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: "无法连接到测试服务，请检查网络连接。",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClear = () => {
    clearAiConfig();
    setProvider("MOCK");
    setBaseUrl("https://api.openai.com/v1");
    setApiKey("");
    setModel("gpt-4o-mini");
    setErrorMessage(null);
    setTestResult(null);
    setToastMessage("已重置为默认的基础分析（无需 API Key）模式。");
    setTimeout(() => setToastMessage(null), 3500);
  };

  const isConfigured = aiConfig.isConfigured && (aiConfig.provider === "MOCK" || Boolean(aiConfig.apiKey));

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
              AI 分析设置
            </h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            配置你的 AI 服务提供方与 API 凭证，用于生成真实画像解读与行为洞察。
          </p>
        </div>

        <div>
          {isConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{aiConfig.provider === "MOCK" ? "基础分析（无需 API Key）" : "AI 服务已配置"}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border/60">
              <span>尚未配置 AI 服务</span>
            </span>
          )}
        </div>
      </div>

      {/* Security Banner */}
      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>凭证仅保存在当前浏览会话内存中</span>
        </div>
        <p className="leading-relaxed text-[11px]">
          为保障你的凭证安全，API Key 绝不写入数据库明文或外部存储。所有 AI 请求均由本服务后端转发，浏览器不会直接暴露 Secret。
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-4">
        {/* 1. AI Provider Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-foreground flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-muted-foreground" />
            <span>AI 分析服务</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label
              className={`p-3.5 rounded-2xl border flex items-center gap-3 cursor-pointer transition-all ${
                provider === "OPENAI_COMPATIBLE"
                  ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                  : "bg-background border-border/80 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="ai-provider"
                value="OPENAI_COMPATIBLE"
                checked={provider === "OPENAI_COMPATIBLE"}
                onChange={() => setProvider("OPENAI_COMPATIBLE")}
                className="text-primary accent-primary"
              />
              <div className="space-y-0.5">
                <span className="block text-foreground font-medium">OpenAI 兼容 API</span>
                <span className="text-[11px] text-muted-foreground block">
                  支持 OpenAI、DeepSeek、Qwen、Ollama 等
                </span>
              </div>
            </label>

            <label
              className={`p-3.5 rounded-2xl border flex items-center gap-3 cursor-pointer transition-all ${
                provider === "MOCK"
                  ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                  : "bg-background border-border/80 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="ai-provider"
                value="MOCK"
                checked={provider === "MOCK"}
                onChange={() => setProvider("MOCK")}
                className="text-primary accent-primary"
              />
              <div className="space-y-0.5">
                <span className="block text-foreground font-medium">基础分析（无需 API Key）</span>
                <span className="text-[11px] text-muted-foreground block">
                  仅使用系统的确定性分析能力，不调用外部 AI 服务。
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  无需配置 API Key 即可完成基础分析；如需 AI 生成的深度报告，可配置自己的 AI API。
                </span>
              </div>
            </label>
          </div>
        </div>

        {provider === "OPENAI_COMPATIBLE" && (
          <div className="space-y-4 pt-1 animate-in fade-in duration-200">
            {/* 2. API Base URL */}
            <div className="space-y-1.5">
              <label htmlFor="ai-base-url" className="block text-xs font-bold text-foreground flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-muted-foreground" />
                <span>API 地址 (API Base URL)</span>
              </label>
              <input
                id="ai-base-url"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-background border border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                支持 OpenAI-compatible API。如果你使用的是第三方兼容服务，请填写该服务提供的 API 地址。
              </p>
            </div>

            {/* 3. API Key */}
            <div className="space-y-1.5">
              <label htmlFor="ai-api-key" className="block text-xs font-bold text-foreground flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                <span>API Key</span>
              </label>
              <div className="relative">
                <input
                  id="ai-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={aiConfig.isConfigured && !apiKey ? "sk-•••••••••••••••• (已配置)" : "sk-..."}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl text-xs bg-background border border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={showKey ? "隐藏 API Key" : "显示 API Key"}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                输入时不会在页面其他位置回显，且不会明文保存在持久化存储中。
              </p>
            </div>

            {/* 4. Model Name */}
            <div className="space-y-1.5">
              <label htmlFor="ai-model-name" className="block text-xs font-bold text-foreground flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                <span>模型名称 (Model)</span>
              </label>
              <input
                id="ai-model-name"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-background border border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                例如：<code>gpt-4o-mini</code>、<code>gpt-5.6</code>、<code>deepseek-chat</code>、<code>qwen-plus</code> 等。
              </p>
            </div>
          </div>
        )}

        {/* Errors & Test Feedback */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {testResult && (
          <div
            className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              testResult.success
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300"
                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300"
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        {toastMessage && (
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>保存 AI 配置</span>
          </button>

          {provider === "OPENAI_COMPATIBLE" && (
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 transition-colors cursor-pointer"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Activity className="w-3.5 h-3.5" />
              )}
              <span>{isTesting ? "正在测试连接..." : "测试连接"}</span>
            </button>
          )}

          {isConfigured && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground border border-border/60 hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>恢复默认（基础分析）</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

