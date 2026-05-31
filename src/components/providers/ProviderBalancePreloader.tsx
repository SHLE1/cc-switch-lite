import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { balanceApi } from "@/lib/api/balance";
import {
  extractProviderApiKey,
  extractProviderBaseUrl,
  inferProviderBalanceTemplate,
} from "@/components/ApiBalanceFooter";
import { balanceKeys } from "@/lib/query/balance";

interface ProviderBalancePreloaderProps {
  appId: AppId;
  providers: Provider[];
}

const BALANCE_STALE_TIME_MS = 5 * 60 * 1000;

export function ProviderBalancePreloader({
  appId,
  providers,
}: ProviderBalancePreloaderProps) {
  const queryClient = useQueryClient();
  const targets = useMemo(
    () =>
      providers
        .filter((provider) => provider.category !== "official")
        .map((provider) => {
          const baseUrl = extractProviderBaseUrl(provider)?.trim();
          const apiKey = extractProviderApiKey(provider, appId)?.trim();
          if (!baseUrl || !apiKey) return null;
          const templateType = inferProviderBalanceTemplate(provider);
          if (templateType === "unsupported") return null;
          return {
            providerId: provider.id,
            baseUrl,
            apiKey,
            templateType,
          };
        })
        .filter((target): target is NonNullable<typeof target> =>
          Boolean(target),
        ),
    [appId, providers],
  );

  useEffect(() => {
    for (const target of targets) {
      void queryClient.prefetchQuery({
        queryKey: balanceKeys.provider(
          target.providerId,
          target.templateType,
          target.baseUrl,
        ),
        queryFn: () =>
          target.templateType === "sub2api" || target.templateType === "newapi"
            ? balanceApi.getApiUsageBalance(
                target.templateType,
                target.baseUrl,
                target.apiKey,
              )
            : balanceApi.getBalance(target.baseUrl, target.apiKey),
        staleTime: BALANCE_STALE_TIME_MS,
      });
    }
  }, [queryClient, targets]);

  return null;
}
