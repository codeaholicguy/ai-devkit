import { afterEach, describe, expect, it } from "vitest";
import {
  clearRememberedStartDefaults,
  createStartDefaults,
  rememberStartDefaults,
} from "../../../../tui/console/hooks/useStartAgentPane.js";

describe("start-agent defaults", () => {
  afterEach(() => {
    clearRememberedStartDefaults();
  });

  it("defaults to codex and process.cwd() with nothing remembered", () => {
    const defaults = createStartDefaults();
    expect(defaults.type).toBe("codex");
    expect(defaults.cwd).toBe(process.cwd());
    expect(defaults.name).toBeTruthy();
  });

  it("reuses the last-used type and cwd after a successful start", () => {
    rememberStartDefaults({ type: "pi", cwd: "/tmp/some-project" });
    const defaults = createStartDefaults();
    expect(defaults.type).toBe("pi");
    expect(defaults.cwd).toBe("/tmp/some-project");
  });
});
