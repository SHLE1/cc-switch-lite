import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProviderActions } from "@/components/providers/ProviderActions";

describe("ProviderActions", () => {
  it("exposes usage configuration for API-key providers", () => {
    const handleConfigureUsage = vi.fn();

    render(
      <ProviderActions
        appId="codex"
        isCurrent={false}
        onSwitch={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onConfigureUsage={handleConfigureUsage}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "配置用量查询" }),
    );

    expect(handleConfigureUsage).toHaveBeenCalledTimes(1);
  });
});
