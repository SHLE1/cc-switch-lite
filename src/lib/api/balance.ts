import { invoke } from "@tauri-apps/api/core";

export interface UsageData {
  planName?: string;
  extra?: string;
  isValid?: boolean;
  invalidMessage?: string;
  total?: number;
  used?: number;
  remaining?: number;
  unit?: string;
}

export interface UsageResult {
  success: boolean;
  data?: UsageData[];
  error?: string;
}

export const balanceApi = {
  getBalance: (baseUrl: string, apiKey: string): Promise<UsageResult> =>
    invoke("get_balance", { baseUrl, apiKey }),

  getApiUsageBalance: (
    templateType: "sub2api" | "newapi",
    baseUrl: string,
    apiKey: string,
    timeoutSecs = 10,
  ): Promise<UsageResult> =>
    invoke("get_api_usage_balance", {
      templateType,
      baseUrl,
      apiKey,
      timeoutSecs,
    }),
};
