import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import type { Provider, CustomEndpoint } from "@/types";
import type { AppId } from "@/lib/api";
import {
  ProviderForm,
  type ProviderFormValues,
} from "@/components/providers/forms/ProviderForm";
import { providerPresets } from "@/config/claudeProviderPresets";
import { codexProviderPresets } from "@/config/codexProviderPresets";
import { extractCodexBaseUrl } from "@/utils/providerConfigUtils";
import type { OpenClawSuggestedDefaults } from "@/config/openclawProviderPresets";

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: AppId;
  onSubmit: (
    provider: Omit<Provider, "id"> & {
      providerKey?: string;
      suggestedDefaults?: OpenClawSuggestedDefaults;
    },
  ) => Promise<void> | void;
}

export function AddProviderDialog({
  open,
  onOpenChange,
  appId,
  onSubmit,
}: AddProviderDialogProps) {
  const { t } = useTranslation();
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (values: ProviderFormValues) => {
      const parsedConfig = JSON.parse(values.settingsConfig) as Record<
        string,
        unknown
      >;

      const providerData: Omit<Provider, "id"> & {
        providerKey?: string;
        suggestedDefaults?: OpenClawSuggestedDefaults;
      } = {
        name: values.name.trim(),
        notes: values.notes?.trim() || undefined,
        websiteUrl: values.websiteUrl?.trim() || undefined,
        settingsConfig: parsedConfig,
        icon: values.icon?.trim() || undefined,
        iconColor: values.iconColor?.trim() || undefined,
        ...(values.presetCategory ? { category: values.presetCategory } : {}),
        ...(values.meta ? { meta: values.meta } : {}),
      };

      if (!providerData.meta?.custom_endpoints && values.presetCategory !== "omo") {
        const urlSet = new Set<string>();
        const addUrl = (rawUrl?: string) => {
          const url = (rawUrl || "").trim().replace(/\/+$/, "");
          if (url && url.startsWith("http")) {
            urlSet.add(url);
          }
        };

        if (values.presetId && appId === "claude") {
          const presetIndex = parseInt(values.presetId.replace("claude-", ""));
          if (!Number.isNaN(presetIndex)) {
            providerPresets[presetIndex]?.endpointCandidates?.forEach(addUrl);
          }
        } else if (values.presetId && appId === "codex") {
          const presetIndex = parseInt(values.presetId.replace("codex-", ""));
          if (!Number.isNaN(presetIndex)) {
            codexProviderPresets[presetIndex]?.endpointCandidates?.forEach(addUrl);
          }
        }

        if (appId === "claude") {
          const env = parsedConfig.env as Record<string, unknown> | undefined;
          if (typeof env?.ANTHROPIC_BASE_URL === "string") {
            addUrl(env.ANTHROPIC_BASE_URL);
          }
        } else if (appId === "codex") {
          const config = parsedConfig.config;
          if (typeof config === "string") {
            const extractedBaseUrl = extractCodexBaseUrl(config);
            if (extractedBaseUrl) {
              addUrl(extractedBaseUrl);
            }
          }
        }

        const urls = Array.from(urlSet);
        if (urls.length > 0) {
          const now = Date.now();
          const customEndpoints: Record<string, CustomEndpoint> = {};
          urls.forEach((url) => {
            customEndpoints[url] = {
              url,
              addedAt: now,
              lastUsed: undefined,
            };
          });

          providerData.meta = {
            ...(providerData.meta ?? {}),
            custom_endpoints: customEndpoints,
          };
        }
      }

      await onSubmit(providerData);
      onOpenChange(false);
    },
    [appId, onSubmit, onOpenChange],
  );

  const footer = (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(false)}
        className="border-border/20 hover:bg-accent hover:text-accent-foreground"
      >
        {t("common.cancel")}
      </Button>
      <Button
        type="submit"
        form="provider-form"
        disabled={isFormSubmitting}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-4 w-4 mr-2" />
        {t("common.add")}
      </Button>
    </>
  );

  return (
    <FullScreenPanel
      isOpen={open}
      title={t("provider.addNewProvider")}
      onClose={() => onOpenChange(false)}
      footer={footer}
    >
      <ProviderForm
        appId={appId}
        submitLabel={t("common.add")}
        onSubmit={handleSubmit}
        onCancel={() => onOpenChange(false)}
        onSubmittingChange={setIsFormSubmitting}
        showButtons={false}
      />
    </FullScreenPanel>
  );
}
