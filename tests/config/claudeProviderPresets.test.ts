import { describe, expect, it } from "vitest";
import { providerPresets } from "@/config/claudeProviderPresets";

describe("lite Claude provider presets", () => {
  it("does not ship AWS Bedrock presets", () => {
    expect(providerPresets.some((preset) => preset.name.startsWith("AWS Bedrock"))).toBe(false);
  });
});
