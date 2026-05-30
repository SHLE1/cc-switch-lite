import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TierBadge, remainingPercent } from "@/components/SubscriptionQuotaFooter";
import { subscriptionKeys } from "@/lib/query/subscription";
import type { QuotaTier } from "@/types/subscription";

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === "subscription.fiveHour") return "5h";
  if (key === "subscription.utilization") return `${options?.value}%`;
  return key;
};

describe("subscription quota display", () => {
  it("displays remaining percentage, not used percentage", () => {
    const tier: QuotaTier = {
      name: "five_hour",
      utilization: 72,
      resetsAt: null,
    };

    render(<TierBadge tier={tier} t={t} />);

    expect(remainingPercent(tier)).toBe(28);
    expect(screen.getByText("28%")).toBeInTheDocument();
    expect(screen.queryByText("72%")).not.toBeInTheDocument();
  });

  it("scopes official auth quota cache by provider", () => {
    expect(subscriptionKeys.quota("codex", "auth-a")).not.toEqual(
      subscriptionKeys.quota("codex", "auth-b"),
    );
  });
});
