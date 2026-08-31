"use client";

import * as React from "react";
import { normalizeOpenAiBaseUrl } from "@/lib/ai/url-normalizer";
import { AiProviderType } from "@/types/ai-analysis";

export interface UserAiConfigState {
  provider: AiProviderType;
  apiBaseUrl: string;
  apiKey: string; // IN-MEMORY ONLY: Never written to localStorage/sessionStorage/cookies/DB
  model: string;
  isConfigured: boolean;
}

interface AiConfigContextType {
  aiConfig: UserAiConfigState;
  applyAiConfig: (config: {
    provider?: AiProviderType;
    apiBaseUrl: string;
    apiKey: string;
    model: string;
  }) => { success: boolean; error?: string };
  clearAiConfig: () => void;
}

const DEFAULT_AI_CONFIG: UserAiConfigState = {
  provider: "MOCK",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  isConfigured: false,
};

const AiConfigContext = React.createContext<AiConfigContextType | undefined>(undefined);

// Non-secret metadata storage key (stores URL & model ONLY, NEVER API KEY)
const SESSION_METADATA_KEY = "bili_user_ai_meta";

export function AiConfigProvider({ children }: { children: React.ReactNode }) {
  // SSR/CSR invariant: the initial state MUST be identical on server and client.
  // Reading sessionStorage during render produced a different first client render than the
  // server HTML (baseUrl / model feed controlled <input value>), causing a hydration mismatch.
  // Storage is therefore read only after mount.
  const [aiConfig, setAiConfig] = React.useState<UserAiConfigState>(DEFAULT_AI_CONFIG);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = sessionStorage.getItem(SESSION_METADATA_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!parsed?.apiBaseUrl || !parsed?.model) return;

      setAiConfig({
        provider: parsed.provider === "OPENAI_COMPATIBLE" ? "OPENAI_COMPATIBLE" : "MOCK",
        apiBaseUrl: parsed.apiBaseUrl,
        apiKey: "", // API KEY IS STRICTLY NEVER LOADED FROM STORAGE
        model: parsed.model,
        isConfigured: false,
      });
    } catch {
      // Corrupt storage entry: keep the default config.
    }
  }, []);

  const applyAiConfig = React.useCallback(
    (newConfig: {
      provider?: AiProviderType;
      apiBaseUrl: string;
      apiKey: string;
      model: string;
    }) => {
      const selectedProvider: AiProviderType = newConfig.provider || "OPENAI_COMPATIBLE";

      if (selectedProvider === "MOCK") {
        const updated: UserAiConfigState = {
          provider: "MOCK",
          apiBaseUrl: newConfig.apiBaseUrl || "https://api.openai.com/v1",
          apiKey: "",
          model: newConfig.model || "gpt-4o-mini",
          isConfigured: true,
        };
        setAiConfig(updated);
        return { success: true };
      }

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
        provider: "OPENAI_COMPATIBLE",
        apiBaseUrl: trimmedUrl,
        apiKey: trimmedKey,
        model: trimmedModel,
        isConfigured: true,
      };

      setAiConfig(updated);

      // Save SAFE non-secret metadata only
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            SESSION_METADATA_KEY,
            JSON.stringify({
              provider: "OPENAI_COMPATIBLE",
              apiBaseUrl: trimmedUrl,
              model: trimmedModel,
            })
          );
        } catch {}
      }

      return { success: true };
    },
    []
  );

  const clearAiConfig = React.useCallback(() => {
    setAiConfig(DEFAULT_AI_CONFIG);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_METADATA_KEY);
      } catch {}
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

