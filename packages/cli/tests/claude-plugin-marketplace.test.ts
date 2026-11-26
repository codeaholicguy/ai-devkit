import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pluginManifest = JSON.parse(
  readFileSync(new URL("../../../.claude-plugin/plugin.json", import.meta.url), "utf8"),
) as { name: string; version: string; description: string };

const marketplaceManifest = JSON.parse(
  readFileSync(new URL("../../../.claude-plugin/marketplace.json", import.meta.url), "utf8"),
) as {
  name: string;
  plugins: Array<{ name: string; version: string; description: string; source: string }>;
};

describe("Claude Code plugin marketplace manifest", () => {
  it("lists ai-devkit at the repository root", () => {
    expect(marketplaceManifest.plugins).toHaveLength(1);
    const entry = marketplaceManifest.plugins[0];
    expect(entry.name).toBe("ai-devkit");
    expect(entry.source).toBe("./");
  });

  it("keeps plugin entry metadata aligned with plugin.json", () => {
    const entry = marketplaceManifest.plugins[0];
    expect(entry.name).toBe(pluginManifest.name);
    expect(entry.version).toBe(pluginManifest.version);
    expect(entry.description).toBe(pluginManifest.description);
  });
});
