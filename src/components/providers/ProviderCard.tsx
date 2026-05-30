import { GripVertical } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProviderActions } from "@/components/providers/ProviderActions";
import { ProviderIcon } from "@/components/ProviderIcon";
import { extractCodexBaseUrl } from "@/utils/providerConfigUtils";
import SubscriptionQuotaFooter from "@/components/SubscriptionQuotaFooter";
import CopilotQuotaFooter from "@/components/CopilotQuotaFooter";
import CodexOauthQuotaFooter from "@/components/CodexOauthQuotaFooter";
import { PROVIDER_TYPES } from "@/config/constants";
import { ApiBalanceFooter } from "@/components/ApiBalanceFooter";

interface DragHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
}

interface ProviderCardProps {
  provider: Provider;
  isCurrent: boolean;
  appId: AppId;
  onSwitch: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onOpenWebsite: (url: string) => void;
  onDuplicate: (provider: Provider) => void;
  dragHandleProps?: DragHandleProps;
}

const extractApiUrl = (provider: Provider, fallbackText: string) => {
  const config = provider.settingsConfig as Record<string, any>;
  const baseUrl = config?.env?.ANTHROPIC_BASE_URL;
  if (typeof baseUrl === "string" && baseUrl.trim()) {
    return baseUrl.trim();
  }

  const codexBaseUrl =
    typeof config?.config === "string"
      ? extractCodexBaseUrl(config.config)
      : undefined;
  if (codexBaseUrl) return codexBaseUrl;

  return fallbackText;
};

export function ProviderCard({
  provider,
  isCurrent,
  appId,
  onSwitch,
  onEdit,
  onDelete,
  onOpenWebsite,
  onDuplicate,
  dragHandleProps,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const fallbackUrlText = t("provider.notConfigured", {
    defaultValue: "未配置接口地址",
  });

  const displayUrl = useMemo(
    () => extractApiUrl(provider, fallbackUrlText),
    [provider, fallbackUrlText],
  );

  const isClickableUrl = useMemo(() => {
    if (provider.notes?.trim()) return false;
    return displayUrl !== fallbackUrlText;
  }, [provider.notes, displayUrl, fallbackUrlText]);
  const isOfficial = provider.category === "official";
  const isCopilot = provider.meta?.providerType === PROVIDER_TYPES.GITHUB_COPILOT;
  const isCodexOauth = provider.meta?.providerType === PROVIDER_TYPES.CODEX_OAUTH;

  const handleOpenWebsite = () => {
    if (isClickableUrl) onOpenWebsite(displayUrl);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border p-4 transition-all duration-300",
        "bg-card text-card-foreground group hover:border-border-active",
        isCurrent && "border-blue-500/60 shadow-sm shadow-blue-500/10",
        !isCurrent && "hover:shadow-sm",
        dragHandleProps?.isDragging &&
          "cursor-grabbing border-primary shadow-lg scale-105 z-10",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent transition-opacity duration-500 pointer-events-none",
          isCurrent ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <button
            type="button"
            className={cn(
              "-ml-1.5 flex-shrink-0 cursor-grab active:cursor-grabbing p-1.5",
              "text-muted-foreground/50 hover:text-muted-foreground transition-colors",
              dragHandleProps?.isDragging && "cursor-grabbing",
            )}
            aria-label={t("provider.dragHandle")}
            {...(dragHandleProps?.attributes ?? {})}
            {...(dragHandleProps?.listeners ?? {})}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center border border-border group-hover:scale-105 transition-transform duration-300">
            <ProviderIcon
              icon={provider.icon}
              name={provider.name}
              color={provider.iconColor}
              size={20}
            />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 min-h-7">
              <h3 className="text-base font-semibold leading-none">
                {provider.name}
              </h3>
            </div>
            {displayUrl && (
              <button
                type="button"
                onClick={handleOpenWebsite}
                className={cn(
                  "inline-flex items-center text-sm max-w-[280px]",
                  isClickableUrl
                    ? "text-blue-500 transition-colors hover:underline dark:text-blue-400 cursor-pointer"
                    : "text-muted-foreground cursor-default",
                )}
                title={displayUrl}
                disabled={!isClickableUrl}
              >
                <span className="truncate">{displayUrl}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center ml-auto min-w-0 gap-3">
          <div className="ml-auto">
            {isCopilot ? (
              <CopilotQuotaFooter
                meta={provider.meta}
                inline={true}
                isCurrent={true}
              />
            ) : isCodexOauth ? (
              <CodexOauthQuotaFooter
                meta={provider.meta}
                inline={true}
                isCurrent={true}
              />
            ) : isOfficial ? (
              <SubscriptionQuotaFooter
                appId={appId}
                providerId={provider.id}
                inline={true}
                isCurrent={true}
              />
            ) : (
              <ApiBalanceFooter
                provider={provider}
                appId={appId}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-focus-within:pointer-events-auto transition-opacity duration-200">
            <ProviderActions
              isCurrent={isCurrent}
              onSwitch={() => onSwitch(provider)}
              onEdit={() => onEdit(provider)}
              onDuplicate={() => onDuplicate(provider)}
              onDelete={() => onDelete(provider)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
