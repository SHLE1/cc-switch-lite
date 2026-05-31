import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { providersApi, settingsApi, type AppId } from "@/lib/api";
import type { Provider, Settings } from "@/types";

const sortProviders = (
  providers: Record<string, Provider>,
): Record<string, Provider> => {
  return Object.fromEntries(
    Object.entries(providers).sort(([, a], [, b]) => {
      const aSort = (a.meta as { sortIndex?: number } | undefined)?.sortIndex;
      const bSort = (b.meta as { sortIndex?: number } | undefined)?.sortIndex;
      if (aSort !== undefined && bSort !== undefined) {
        return aSort - bSort;
      }
      if (aSort !== undefined) return -1;
      if (bSort !== undefined) return 1;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    }),
  );
};

export interface ProvidersQueryData {
  providers: Record<string, Provider>;
  currentProviderId: string;
}

export const useProvidersQuery = (
  appId: AppId,
): UseQueryResult<ProvidersQueryData> => {
  return useQuery({
    queryKey: ["providers", appId],
    queryFn: async () => {
      const [providers, currentProviderId] = await Promise.all([
        providersApi.getAll(appId),
        providersApi.getCurrent(appId),
      ]);
      return {
        providers: sortProviders(providers),
        currentProviderId,
      };
    },
    staleTime: 30 * 1000,
  });
};

export const useSettingsQuery = (): UseQueryResult<Settings> => {
  return useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    staleTime: 30 * 1000,
  });
};
