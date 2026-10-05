import { describe, expect, it } from "vitest";
import {
  STARTABLE_AGENT_TYPES,
  expandHomePath,
  getStartPaneHints,
  getStartTypeAvailability,
  getStartTypeRows,
  isModeAllowedForType,
  isTextFieldFocus,
  nextAgentMode,
  nextFocus,
  nextRecentCwd,
  nextStartAgentType,
  normalizeStartAgentValues,
  previousFocus,
  previousStartAgentType,
  resolveFieldNav,
  trimStartAgentError,
  validateStartAgentValues,
} from "../../../tui/console/StartAgentPane.js";

describe("StartAgentPane helpers", () => {
  it("lists supported agent start types in pane order", () => {
    expect(STARTABLE_AGENT_TYPES).toEqual([
      "claude",
      "codex",
      "copilot",
      "gemini_cli",
      "grok_cli",
      "antigravity_cli",
      "opencode",
      "pi",
      "kiro",
      "devin",
    ]);
  });

  it("cycles to the next agent type", () => {
    expect(nextStartAgentType("claude")).toBe("codex");
    expect(nextStartAgentType("codex")).toBe("copilot");
    expect(nextStartAgentType("copilot")).toBe("gemini_cli");
    expect(nextStartAgentType("opencode")).toBe("pi");
    expect(nextStartAgentType("pi")).toBe("kiro");
    expect(nextStartAgentType("kiro")).toBe("devin");
    expect(nextStartAgentType("devin")).toBe("claude");
  });

  it("cycles to the previous agent type", () => {
    expect(previousStartAgentType("copilot")).toBe("codex");
    expect(previousStartAgentType("gemini_cli")).toBe("copilot");
    expect(previousStartAgentType("pi")).toBe("opencode");
    expect(previousStartAgentType("kiro")).toBe("pi");
    expect(previousStartAgentType("devin")).toBe("kiro");
    expect(previousStartAgentType("claude")).toBe("devin");
  });

  it("renders one row per type with a marker on the selected type", () => {
    const rows = getStartTypeRows("gemini_cli");
    expect(rows).toHaveLength(STARTABLE_AGENT_TYPES.length);
    expect(rows.filter((row) => row.marker === "▶ ").map((row) => row.type)).toEqual([
      "gemini_cli",
    ]);
  });

  it("normalizes submitted name and cwd without changing the selected type", () => {
    expect(
      normalizeStartAgentValues({
        type: "gemini_cli",
        name: "  feature-agent  ",
        cwd: "  /tmp/project  ",
        mode: "interactive",
      }),
    ).toEqual({
      type: "gemini_cli",
      name: "feature-agent",
      cwd: "/tmp/project",
      mode: "interactive",
      prompt: "",
      args: [],
    });
  });

  it("trims the optional initial prompt", () => {
    expect(
      normalizeStartAgentValues({
        type: "codex",
        name: "x",
        cwd: "/tmp",
        prompt: "  fix the tests  ",
      }).prompt,
    ).toBe("fix the tests");
  });

  it("splits extra args respecting quotes", () => {
    expect(
      normalizeStartAgentValues({
        type: "codex",
        name: "x",
        cwd: "/tmp",
        args: `--debug --profile "work env" --flag='some value'`,
      }).args,
    ).toEqual(["--debug", "--profile", "work env", "--flag=some value"]);
    expect(
      normalizeStartAgentValues({ type: "codex", name: "x", cwd: "/tmp" }).args,
    ).toEqual([]);
  });

  it("shows contextual key hints per focused field", () => {
    expect(getStartPaneHints("type")).toContain("↑/↓/j/k type");
    expect(getStartPaneHints("submit")).toContain("enter start");
    expect(getStartPaneHints("cancel")).toContain("enter cancel");
    expect(getStartPaneHints("name")).toContain("enter next");
    expect(getStartPaneHints("mode")).toContain("←/→/h/l mode");
    for (const focus of [
      "type",
      "mode",
      "cwd",
      "name",
      "prompt",
      "args",
      "submit",
      "cancel",
    ] as const) {
      expect(getStartPaneHints(focus)).toContain("esc back");
    }
  });

  it("identifies text-input fields so pane-level char bindings stay guarded", () => {
    expect(isTextFieldFocus("cwd")).toBe(true);
    expect(isTextFieldFocus("name")).toBe(true);
    expect(isTextFieldFocus("prompt")).toBe(true);
    expect(isTextFieldFocus("args")).toBe(true);
    expect(isTextFieldFocus("type")).toBe(false);
    expect(isTextFieldFocus("submit")).toBe(false);
    expect(isTextFieldFocus("cancel")).toBe(false);
  });

  it("moves focus forward and backward across the field order", () => {
    expect(nextFocus("type")).toBe("mode");
    expect(nextFocus("cancel")).toBe("type");
    expect(previousFocus("type")).toBe("cancel");
    expect(previousFocus("submit")).toBe("args");
  });

  it("moves focus backward on Shift+Tab", () => {
    expect(resolveFieldNav("cwd", { tab: true, shift: true })).toBe("previous");
    expect(resolveFieldNav("name", { tab: true, shift: true })).toBe("previous");
  });

  it("moves focus with j/k on non-text fields", () => {
    expect(resolveFieldNav("type", { input: "j" })).toBe("next");
    expect(resolveFieldNav("type", { input: "k" })).toBe("previous");
    expect(resolveFieldNav("submit", { input: "j" })).toBe("next");
    expect(resolveFieldNav("cancel", { input: "k" })).toBe("previous");
  });

  it("does not treat j/k as navigation on text input fields", () => {
    expect(resolveFieldNav("cwd", { input: "j" })).toBeNull();
    expect(resolveFieldNav("name", { input: "k" })).toBeNull();
  });

  it("restricts durable mode to claude, codex and pi", () => {
    expect(isModeAllowedForType("durable", "codex")).toBe(true);
    expect(isModeAllowedForType("durable", "gemini_cli")).toBe(false);
    expect(isModeAllowedForType("interactive", "gemini_cli")).toBe(true);
  });

  it("does not cycle to durable mode for unsupported types", () => {
    expect(nextAgentMode("interactive", "codex")).toBe("durable");
    expect(nextAgentMode("durable", "codex")).toBe("interactive");
    expect(nextAgentMode("interactive", "gemini_cli")).toBe("interactive");
  });

  it("falls back to interactive when durable is normalized for an unsupported type", () => {
    expect(
      normalizeStartAgentValues({ type: "kiro", name: "x", cwd: "/tmp", mode: "durable" }).mode,
    ).toBe("interactive");
  });

  it("marks types as available only when their harness binary exists", () => {
    const availability = getStartTypeAvailability((command) => command === "codex");
    expect(availability.codex).toBe(true);
    expect(availability.claude).toBe(false);
    expect(availability.devin).toBe(false);
  });

  it("validates name format before submit", () => {
    const exists = () => true;
    expect(
      validateStartAgentValues({ type: "codex", name: "", cwd: "/tmp" }, exists).name,
    ).toBeTruthy();
    expect(
      validateStartAgentValues({ type: "codex", name: "Bad_Name", cwd: "/tmp" }, exists).name,
    ).toBeTruthy();
    expect(
      validateStartAgentValues({ type: "codex", name: "good-name-1", cwd: "/tmp" }, exists).name,
    ).toBeUndefined();
  });

  it("validates cwd emptiness and existence before submit", () => {
    expect(
      validateStartAgentValues({ type: "codex", name: "ok", cwd: "" }, () => true).cwd,
    ).toBeTruthy();
    expect(
      validateStartAgentValues({ type: "codex", name: "ok", cwd: "/missing" }, () => false).cwd,
    ).toContain("does not exist");
    expect(
      validateStartAgentValues({ type: "codex", name: "ok", cwd: "/tmp" }, () => true).cwd,
    ).toBeUndefined();
  });

  it("expands ~ in the submitted cwd", () => {
    expect(expandHomePath("~/code", "/home/u")).toBe("/home/u/code");
    expect(expandHomePath("~", "/home/u")).toBe("/home/u");
    expect(expandHomePath("/abs/path", "/home/u")).toBe("/abs/path");
    expect(expandHomePath("~other/x", "/home/u")).toBe("~other/x");
    expect(
      normalizeStartAgentValues({ type: "codex", name: "x", cwd: "~/proj" }).cwd,
    ).toBe(`${process.env.HOME}/proj`);
  });

  it("cycles recent cwds and skips empty input", () => {
    const recents = ["/a", "/b", "/c"];
    expect(nextRecentCwd("/a", recents)).toBe("/b");
    expect(nextRecentCwd("/elsewhere", recents)).toBe("/a");
    expect(nextRecentCwd("/c", recents)).toBe("/a");
    expect(nextRecentCwd("/a", [])).toBeNull();
  });

  it("keeps short error messages unchanged", () => {
    expect(trimStartAgentError("cwd does not exist", 80)).toBe("cwd does not exist");
  });

  it("clips long error messages to fit the pane width", () => {
    expect(trimStartAgentError("x".repeat(100), 30)).toBe(`${"x".repeat(23)}...`);
  });

  it("keeps multi-line errors up to the last N lines", () => {
    const error = ["line one", "line two", "line three", "line four", "line five"].join("\n");
    expect(trimStartAgentError(error, 80, 3)).toBe("line three\nline four\nline five");
    expect(trimStartAgentError("first\nsecond", 80)).toBe("first\nsecond");
  });
});
