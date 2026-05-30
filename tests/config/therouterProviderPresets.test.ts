import { describe, expect, it } from "vitest";
import { providerPresets } from "@/config/claudeProviderPresets";
import { codexProviderPresets } from "@/config/codexProviderPresets";

describe("lite provider presets", () => {
  it("does not ship third-party Claude presets", () => {
    expect(providerPresets.some((item) => item.name === "TheRouter")).toBe(false);
  });

  it("does not ship third-party Codex presets", () => {
    expect(codexProviderPresets.some((item) => item.name === "TheRouter")).toBe(false);
  });
});
