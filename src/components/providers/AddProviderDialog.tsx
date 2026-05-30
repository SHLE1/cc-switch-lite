import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import type { CustomEndpoint, Provider } from "@/types";
import type { AppId } from "@/lib/api";
import {
  ProviderForm,
  type ProviderFormValues,
} from "@/components/providers/forms/ProviderForm";

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: AppId;
  onSubmit: (provider: Omit<Provider, "id">) => Promise<void> | void;
}

const customEndpointsFromBaseUrl = (
  settingsConfig: Record<string, unknown>,
): Record<string, CustomEndpoint> | undefined => {
  const env = settingsConfig.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return undefined;
  }

  const baseUrl = (env as Record<string, unknown>).ANTHROPIC_BASE_URL;
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return undefined;
  }

  const url = baseUrl.trim();
  return {
    [url]: {
      url,
      addedAt: Date.now(),
      lastUsed: undefined,
    },
  };
};

const providerMetaFromValues = (
  values: ProviderFormValues,
  settingsConfig: Record<string, unknown>,
) => {
  if (values.meta?.custom_endpoints) {
    return values.meta;
  }

  const customEndpoints = customEndpointsFromBaseUrl(settingsConfig);
  if (!customEndpoints) {
    return values.meta;
  }

  return {
    ...values.meta,
    custom_endpoints: customEndpoints,
  };
};

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
      const meta = providerMetaFromValues(values, parsedConfig);

      const providerData: Omit<Provider, "id"> = {
        name: values.name.trim(),
        notes: values.notes?.trim() || undefined,
        websiteUrl: values.websiteUrl?.trim() || undefined,
        settingsConfig: parsedConfig,
        category: values.presetCategory ?? "custom",
        meta,
      };

      await onSubmit(providerData);
      onOpenChange(false);
    },
    [onSubmit, onOpenChange],
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
