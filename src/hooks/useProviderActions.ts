import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { settingsApi, type AppId } from "@/lib/api";
import type { Provider } from "@/types";
import {
  useAddProviderMutation,
  useUpdateProviderMutation,
  useDeleteProviderMutation,
  useSwitchProviderMutation,
} from "@/lib/query";
import { extractErrorMessage } from "@/utils/errorUtils";
import { toast } from "sonner";

export function useProviderActions(activeApp: AppId) {
  const { t } = useTranslation();

  const addProviderMutation = useAddProviderMutation(activeApp);
  const updateProviderMutation = useUpdateProviderMutation(activeApp);
  const deleteProviderMutation = useDeleteProviderMutation(activeApp);
  const switchProviderMutation = useSwitchProviderMutation(activeApp);

  const syncClaudePlugin = useCallback(
    async (provider: Provider) => {
      if (activeApp !== "claude") return;

      try {
        const settings = await settingsApi.get();
        if (!settings?.enableClaudePluginIntegration) return;

        await settingsApi.applyClaudePluginConfig({
          official: provider.category === "official",
        });
      } catch (error) {
        const detail =
          extractErrorMessage(error) ||
          t("notifications.syncClaudePluginFailed", {
            defaultValue: "同步 Claude 插件失败",
          });
        toast.error(detail, { duration: 4200 });
      }
    },
    [activeApp, t],
  );

  const addProvider = useCallback(
    async (provider: Omit<Provider, "id"> & { providerKey?: string }) => {
      await addProviderMutation.mutateAsync(provider);
    },
    [addProviderMutation],
  );

  const updateProvider = useCallback(
    async (provider: Provider, originalId?: string) => {
      await updateProviderMutation.mutateAsync({ provider, originalId });
    },
    [updateProviderMutation],
  );

  const switchProvider = useCallback(
    async (provider: Provider) => {
      try {
        const result = await switchProviderMutation.mutateAsync(provider.id);
        await syncClaudePlugin(provider);

        if (result?.warnings?.length) {
          toast.warning(
            t("notifications.backfillWarning", {
              defaultValue:
                "切换成功，但旧供应商配置回填失败，您手动修改的配置可能未保存",
            }),
            { duration: 5000 },
          );
        }

        toast.success(
          t("notifications.switchSuccess", { defaultValue: "切换成功！" }),
          { closeButton: true },
        );
      } catch {
        // mutation handles user-facing errors
      }
    },
    [switchProviderMutation, syncClaudePlugin, t],
  );

  const deleteProvider = useCallback(
    async (id: string) => {
      await deleteProviderMutation.mutateAsync(id);
    },
    [deleteProviderMutation],
  );

  return {
    addProvider,
    updateProvider,
    switchProvider,
    deleteProvider,
    isLoading:
      addProviderMutation.isPending ||
      updateProviderMutation.isPending ||
      deleteProviderMutation.isPending ||
      switchProviderMutation.isPending,
  };
}
