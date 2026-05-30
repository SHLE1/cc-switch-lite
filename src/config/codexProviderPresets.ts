/**
 * 精简版 Codex 预设。
 *
 * 仅保留 OpenAI 官方 auth.json 模式；自定义 API key / base URL 通过
 * 用户创建 provider 完成。切换 provider 时后端只修改 config.toml 的
 * openai_base_url 行，不再托管完整 config.toml。
 */
import { ProviderCategory } from "../types";
import type { CodexApiFormat } from "../types";
import type { PresetTheme } from "./claudeProviderPresets";

export interface CodexProviderPreset {
  name: string;
  nameKey?: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  auth: Record<string, any>;
  config: string;
  isOfficial?: boolean;
  category?: ProviderCategory;
  isCustomTemplate?: boolean;
  endpointCandidates?: string[];
  theme?: PresetTheme;
  icon?: string;
  iconColor?: string;
  apiFormat?: CodexApiFormat;
}

export function generateThirdPartyAuth(apiKey: string): Record<string, any> {
  return {
    auth_mode: "apikey",
    OPENAI_API_KEY: apiKey || "",
  };
}

export function generateThirdPartyConfig(
  _providerName: string,
  baseUrl: string,
  _modelName = "gpt-5.4",
): string {
  const trimmed = baseUrl.trim();
  return trimmed ? `openai_base_url = "${trimmed}"` : "";
}

export const codexProviderPresets: CodexProviderPreset[] = [
  {
    name: "OpenAI Official",
    websiteUrl: "https://chatgpt.com/codex",
    isOfficial: true,
    category: "official",
    auth: {},
    config: "",
    theme: {
      icon: "codex",
      backgroundColor: "#1F2937",
      textColor: "#FFFFFF",
    },
    icon: "openai",
    iconColor: "#00A67E",
  },
];
