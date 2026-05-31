import { RefreshCw, AlertCircle, Clock } from "lucide-react";
import type { Provider } from "@/types";
import {
  useProviderBalanceQuery,
  type BalanceTemplateType,
} from "@/lib/query/balance";
import {
  extractCodexBaseUrl,
  getApiKeyFromConfig,
} from "@/utils/providerConfigUtils";
import type { AppId, UsageData } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ApiBalanceFooterProps {
  provider: Provider;
  appId: AppId;
}

const formatNumber = (value: number): string =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });

const displayUnit = (unit: string | undefined): string => {
  if (!unit) return "";
  const upper = unit.toUpperCase();
  if (upper === "USD" || unit === "$") return "USD";
  return unit;
};

const firstUsableItem = (
  items: UsageData[] | undefined,
): UsageData | undefined =>
  items?.find(
    (item) =>
      item.isValid !== false &&
      (typeof item.remaining === "number" || typeof item.used === "number"),
  );

export const normalizeBalanceTemplate = (
  value: unknown,
): BalanceTemplateType | undefined => {
  if (
    value === "sub2api" ||
    value === "newapi" ||
    value === "balance" ||
    value === "unsupported"
  ) {
    return value;
  }
  return undefined;
};
export const extractProviderBaseUrl = (
  provider: Provider,
): string | undefined => {
  const usageBaseUrl = provider.meta?.usage_script?.baseUrl?.trim();
  if (usageBaseUrl) return usageBaseUrl;

  const config = provider.settingsConfig;
  const env = config.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const anthropicBaseUrl = (env as Record<string, unknown>)
      .ANTHROPIC_BASE_URL;
    if (typeof anthropicBaseUrl === "string" && anthropicBaseUrl.trim()) {
      return anthropicBaseUrl.trim();
    }
  }

  const codexConfig = config.config;
  if (typeof codexConfig === "string") {
    return extractCodexBaseUrl(codexConfig);
  }

  return undefined;
};

export const extractProviderApiKey = (
  provider: Provider,
  appId: AppId,
): string | undefined => {
  const usageApiKey = provider.meta?.usage_script?.apiKey?.trim();
  if (usageApiKey) return usageApiKey;

  const config = provider.settingsConfig;
  if (appId === "codex") {
    const auth = config.auth;
    if (auth && typeof auth === "object" && !Array.isArray(auth)) {
      const record = auth as Record<string, unknown>;
      const direct = record.OPENAI_API_KEY;
      if (typeof direct === "string" && direct.trim()) return direct.trim();
      const tokens = record.tokens;
      if (tokens && typeof tokens === "object" && !Array.isArray(tokens)) {
        const tokenKey = (tokens as Record<string, unknown>).OPENAI_API_KEY;
        if (typeof tokenKey === "string" && tokenKey.trim())
          return tokenKey.trim();
      }
    }
  }

  const apiKey = getApiKeyFromConfig(JSON.stringify(config), appId).trim();
  return apiKey || undefined;
};

export const inferProviderBalanceTemplate = (
  provider: Provider,
): BalanceTemplateType => {
  const usageTemplate = normalizeBalanceTemplate(
    provider.meta?.usage_script?.templateType,
  );
  if (usageTemplate) return usageTemplate;

  const configured = normalizeBalanceTemplate(provider.meta?.balanceTemplate);
  if (configured) return configured;

  const text =
    `${provider.name} ${provider.websiteUrl ?? ""} ${extractProviderBaseUrl(provider) ?? ""}`.toLowerCase();
  if (text.includes("sub2api") || text.includes("sub2-api")) return "sub2api";
  if (text.includes("newapi") || text.includes("new-api")) return "newapi";
  return "balance";
};
export function ApiBalanceFooter({ provider, appId }: ApiBalanceFooterProps) {
  const baseUrl = extractProviderBaseUrl(provider);
  const apiKey = extractProviderApiKey(provider, appId);
  const templateType = inferProviderBalanceTemplate(provider);
  if (templateType === "unsupported") return null;

  const enabled = provider.category !== "official";
  const { data, isLoading, isFetching, refetch } = useProviderBalanceQuery({
    providerId: provider.id,
    templateType,
    baseUrl,
    apiKey,
    enabled,
  });

  if (!enabled || !baseUrl || !apiKey) return null;

  const item = firstUsableItem(data?.data);
  const loading = isLoading || isFetching;

  if (!loading && (!data || !data.success || !item)) {
    if (!data?.error) return null;
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3 w-3 text-orange-500" />
        <span className="max-w-48 truncate" title={data.error}>
          {data.error}
        </span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex text-muted-foreground hover:text-foreground"
          aria-label="刷新余额"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const unit = displayUnit(item?.unit);

  return (
    <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        {loading ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        <span>{loading ? "查询中" : "刚刚"}</span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex text-muted-foreground hover:text-foreground"
          aria-label="刷新余额"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>
      {item && (
        <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
          {typeof item.used === "number" && (
            <span>
              已使用：
              <span className="font-medium tabular-nums text-foreground">
                {formatNumber(item.used)}
              </span>
            </span>
          )}
          {typeof item.remaining === "number" && (
            <span>
              剩余：
              <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">
                {formatNumber(item.remaining)}
              </span>
            </span>
          )}
          {unit && <span>{unit}</span>}
        </div>
      )}
    </div>
  );
}
