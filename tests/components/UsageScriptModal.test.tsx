import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import UsageScriptModal from "@/components/UsageScriptModal";
import type { Provider } from "@/types";

vi.mock("@/lib/query", () => ({
  useSettingsQuery: () => ({ data: { usageConfirmed: true } }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<any>("@/lib/api");
  return {
    ...actual,
    usageApi: {
      testScript: vi.fn(),
    },
    settingsApi: {
      save: vi.fn(),
    },
  };
});

function renderModal() {
  const provider: Provider = {
    id: "codex-api",
    name: "Codex API",
    settingsConfig: {
      auth: { OPENAI_API_KEY: "sk-test" },
      config: 'openai_base_url = "https://api.example.com/v1"\n',
    },
    category: "third_party",
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UsageScriptModal
        provider={provider}
        appId="codex"
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("UsageScriptModal", () => {
  it("only exposes auth-switch API usage templates", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "Sub2API" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "NewAPI" })).toBeInTheDocument();
    expect(screen.queryByText("通用模板")).not.toBeInTheDocument();
    expect(screen.queryByText("Token Plan")).not.toBeInTheDocument();
    expect(screen.queryByText("官方")).not.toBeInTheDocument();
    expect(screen.queryByText("提取器代码")).not.toBeInTheDocument();
  });
});
