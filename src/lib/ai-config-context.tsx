"use client";

import * as React from "react";
import { normalizeOpenAiBaseUrl } from "@/lib/ai/openai-provider";

export interface UserAiConfigState {
  apiBaseUrl: string;
  apiKey: string; // IN-MEMORY ONLY: Never written to localStorage/sessionStorage/cookies/DB
  model: string;
  isConfigured: boolean;
}

interface AiConfigContextType {
  aiConfig: UserAiConfigState;
  applyAiConfig: (config: {
    apiBaseUrl: string;
    apiKey: string;
    model: string;
  }) => { success: boolean; error?: string };
  clearAiConfig: () => void;
}

const DEFAULT_AI_CONFIG: UserAiConfigState = {
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  isConfigured: false,
};

const AiConfigContext = React.createContext<AiConfigContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = "bili_user_ai_config";

export function AiConfigProvider({ children }: { children: React.ReactNode }) {
  const [aiConfig, setAiConfig] = React.useState<UserAiConfigState>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.apiKey && parsed?.apiBaseUrl && parsed?.model) {
            return {
              apiBaseUrl: parsed.apiBaseUrl,
              apiKey: parsed.apiKey,
              model: parsed.model,
              isConfigured: true,
            };
          }
        }
      } catch {
        // Fallback to default
      }
    }
    return DEFAULT_AI_CONFIG;
  });

  const applyAiConfig = React.useCallback(
    (newConfig: { apiBaseUrl: string; apiKey: string; model: string }) => {
      const trimmedUrl = newConfig.apiBaseUrl.trim();
      const trimmedKey = newConfig.apiKey.trim();
      const trimmedModel = newConfig.model.trim();

      const urlNorm = normalizeOpenAiBaseUrl(trimmedUrl);
      if (!urlNorm.valid) {
        return { success: false, error: urlNorm.reason || "API Base URL 格式无效" };
      }

      if (!trimmedKey) {
        return { success: false, error: "API Key 不能为空" };
      }

      if (!trimmedModel) {
        return { success: false, error: "模型名称 (Model) 不能为空" };
      }

      const updated: UserAiConfigState = {
        apiBaseUrl: trimmedUrl,
        apiKey: trimmedKey,
        model: trimmedModel,
        isConfigured: true,
      };

      setAiConfig(updated);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore storage error
        }
      }

      return { success: true };
    },
    []
  );

  const clearAiConfig = React.useCallback(() => {
    setAiConfig(DEFAULT_AI_CONFIG);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
    }
  }, []);

  return (
    <AiConfigContext.Provider value={{ aiConfig, applyAiConfig, clearAiConfig }}>
      {children}
    </AiConfigContext.Provider>
  );
}

export function useAiConfig(): AiConfigContextType {
  const context = React.useContext(AiConfigContext);
  if (!context) {
    throw new Error("useAiConfig must be used within an AiConfigProvider");
  }
  return context;
}
