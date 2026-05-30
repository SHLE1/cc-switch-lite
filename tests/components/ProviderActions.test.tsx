import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProviderActions } from "@/components/providers/ProviderActions";

describe("ProviderActions", () => {
  it("disables switching the current provider", () => {
    const handleSwitch = vi.fn();

    render(
      <ProviderActions
        isCurrent={true}
        onSwitch={handleSwitch}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const switchButton = screen.getByRole("button", { name: "已启用" });
    expect(switchButton).toBeDisabled();

    fireEvent.click(switchButton);

    expect(handleSwitch).not.toHaveBeenCalled();
  });
});
