import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderForm } from "@/components/providers/forms/ProviderForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe("ProviderForm lite editor", () => {
  it("allows editing Codex auth JSON directly", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ProviderForm
        appId="codex"
        submitLabel="保存"
        onSubmit={onSubmit}
        onCancel={() => {}}
        initialData={{
          name: "OpenAI Official",
          websiteUrl: "https://chatgpt.com/codex",
          category: "official",
          settingsConfig: {
            auth: {
              auth_mode: "chatgpt",
              tokens: {
                id_token: "old-token",
              },
            },
            config: "",
          },
        }}
      />,
    );

    const authEditor = screen.getByLabelText("auth.json");
    expect(screen.queryByLabelText(/config\.toml/)).toBeNull();
    await user.clear(authEditor);
    await user.click(authEditor);
    await user.paste(
      JSON.stringify({ auth_mode: "chatgpt", tokens: { id_token: "new-token" } }),
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].settingsConfig).toContain("new-token");
  });

  it("preserves legacy usage_script while changing balance template", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ProviderForm
        appId="claude"
        submitLabel="保存"
        onSubmit={onSubmit}
        onCancel={() => {}}
        initialData={{
          name: "New API",
          category: "custom",
          settingsConfig: {
            env: {
              ANTHROPIC_AUTH_TOKEN: "sk-test",
              ANTHROPIC_BASE_URL: "https://newapi.example.com",
            },
          },
          meta: {
            usage_script: {
              enabled: true,
              language: "javascript",
              code: "",
              templateType: "newapi",
              baseUrl: "https://newapi.example.com",
              apiKey: "usage-key",
            },
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].meta.usage_script).toEqual({
      enabled: true,
      language: "javascript",
      code: "",
      templateType: "newapi",
      baseUrl: "https://newapi.example.com",
      apiKey: "usage-key",
    });
  });

  it("can mark balance querying as unsupported", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ProviderForm
        appId="claude"
        submitLabel="保存"
        onSubmit={onSubmit}
        onCancel={() => {}}
        initialData={{
          name: "Mimo",
          category: "custom",
          settingsConfig: {
            env: {
              ANTHROPIC_AUTH_TOKEN: "sk-test",
              ANTHROPIC_BASE_URL: "https://token-plan-sgp.xiaomimimo.com",
            },
          },
        }}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "余额查询模板" }));
    await user.click(screen.getByRole("option", { name: "不支持查询" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].meta.balanceTemplate).toBe("unsupported");
  });
});
