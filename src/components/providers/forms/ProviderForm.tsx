import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { providerSchema, type ProviderFormData } from "@/lib/schemas/provider";
import type { AppId } from "@/lib/api";
import type { ProviderCategory, ProviderMeta } from "@/types";
import {
  extractCodexBaseUrl,
  getApiKeyFromConfig,
  setCodexBaseUrl,
} from "@/utils/providerConfigUtils";

export interface ProviderFormProps {
  appId: AppId;
  providerId?: string;
  submitLabel: string;
  onSubmit: (values: ProviderFormValues) => Promise<void> | void;
  onCancel: () => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  initialData?: {
    name?: string;
    websiteUrl?: string;
    notes?: string;
    settingsConfig?: Record<string, unknown>;
    category?: ProviderCategory;
    meta?: ProviderMeta;
    icon?: string;
    iconColor?: string;
  };
  showButtons?: boolean;
}

const defaultConfigForApp = (appId: AppId): Record<string, unknown> => {
  if (appId === "codex") {
    return { auth: { auth_mode: "apikey", OPENAI_API_KEY: "" }, config: "" };
  }
  return { env: { ANTHROPIC_AUTH_TOKEN: "" } };
};

const stringifyConfig = (config: Record<string, unknown>): string =>
  JSON.stringify(config, null, 2);

const parseConfig = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const codexAuth = (config: Record<string, unknown>): Record<string, unknown> => {
  const auth = config.auth;
  return auth && typeof auth === "object" && !Array.isArray(auth)
    ? (auth as Record<string, unknown>)
    : {};
};

const codexConfigText = (config: Record<string, unknown>): string =>
  typeof config.config === "string" ? config.config : "";

const claudeEnv = (config: Record<string, unknown>): Record<string, unknown> => {
  const env = config.env;
  return env && typeof env === "object" && !Array.isArray(env)
    ? (env as Record<string, unknown>)
    : {};
};

const getClaudeBaseUrl = (config: Record<string, unknown>): string => {
  const value = claudeEnv(config).ANTHROPIC_BASE_URL;
  return typeof value === "string" ? value : "";
};

const getClaudeModel = (config: Record<string, unknown>): string => {
  const env = claudeEnv(config);
  const value = env.ANTHROPIC_MODEL ?? env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  return typeof value === "string" ? value : "";
};

const getCodexApiKey = (config: Record<string, unknown>): string => {
  const auth = codexAuth(config);
  const directKey = auth.OPENAI_API_KEY;
  if (typeof directKey === "string") return directKey;

  const tokens = auth.tokens;
  if (tokens && typeof tokens === "object" && !Array.isArray(tokens)) {
    const tokenKey = (tokens as Record<string, unknown>).OPENAI_API_KEY;
    if (typeof tokenKey === "string") return tokenKey;
  }

  return "";
};

function patchConfig(
  currentJson: string,
  appId: AppId,
  patch: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    apiKeyField?: "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY";
  },
): string {
  const config = parseConfig(currentJson);

  if (appId === "codex") {
    const auth = { ...codexAuth(config) };
    if (patch.apiKey !== undefined) {
      auth.auth_mode = "apikey";
      auth.OPENAI_API_KEY = patch.apiKey;
    }
    const oldConfig = codexConfigText(config);
    const nextConfig =
      patch.baseUrl !== undefined
        ? setCodexBaseUrl(oldConfig, patch.baseUrl)
        : oldConfig;
    return stringifyConfig({ ...config, auth, config: nextConfig });
  }

  const env = { ...claudeEnv(config) };
  if (patch.apiKey !== undefined) {
    const field = patch.apiKeyField ?? "ANTHROPIC_AUTH_TOKEN";
    if (field === "ANTHROPIC_API_KEY") {
      delete env.ANTHROPIC_AUTH_TOKEN;
    } else {
      delete env.ANTHROPIC_API_KEY;
    }
    env[field] = patch.apiKey;
  }
  if (patch.baseUrl !== undefined) {
    if (patch.baseUrl.trim()) env.ANTHROPIC_BASE_URL = patch.baseUrl;
    else delete env.ANTHROPIC_BASE_URL;
  }
  if (patch.model !== undefined) {
    if (patch.model.trim()) env.ANTHROPIC_MODEL = patch.model;
    else delete env.ANTHROPIC_MODEL;
  }
  return stringifyConfig({ ...config, env });
}

export function ProviderForm({
  appId,
  submitLabel,
  onSubmit,
  onCancel,
  onSubmittingChange,
  initialData,
  showButtons = true,
}: ProviderFormProps) {
  const { t } = useTranslation();
  const initialConfig = initialData?.settingsConfig ?? defaultConfigForApp(appId);
  const initialConfigJson = stringifyConfig(initialConfig);
  const initialApiKeyField =
    initialData?.meta?.apiKeyField ??
    ("ANTHROPIC_AUTH_TOKEN" as "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY");

  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      websiteUrl: initialData?.websiteUrl ?? "",
      notes: initialData?.notes ?? "",
      settingsConfig: initialConfigJson,
      authJson:
        appId === "codex" ? stringifyConfig(codexAuth(initialConfig)) : undefined,
      apiKey:
        appId === "codex"
          ? getCodexApiKey(initialConfig)
          : getApiKeyFromConfig(initialConfigJson, appId),
      baseUrl:
        appId === "codex"
          ? extractCodexBaseUrl(codexConfigText(initialConfig)) ?? ""
          : getClaudeBaseUrl(initialConfig),
      model: appId === "codex" ? "" : getClaudeModel(initialConfig),
      apiKeyField: initialApiKeyField,
      balanceTemplate: initialData?.meta?.balanceTemplate ?? "auto",
    },
    mode: "onSubmit",
  });

  const isSubmitting = form.formState.isSubmitting;
  const balanceTemplate = form.watch("balanceTemplate");
  const apiKeyField = form.watch("apiKeyField") ?? initialApiKeyField;

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const updateConfigField = (patch: Parameters<typeof patchConfig>[2]) => {
    form.setValue(
      "settingsConfig",
      patchConfig(form.getValues("settingsConfig"), appId, patch),
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
  };

  const handleSubmit = async (values: ProviderFormData) => {
    const meta: ProviderMeta = {
      ...(initialData?.meta ?? {}),
      balanceTemplate:
        values.balanceTemplate === "sub2api" ||
        values.balanceTemplate === "newapi" ||
        values.balanceTemplate === "unsupported"
          ? values.balanceTemplate
          : undefined,
      apiKeyField: appId === "claude" ? values.apiKeyField : initialData?.meta?.apiKeyField,
    };

    let settingsConfig = values.settingsConfig;
    if (appId === "codex") {
      const currentConfig = parseConfig(values.settingsConfig);
      settingsConfig = stringifyConfig({
        ...currentConfig,
        auth: parseConfig(values.authJson ?? "{}"),
        config: codexConfigText(currentConfig),
      });
    }

    await onSubmit({
      ...values,
      settingsConfig,
      name: values.name.trim(),
      websiteUrl: values.websiteUrl?.trim() ?? "",
      notes: values.notes?.trim() ?? "",
      presetCategory: initialData?.category ?? "custom",
      meta,
    });
  };

  const configLabel = appId === "codex" ? "auth.json" : "settings.json";

  return (
    <Form {...form}>
      <form id="provider-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("providerForm.name", { defaultValue: "名称" })}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="websiteUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("providerForm.website", { defaultValue: "网站" })}</FormLabel>
                <FormControl>
                  <Input {...field} type="url" autoComplete="off" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="apiKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Key</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="off"
                    placeholder={appId === "codex" ? "OPENAI_API_KEY" : "ANTHROPIC_AUTH_TOKEN"}
                    onChange={(event) => {
                      field.onChange(event);
                      updateConfigField({ apiKey: event.target.value, apiKeyField });
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {appId === "claude" && (
            <FormField
              control={form.control}
              name="apiKeyField"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key 字段</FormLabel>
                  <Select
                    value={field.value ?? initialApiKeyField}
                    onValueChange={(value) => {
                      const next = value as "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY";
                      field.onChange(next);
                      updateConfigField({ apiKey: form.getValues("apiKey"), apiKeyField: next });
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ANTHROPIC_AUTH_TOKEN">ANTHROPIC_AUTH_TOKEN</SelectItem>
                      <SelectItem value="ANTHROPIC_API_KEY">ANTHROPIC_API_KEY</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="baseUrl"
            render={({ field }) => (
              <FormItem className={appId === "codex" ? undefined : "sm:col-start-1"}>
                <FormLabel>Base URL</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="off"
                    placeholder={appId === "codex" ? "https://api.example.com/v1" : "https://api.example.com"}
                    onChange={(event) => {
                      field.onChange(event);
                      updateConfigField({ baseUrl: event.target.value });
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {appId === "claude" && (
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>模型</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoComplete="off"
                      placeholder="claude-sonnet-4-5"
                      onChange={(event) => {
                        field.onChange(event);
                        updateConfigField({ model: event.target.value });
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="balanceTemplate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>余额查询模板</FormLabel>
              <Select value={field.value ?? "auto"} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="auto">自动识别</SelectItem>
                  <SelectItem value="sub2api">sub2api</SelectItem>
                  <SelectItem value="newapi">new-api</SelectItem>
                  <SelectItem value="unsupported">不支持查询</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                当前：{balanceTemplate === "sub2api" ? "sub2api" : balanceTemplate === "newapi" ? "new-api" : balanceTemplate === "unsupported" ? "不支持查询" : "自动识别"}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("providerForm.notes", { defaultValue: "备注" })}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {appId === "codex" ? (
          <FormField
            control={form.control}
            name="authJson"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{configLabel}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={10}
                    spellCheck={false}
                    className="font-mono text-sm"
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  这里单独编辑 Codex 的 auth.json。config.toml 不在这里展示；Base URL 字段只会让后端补丁 managed openai_base_url 行。
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="settingsConfig"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{configLabel}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={10}
                    spellCheck={false}
                    className="font-mono text-sm"
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">可直接编辑完整 settings.json。</p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {showButtons && (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("common.saving") : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}

export type ProviderFormValues = ProviderFormData & {
  presetCategory?: ProviderCategory;
  meta?: ProviderMeta;
};
