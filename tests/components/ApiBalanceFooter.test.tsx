import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiBalanceFooter } from "@/components/ApiBalanceFooter";
import type { Provider } from "@/types";

const balanceApiMock = vi.hoisted(() => ({
  getBalance: vi.fn(),
  getApiUsageBalance: vi.fn(),
}));

vi.mock("@/lib/api/balance", () => ({
  balanceApi: balanceApiMock,
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "p1",
    name: "No Balance",
    category: "custom",
    settingsConfig: {
      env: {
        ANTHROPIC_AUTH_TOKEN: "sk-test",
        ANTHROPIC_BASE_URL: "https://unsupported.example.com",
      },
    },
    meta: { balanceTemplate: "unsupported" },
    ...overrides,
  };
}

describe("ApiBalanceFooter", () => {
  it("does not query or render when provider balance is unsupported", () => {
    renderWithQueryClient(<ApiBalanceFooter provider={provider()} appId="claude" />);

    expect(balanceApiMock.getBalance).not.toHaveBeenCalled();
    expect(balanceApiMock.getApiUsageBalance).not.toHaveBeenCalled();
    expect(screen.queryByText(/Unknown balance provider/i)).toBeNull();
  });
});
