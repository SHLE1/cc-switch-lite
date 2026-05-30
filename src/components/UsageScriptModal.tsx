import React, { useState } from "react";
import { Eye, EyeOff, Play, Save } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { Provider, UsageData, UsageScript } from "@/types";
import { createUsageScript } from "@/types";
import { usageApi, settingsApi, type AppId } from "@/lib/api";
import { useSettingsQuery } from "@/lib/query";
import { extractCodexBaseUrl } from "@/utils/providerConfigUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { TEMPLATE_TYPES, type TemplateType } from "@/config/constants";

interface UsageScriptModalProps {
  provider: Provider;
  appId: AppId;
  isOpen: boolean;
  onClose: () => void;
  onSave: (script: UsageScript) => void;
}

type ApiUsageTemplate =
  | typeof TEMPLATE_TYPES.SUB2API
  | typeof TEMPLATE_TYPES.NEW_API;

const API_USAGE_TEMPLATES: Array<{
  id: ApiUsageTemplate;
  label: string;
  description: string;
}> = [
  {
    id: TEMPLATE_TYPES.SUB2API,
    label: "Sub2API",
    description: "GET /v1/usage，适合 sub2api 兼容服务。",
  },
  {
    id: TEMPLATE_TYPES.NEW_API,
    label: "NewAPI",
    description:
      "GET /dashboard/billing/subscription + /dashboard/billing/usage，适合 new-api 面板。",
  },
];

function isApiUsageTemplate(value: unknown): value is ApiUsageTemplate {
  return value === TEMPLATE_TYPES.SUB2API || value === TEMPLATE_TYPES.NEW_API;
}

const UsageScriptModal: React.FC<UsageScriptModalProps> = ({
  provider,
  appId,
  isOpen,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settingsData } = useSettingsQuery();
  const [showUsageConfirm, setShowUsageConfirm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const providerCredentials = getProviderCredentials(provider, appId);
  const savedScript = provider.meta?.usage_script;
  const initialTemplate = isApiUsageTemplate(savedScript?.templateType)
    ? savedScript.templateType
    : TEMPLATE_TYPES.SUB2API;
  const [selectedTemplate, setSelectedTemplate] =
    useState<ApiUsageTemplate>(initialTemplate);
  const [script, setScript] = useState<UsageScript>(() =>
    createUsageScript({
      ...savedScript,
      enabled: savedScript?.enabled ?? true,
      language: "javascript",
      code: "",
      templateType: initialTemplate,
      timeout: savedScript?.timeout ?? 10,
      autoQueryInterval:
        savedScript?.autoQueryInterval ?? savedScript?.autoIntervalMinutes ?? 5,
      apiKey: savedScript?.apiKey,
      baseUrl: savedScript?.baseUrl,
      accessToken: undefined,
      userId: undefined,
      codingPlanProvider: undefined,
    }),
  );

  const effectiveApiKey = script.apiKey?.trim() || providerCredentials.apiKey || "";
  const effectiveBaseUrl =
    script.baseUrl?.trim() || providerCredentials.baseUrl || "";

  const handleEnableToggle = (checked: boolean) => {
    if (checked && !settingsData?.usageConfirmed) {
      setShowUsageConfirm(true);
      return;
    }
    setScript((prev) => ({ ...prev, enabled: checked }));
  };

  const handleUsageConfirm = async () => {
    setShowUsageConfirm(false);
    try {
      if (settingsData) {
        const { webdavSync: _, ...rest } = settingsData;
        await settingsApi.save({ ...rest, usageConfirmed: true });
        await queryClient.invalidateQueries({ queryKey: ["settings"] });
      }
    } catch (error) {
      console.error("Failed to save usage confirmed:", error);
    }
    setScript((prev) => ({ ...prev, enabled: true }));
  };

  const validateTimeout = (value: string): number => {
    const num = Number(value);
    if (Number.isNaN(num) || value.trim() === "") return 10;
    if (!Number.isInteger(num)) {
      toast.warning(
        t("usageScript.timeoutMustBeInteger", {
          defaultValue: "超时时间必须为整数",
        }),
      );
    }
    if (num < 0) {
      toast.error(
        t("usageScript.timeoutCannotBeNegative", {
          defaultValue: "超时时间不能为负数",
        }),
      );
      return 10;
    }
    return Math.floor(num);
  };

  const validateAndClampInterval = (value: string): number => {
    const num = Number(value);
    if (Number.isNaN(num) || value.trim() === "") return 0;
    if (!Number.isInteger(num)) {
      toast.warning(
        t("usageScript.intervalMustBeInteger", {
          defaultValue: "自动查询间隔必须为整数",
        }),
      );
    }
    if (num < 0) {
      toast.error(
        t("usageScript.intervalCannotBeNegative", {
          defaultValue: "自动查询间隔不能为负数",
        }),
      );
      return 0;
    }
    return Math.max(0, Math.min(1440, Math.floor(num)));
  };

  const buildSavedScript = (): UsageScript => ({
    ...script,
    language: "javascript",
    code: "",
    templateType: selectedTemplate as TemplateType,
    apiKey: script.apiKey?.trim() || undefined,
    baseUrl: script.baseUrl?.trim() || undefined,
    accessToken: undefined,
    userId: undefined,
    codingPlanProvider: undefined,
  });

  const handleSave = () => {
    onSave(buildSavedScript());
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await usageApi.testScript(
        provider.id,
        appId,
        "",
        script.timeout,
        effectiveApiKey,
        effectiveBaseUrl,
        undefined,
        undefined,
        selectedTemplate as TemplateType,
      );

      if (result.success && result.data && result.data.length > 0) {
        const summary = result.data
          .map((plan: UsageData) => {
            const planInfo = plan.planName ? `[${plan.planName}] ` : "";
            const unit = plan.unit ? ` ${plan.unit}` : "";
            return `${planInfo}${t("usage.remaining", { defaultValue: "剩余" })} ${plan.remaining ?? "-"}${unit}`;
          })
          .join(", ");
        toast.success(
          `${t("usageScript.testSuccess", { defaultValue: "测试成功：" })}${summary}`,
          { duration: 3000, closeButton: true },
        );
        queryClient.setQueryData(["usage", provider.id, appId], result);
      } else {
        toast.error(
          `${t("usageScript.testFailed", { defaultValue: "测试失败" })}: ${result.error || t("endpointTest.noResult", { defaultValue: "无结果" })}`,
          { duration: 5000 },
        );
      }
    } catch (error: any) {
      toast.error(
        `${t("usageScript.testFailed", { defaultValue: "测试失败" })}: ${error?.message || t("common.unknown", { defaultValue: "未知错误" })}`,
        { duration: 5000 },
      );
    } finally {
      setTesting(false);
    }
  };

  const footer = (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleTest}
        disabled={!script.enabled || testing}
      >
        <Play size={14} className="mr-1" />
        {testing
          ? t("usageScript.testing", { defaultValue: "测试中..." })
          : t("usageScript.testScript", { defaultValue: "测试脚本" })}
      </Button>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onClose}
          className="border-border/20 hover:bg-accent hover:text-accent-foreground"
        >
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSave}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Save size={16} className="mr-2" />
          {t("usageScript.saveConfig", { defaultValue: "保存配置" })}
        </Button>
      </div>
    </>
  );

  return (
    <FullScreenPanel
      isOpen={isOpen}
      title={`${t("usageScript.title", { defaultValue: "配置用量查询" })} - ${provider.name}`}
      onClose={onClose}
      footer={footer}
    >
      <div className="glass rounded-xl border border-white/10 px-6 py-4 flex items-center justify-between gap-4">
        <p className="text-base font-medium leading-none text-foreground">
          {t("usageScript.enableUsageQuery", { defaultValue: "启用用量查询" })}
        </p>
        <Switch
          checked={script.enabled}
          onCheckedChange={handleEnableToggle}
          aria-label={t("usageScript.enableUsageQuery", {
            defaultValue: "启用用量查询",
          })}
        />
      </div>

      {script.enabled && (
        <div className="space-y-6">
          <div className="space-y-4 glass rounded-xl border border-white/10 p-6">
            <Label className="text-base font-medium">
              {t("usageScript.presetTemplate", { defaultValue: "预设模板" })}
            </Label>
            <div className="flex gap-2 flex-wrap">
              {API_USAGE_TEMPLATES.map((template) => {
                const isSelected = selectedTemplate === template.id;
                return (
                  <Button
                    key={template.id}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "rounded-lg border",
                      isSelected
                        ? "shadow-sm"
                        : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    onClick={() => {
                      setSelectedTemplate(template.id);
                      setScript((prev) => ({
                        ...prev,
                        code: "",
                        templateType: template.id,
                        accessToken: undefined,
                        userId: undefined,
                        codingPlanProvider: undefined,
                      }));
                    }}
                  >
                    {template.label}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {
                API_USAGE_TEMPLATES.find(
                  (template) => template.id === selectedTemplate,
                )?.description
              }
            </p>
          </div>

          <div className="space-y-4 glass rounded-xl border border-white/10 p-6">
            <div className="flex items-start justify-between">
              <h4 className="text-sm font-medium text-foreground">
                {t("usageScript.credentialsConfig", {
                  defaultValue: "凭证配置",
                })}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t("usageScript.credentialsHint", {
                  defaultValue: "留空则自动使用供应商配置",
                })}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="usage-api-key">
                  API Key{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({t("usageScript.optional", { defaultValue: "可选" })})
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="usage-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={script.apiKey || ""}
                    onChange={(event) =>
                      setScript((prev) => ({
                        ...prev,
                        apiKey: event.target.value,
                      }))
                    }
                    placeholder={
                      providerCredentials.apiKey
                        ? t("usageScript.useProviderApiKey", {
                            defaultValue: "留空则使用供应商的 API Key",
                          })
                        : t("usageScript.apiKeyPlaceholder", {
                            defaultValue: "输入用量查询 API Key",
                          })
                    }
                    autoComplete="off"
                    className="border-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((value) => !value)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showApiKey
                        ? t("apiKeyInput.hide", { defaultValue: "隐藏" })
                        : t("apiKeyInput.show", { defaultValue: "显示" })
                    }
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="usage-base-url">
                  {t("usageScript.baseUrl", { defaultValue: "请求地址" })}{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({t("usageScript.optional", { defaultValue: "可选" })})
                  </span>
                </Label>
                <Input
                  id="usage-base-url"
                  type="text"
                  value={script.baseUrl || ""}
                  onChange={(event) =>
                    setScript((prev) => ({
                      ...prev,
                      baseUrl: event.target.value,
                    }))
                  }
                  placeholder={
                    providerCredentials.baseUrl
                      ? t("usageScript.useProviderBaseUrl", {
                          defaultValue: "留空则使用供应商的请求地址",
                        })
                      : "https://api.example.com"
                  }
                  autoComplete="off"
                  className="border-white/10"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 glass rounded-xl border border-white/10 p-6">
            <div className="space-y-2">
              <Label htmlFor="usage-timeout">
                {t("usageScript.timeoutSeconds", {
                  defaultValue: "超时时间（秒）",
                })}
              </Label>
              <Input
                id="usage-timeout"
                type="number"
                min={0}
                value={script.timeout ?? 10}
                onChange={(event) =>
                  setScript((prev) => ({
                    ...prev,
                    timeout:
                      event.target.value === ""
                        ? ("" as unknown as number)
                        : Number(event.target.value),
                  }))
                }
                onBlur={(event) =>
                  setScript((prev) => ({
                    ...prev,
                    timeout: validateTimeout(event.target.value),
                  }))
                }
                className="border-white/10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="usage-interval">
                {t("usageScript.autoIntervalMinutes", {
                  defaultValue: "自动查询间隔（分钟，0 表示不自动查询）",
                })}
              </Label>
              <Input
                id="usage-interval"
                type="number"
                min={0}
                max={1440}
                value={
                  script.autoQueryInterval ?? script.autoIntervalMinutes ?? 5
                }
                onChange={(event) =>
                  setScript((prev) => ({
                    ...prev,
                    autoQueryInterval:
                      event.target.value === ""
                        ? ("" as unknown as number)
                        : Number(event.target.value),
                  }))
                }
                onBlur={(event) =>
                  setScript((prev) => ({
                    ...prev,
                    autoQueryInterval: validateAndClampInterval(
                      event.target.value,
                    ),
                  }))
                }
                className="border-white/10"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showUsageConfirm}
        variant="info"
        title={t("confirm.usage.title", { defaultValue: "启用用量查询" })}
        message={t("confirm.usage.message", {
          defaultValue:
            "用量查询会向供应商接口发送请求，请确认你信任该供应商。",
        })}
        confirmText={t("confirm.usage.confirm", { defaultValue: "启用" })}
        onConfirm={() => void handleUsageConfirm()}
        onCancel={() => setShowUsageConfirm(false)}
      />
    </FullScreenPanel>
  );
};

function getProviderCredentials(
  provider: Provider,
  appId: AppId,
): { apiKey: string | undefined; baseUrl: string | undefined } {
  try {
    const config = provider.settingsConfig;
    if (!config) return { apiKey: undefined, baseUrl: undefined };

    if (appId === "claude") {
      const env = (config as any).env || {};
      return {
        apiKey: env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY,
        baseUrl: env.ANTHROPIC_BASE_URL,
      };
    }

    if (appId === "codex") {
      const auth = (config as any).auth || {};
      const configToml = (config as any).config || "";
      return {
        apiKey: auth.OPENAI_API_KEY,
        baseUrl: extractCodexBaseUrl(configToml),
      };
    }

    return { apiKey: undefined, baseUrl: undefined };
  } catch (error) {
    console.error("Failed to extract provider credentials:", error);
    return { apiKey: undefined, baseUrl: undefined };
  }
}

export default UsageScriptModal;
