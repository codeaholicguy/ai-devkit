import { describe, expect, it } from "vitest";
import {
  STARTABLE_AGENT_TYPES,
  getStartPaneHints,
  getStartTypeRows,
  nextFocus,
  nextStartAgentType,
  normalizeStartAgentValues,
  previousFocus,
  previousStartAgentType,
  resolveFieldNav,
  trimStartAgentError,
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
      }),
    ).toEqual({
      type: "gemini_cli",
      name: "feature-agent",
      cwd: "/tmp/project",
    });
  });

  it("shows contextual key hints per focused field", () => {
    expect(getStartPaneHints("type")).toContain("↑/↓/j/k type");
    expect(getStartPaneHints("submit")).toContain("enter start");
    expect(getStartPaneHints("cancel")).toContain("enter cancel");
    expect(getStartPaneHints("name")).toContain("enter next");
    for (const focus of ["type", "cwd", "name", "submit", "cancel"] as const) {
      expect(getStartPaneHints(focus)).toContain("esc back");
    }
  });

  it("moves focus forward and backward across the field order", () => {
    expect(nextFocus("type")).toBe("cwd");
    expect(nextFocus("cancel")).toBe("type");
    expect(previousFocus("type")).toBe("cancel");
    expect(previousFocus("submit")).toBe("name");
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
