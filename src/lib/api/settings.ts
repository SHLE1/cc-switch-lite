import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/types";

export const settingsApi = {
  async get(): Promise<Settings> {
    return await invoke("get_settings");
  },

  async save(settings: Settings): Promise<boolean> {
    return await invoke("save_settings", { settings });
  },

  async applyClaudePluginConfig(options: { official: boolean }): Promise<boolean> {
    const { official } = options;
    return await invoke("apply_claude_plugin_config", { official });
  },

  async openExternal(url: string): Promise<void> {
    try {
      const u = new URL(url);
      const scheme = u.protocol.replace(":", "").toLowerCase();
      if (scheme !== "http" && scheme !== "https") {
        throw new Error("Unsupported URL scheme");
      }
    } catch {
      throw new Error("Invalid URL");
    }
    await invoke("open_external", { url });
  },
};
