export type ProviderCategory =
  | "official"
  | "cn_official"
  | "cloud_provider"
  | "aggregator"
  | "third_party"
  | "custom";

export interface Provider {
  id: string;
  name: string;
  settingsConfig: Record<string, unknown>;
  websiteUrl?: string;
  category?: ProviderCategory;
  createdAt?: number;
  sortIndex?: number;
  notes?: string;
  meta?: ProviderMeta;
  icon?: string;
  iconColor?: string;
}

export interface AppConfig {
  providers: Record<string, Provider>;
  current: string;
}

export interface CustomEndpoint {
  url: string;
  addedAt: number;
  lastUsed?: number;
}

export type AuthBindingSource = "provider_config" | "managed_account";

export interface AuthBinding {
  source: AuthBindingSource;
  authProvider?: string;
  accountId?: string;
}

export interface UsageScript {
  enabled: boolean;
  language: "javascript";
  code: string;
  timeout?: number;
  templateType?: "sub2api" | "newapi" | "balance" | "unsupported" | string;
  apiKey?: string;
  baseUrl?: string;
  accessToken?: string;
  userId?: string;
  autoQueryInterval?: number;
  autoIntervalMinutes?: number;
}

export interface ProviderMeta {
  custom_endpoints?: Record<string, CustomEndpoint>;
  commonConfigEnabled?: boolean;
  apiFormat?: "anthropic" | "openai_chat" | "openai_responses";
  authBinding?: AuthBinding;
  apiKeyField?: ClaudeApiKeyField;
  isFullUrl?: boolean;
  promptCacheKey?: string;
  codexFastMode?: boolean;
  providerType?: string;
  balanceTemplate?: "sub2api" | "newapi" | "unsupported";
  usage_script?: UsageScript;
}

export type ClaudeApiFormat = "anthropic" | "openai_chat" | "openai_responses";
export type CodexApiFormat = "openai_responses" | "openai_chat";
export type ClaudeApiKeyField = "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY";

export interface VisibleApps {
  claude: boolean;
  codex: boolean;
}

export interface Settings {
  showInTray: boolean;
  minimizeToTrayOnClose?: boolean;
  enableClaudePluginIntegration?: boolean;
  language?: "en" | "zh" | "ja";
  visibleApps?: VisibleApps;
  claudeConfigDir?: string;
  codexConfigDir?: string;
  currentProviderClaude?: string;
  currentProviderCodex?: string;
  autoBackupIntervalHours?: number;
  useAppWindowControls?: boolean;
}

export interface ProviderOperationResult {
  success: boolean;
  message?: string;
}
