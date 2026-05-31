import { useQuery } from "@tanstack/react-query";
import { balanceApi, type UsageResult } from "@/lib/api/balance";

const REFETCH_INTERVAL = 5 * 60 * 1000;

export type BalanceTemplateType =
  | "balance"
  | "sub2api"
  | "newapi"
  | "unsupported";

export const balanceKeys = {
  all: ["balance"] as const,
  provider: (
    providerId: string,
    templateType: BalanceTemplateType,
    baseUrl: string,
  ) => [...balanceKeys.all, providerId, templateType, baseUrl] as const,
};

export function useProviderBalanceQuery({
  providerId,
  templateType,
  baseUrl,
  apiKey,
  enabled,
}: {
  providerId: string;
  templateType: BalanceTemplateType;
  baseUrl: string | undefined;
  apiKey: string | undefined;
  enabled: boolean;
}) {
  const normalizedBaseUrl = baseUrl?.trim() ?? "";
  const normalizedApiKey = apiKey?.trim() ?? "";

  return useQuery<UsageResult>({
    queryKey: balanceKeys.provider(providerId, templateType, normalizedBaseUrl),
    queryFn: () => {
      if (templateType === "unsupported") {
        return Promise.resolve({
          success: false,
          error: "Unsupported balance provider",
        });
      }
      if (templateType === "sub2api" || templateType === "newapi") {
        return balanceApi.getApiUsageBalance(
          templateType,
          normalizedBaseUrl,
          normalizedApiKey,
        );
      }
      return balanceApi.getBalance(normalizedBaseUrl, normalizedApiKey);
    },
    enabled:
      enabled &&
      templateType !== "unsupported" &&
      normalizedBaseUrl.length > 0 &&
      normalizedApiKey.length > 0,
    refetchInterval: enabled ? REFETCH_INTERVAL : false,
    refetchIntervalInBackground: enabled,
    refetchOnWindowFocus: enabled,
    staleTime: REFETCH_INTERVAL,
    retry: 1,
  });
}
