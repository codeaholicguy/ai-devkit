import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  capacityCommand,
  registerCapacityCommand,
} from "../../../commands/capacity.js";
import { renderCapacityReports } from "../../../commands/capacity/render.js";
import type { CapacityReport } from "@ai-devkit/agent-manager";
import { ui } from "../../../util/terminal-ui.js";

vi.mock("../../../util/terminal-ui.js", () => ({
  ui: { text: vi.fn(), table: vi.fn(), warning: vi.fn(), breakline: vi.fn() },
}));

const now = new Date("2026-08-09T10:00:00.000Z");
const localClock = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const ANSI_PATTERN =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
// ui.text receives chalk-formatted strings; assertions must hold with or
// without color support (TTY vs piped output, FORCE_COLOR in hooks).
const textCalls = (): string[] =>
  vi.mocked(ui.text).mock.calls.map(([text]) => text.replace(ANSI_PATTERN, ""));

const codexReport: CapacityReport = {
  harness: "codex",
  provider: "openai",
  generatedAt: "2026-08-09T10:00:00.000Z",
  authenticated: true,
  available: "yes",
  windows: [
    {
      id: "session",
      label: "Session",
      durationMinutes: 300,
      usedPercent: 20,
      resetsAt: "2026-08-09T12:00:00.000Z",
    },
    {
      id: "weekly",
      label: "Weekly",
      durationMinutes: 10080,
      usedPercent: 60,
      resetsAt: "2026-08-16T10:00:00.000Z",
    },
  ],
  creditsRemaining: 1,
};

const zaiReport: CapacityReport = {
  harness: "pi",
  provider: "zai",
  generatedAt: "2026-08-09T10:00:00.000Z",
  authenticated: true,
  available: "yes",
  windows: [
    {
      id: "zai:tokens:1",
      label: "Tokens · 5 hours",
      limitType: "TOKENS_LIMIT",
      durationMinutes: 300,
      usedPercent: 30,
      resetsAt: "2026-08-09T14:53:00.000Z",
      total: 1000,
      current: 200,
      remaining: 700,
    },
    {
      id: "zai:time:2",
      label: "MCP · monthly",
      limitType: "TIME_LIMIT",
      durationMinutes: 43200,
      usedPercent: 95,
      resetsAt: "2026-09-01T00:52:00.000Z",
      total: 100,
      current: 95,
      remaining: 5,
    },
  ],
  creditsRemaining: null,
};

const claudeReport: CapacityReport = {
  harness: "claude",
  provider: "anthropic",
  generatedAt: "2026-08-09T10:00:00.000Z",
  authenticated: true,
  available: "yes",
  windows: [
    {
      id: "session",
      label: "Session",
      durationMinutes: 300,
      usedPercent: 15,
      resetsAt: "2026-08-09T12:00:00.000Z",
    },
  ],
  creditsRemaining: null,
};

describe("capacity rendering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the JSON report exactly for a single provider", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    renderCapacityReports([codexReport], { json: true, now: () => now });
    expect(log).toHaveBeenCalledWith(JSON.stringify(codexReport, null, 2));
    log.mockRestore();
  });

  it("renders a JSON array for multiple providers", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    renderCapacityReports([codexReport, zaiReport], {
      json: true,
      now: () => now,
    });
    expect(log).toHaveBeenCalledWith(
      JSON.stringify([codexReport, zaiReport], null, 2),
    );
    log.mockRestore();
  });

  it("renders a single-provider identity header and quota table", () => {
    renderCapacityReports([zaiReport], { now: () => now });
    expect(textCalls()).toContain("pi · z.ai capacity · LIMITED");
    expect(ui.table).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ["Quota", "Usage", "Resets"],
        rows: [
          [
            "Tokens · 5 hours",
            "███░░░░░░░ 30% · 300/1000",
            `in 4h 53m · ${localClock(new Date("2026-08-09T14:53:00.000Z"))}`,
          ],
          [
            "MCP · monthly",
            "██████████ 95% · 95/100",
            `Sep 1 · ${localClock(new Date("2026-09-01T00:52:00.000Z"))}`,
          ],
        ],
      }),
    );
  });

  it("drops dead columns when totals are unknown", () => {
    renderCapacityReports([codexReport], { now: () => now });
    expect(textCalls()).toContain("codex · OpenAI capacity · OK");
    expect(ui.table).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          [
            "Session",
            "██░░░░░░░░ 20%",
            `in 2h · ${localClock(new Date("2026-08-09T12:00:00.000Z"))}`,
          ],
          [
            "Weekly",
            "██████░░░░ 60%",
            `Aug 16 · ${localClock(new Date("2026-08-16T10:00:00.000Z"))}`,
          ],
        ],
      }),
    );
    expect(textCalls()).toContain("  codex · OpenAI: 1 credits remaining");
  });

  it("splits harness and provider columns when listing multiple providers", () => {
    renderCapacityReports([codexReport, zaiReport], { now: () => now });
    expect(textCalls()).toContain("Capacity · 2 providers");
    expect(ui.table).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ["Harness", "Provider", "Status", "Quota", "Usage", "Resets"],
        rows: [
          [
            "codex",
            "OpenAI",
            "OK",
            "Session",
            "██░░░░░░░░ 20%",
            `in 2h · ${localClock(new Date("2026-08-09T12:00:00.000Z"))}`,
          ],
          [
            "codex",
            "OpenAI",
            "OK",
            "Weekly",
            "██████░░░░ 60%",
            `Aug 16 · ${localClock(new Date("2026-08-16T10:00:00.000Z"))}`,
          ],
          [
            "pi",
            "z.ai",
            "LIMITED",
            "Tokens · 5 hours",
            "███░░░░░░░ 30% · 300/1000",
            `in 4h 53m · ${localClock(new Date("2026-08-09T14:53:00.000Z"))}`,
          ],
          [
            "pi",
            "z.ai",
            "LIMITED",
            "MCP · monthly",
            "██████████ 95% · 95/100",
            `Sep 1 · ${localClock(new Date("2026-09-01T00:52:00.000Z"))}`,
          ],
        ],
      }),
    );
  });

  it("reports exhausted and unauthenticated states", () => {
    renderCapacityReports([{ ...codexReport, available: "no" }], {
      now: () => now,
    });
    expect(textCalls()).toContain("codex · OpenAI capacity · EXHAUSTED");
    renderCapacityReports([
      { ...zaiReport, authenticated: false, available: "unknown", windows: [] },
    ]);
    expect(textCalls()).toContain("pi · z.ai capacity · NOT AUTHENTICATED");
    expect(textCalls()).toContain("  No usage windows reported.");
  });
});

describe("capacity command", () => {
  beforeEach(() => vi.clearAllMocks());

  it("probes every supported provider when none is given", async () => {
    const getReport = vi.fn(async (provider: string) => {
      if (provider === "zai") return zaiReport;
      if (provider === "claude") return claudeReport;
      return codexReport;
    });
    await capacityCommand(undefined, {}, getReport);
    expect(getReport).toHaveBeenCalledWith("codex");
    expect(getReport).toHaveBeenCalledWith("zai");
    expect(getReport).toHaveBeenCalledWith("claude");
    expect(textCalls()).toContain("Capacity · 3 providers");
  });

  it("wires the command surface and normalizes the dotted z.ai alias", async () => {
    const getReport = vi.fn(async () => codexReport);
    const program = new Command();
    program.exitOverride();
    registerCapacityCommand(program, getReport);
    await program.parseAsync(["node", "test", "capacity", "z.ai", "--json"]);

    expect(getReport).toHaveBeenCalledWith("zai");
    expect(ui.table).not.toHaveBeenCalled();
  });

  it("accepts Claude as an explicit provider", async () => {
    const getReport = vi.fn(async () => claudeReport);
    await capacityCommand(["Claude"], {}, getReport);
    expect(getReport).toHaveBeenCalledWith("claude");
    expect(textCalls()).toContain("claude · Anthropic capacity · OK");
  });

  it("rejects unknown providers before probing", async () => {
    const getReport = vi.fn(async () => codexReport);
    await expect(capacityCommand(["gemini"], {}, getReport)).rejects.toThrow(
      'Supported providers: "codex", "zai", "claude"',
    );
    expect(getReport).not.toHaveBeenCalled();
  });

  it("propagates probe failures when a single provider is requested", async () => {
    const getReport = vi.fn(async () => {
      throw new Error("z.ai API key not found");
    });
    await expect(capacityCommand(["zai"], {}, getReport)).rejects.toThrow(
      "z.ai API key not found",
    );
  });

  it("warns instead of failing when one provider of many is unavailable", async () => {
    const getReport = vi.fn(async (provider: string) => {
      if (provider === "zai") throw new Error("z.ai API key not found");
      return codexReport;
    });
    await capacityCommand(undefined, {}, getReport);
    expect(ui.warning).toHaveBeenCalledWith("zai capacity unavailable: z.ai API key not found");
    expect(textCalls()).toContain("Capacity · 2 providers");
  });

  it("preserves other reports when Claude is unavailable", async () => {
    const getReport = vi.fn(async (provider: string) => {
      if (provider === "claude") throw new Error("Claude OAuth credentials expired");
      return provider === "zai" ? zaiReport : codexReport;
    });
    await capacityCommand(undefined, {}, getReport);
    expect(ui.warning).toHaveBeenCalledWith(
      "claude capacity unavailable: Claude OAuth credentials expired",
    );
    expect(textCalls()).toContain("Capacity · 2 providers");
  });
});
