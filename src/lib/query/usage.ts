import type { AppId } from "@/lib/api/types";

export const usageKeys = {
  all: ["usage"] as const,
  script: (providerId: string, appId: AppId) =>
    [...usageKeys.all, "script", appId, providerId] as const,
};
