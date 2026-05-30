// Provider 类型常量
export const PROVIDER_TYPES = {
  GITHUB_COPILOT: "github_copilot",
  CODEX_OAUTH: "codex_oauth",
} as const;

// 用量脚本模板类型常量
export const TEMPLATE_TYPES = {
  CUSTOM: "custom",
  NEW_API: "newapi",
  SUB2API: "sub2api",
  GITHUB_COPILOT: "github_copilot",
  TOKEN_PLAN: "token_plan",
  BALANCE: "balance",
} as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[keyof typeof TEMPLATE_TYPES];
