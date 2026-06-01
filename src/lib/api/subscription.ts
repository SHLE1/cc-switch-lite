import { invoke } from "@tauri-apps/api/core";
import type { SubscriptionQuota } from "@/types/subscription";

export const subscriptionApi = {
  getQuota: (tool: string, providerId?: string): Promise<SubscriptionQuota> =>
    invoke("get_subscription_quota", { tool, providerId }),
  getCodexOauthQuota: (accountId: string | null): Promise<SubscriptionQuota> =>
    invoke("get_codex_oauth_quota", { accountId }),
};
