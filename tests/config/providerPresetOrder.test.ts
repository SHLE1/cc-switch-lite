import { describe, expect, it } from "vitest";
import { providerPresets } from "@/config/claudeProviderPresets";
import { codexProviderPresets } from "@/config/codexProviderPresets";

describe("lite provider presets", () => {
  it("only ships the Claude official preset", () => {
    expect(providerPresets).toEqual([
      expect.objectContaining({
        name: "Claude Official",
        category: "official",
        isOfficial: true,
      }),
    ]);
  });

  it("only ships the Codex official preset", () => {
    expect(codexProviderPresets).toEqual([
      expect.objectContaining({
        name: "OpenAI Official",
        category: "official",
        isOfficial: true,
      }),
    ]);
  });
});
