/**
 * 精简版 Claude Code 预设。
 *
 * 大多数第三方 preset 属于高级功能；保留官方空配置，并允许用户通过
 * 自定义表单添加自己的 API key / base URL / model overrides。
 */
import { ProviderCategory } from "../types";

export interface TemplateValueConfig {
  label: string;
  placeholder: string;
  defaultValue?: string;
  editorValue: string;
}

export interface PresetTheme {
  icon?: "claude" | "codex" | "generic";
  backgroundColor?: string;
  textColor?: string;
}

export interface ProviderPreset {
  name: string;
  nameKey?: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  settingsConfig: object;
  isOfficial?: boolean;
  category?: ProviderCategory;
  apiKeyField?: "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY";
  templateValues?: Record<string, TemplateValueConfig>;
  endpointCandidates?: string[];
  theme?: PresetTheme;
  icon?: string;
  iconColor?: string;
  apiFormat?: "anthropic" | "openai_chat" | "openai_responses";
  providerType?: "github_copilot" | "codex_oauth";
  requiresOAuth?: boolean;
  hidden?: boolean;
  modelsUrl?: string;
}

export const providerPresets: ProviderPreset[] = [
  {
    name: "Claude Official",
    websiteUrl: "https://www.anthropic.com/claude-code",
    settingsConfig: {
      env: {},
    },
    isOfficial: true,
    category: "official",
    theme: {
      icon: "claude",
      backgroundColor: "#D97757",
      textColor: "#FFFFFF",
    },
    icon: "anthropic",
    iconColor: "#D4915D",
  },
];
