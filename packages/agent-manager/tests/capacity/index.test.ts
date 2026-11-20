import { describe, expect, it, vi } from "vitest";
import { getAntigravityCapacityReport, getCodexCapacityReport } from "../../src/capacity/index.js";

const checkedAt = "2026-08-09T10:00:00.000Z";

describe("getCodexCapacityReport", () => {
  it("checks Codex installation before probing", async () => {
    const probe = vi.fn(async (context) => ({
      harness: "codex",
      provider: "openai",
      generatedAt: context.checkedAt,
      authenticated: true,
      available: "yes" as const,
      windows: [],
      creditsRemaining: null,
    }));

    const report = await getCodexCapacityReport({
      now: () => new Date(checkedAt),
      path: "/usr/bin:/opt/bin",
      access: async (target) => {
        if (target !== "/opt/bin/codex") throw new Error("missing");
      },
      probe,
    });

    expect(probe).toHaveBeenCalledWith({ installed: true, checkedAt });
    expect(report).toMatchObject({
      harness: "codex",
      provider: "openai",
      generatedAt: checkedAt,
      available: "yes",
    });
  });

  it("redacts unexpected probe failures into a stable unknown result", async () => {
    const report = await getCodexCapacityReport({
      now: () => new Date(checkedAt),
      path: "",
      probe: async () => {
        throw new Error("private provider response");
      },
    });

    expect(report).toMatchObject({
      harness: "codex",
      provider: "openai",
      available: "unknown",
      authenticated: null,
      windows: [],
    });
    expect(JSON.stringify(report)).not.toContain("private provider response");
  });
});

describe("getAntigravityCapacityReport", () => {
  it("delegates to probeAntigravityCapacity with generatedAt from now()", async () => {
    const report = await getAntigravityCapacityReport({
      now: () => new Date(checkedAt),
      env: { ANTIGRAVITY_CLI_PATH: "/opt/bin/agy" },
      access: async () => undefined,
      stat: async () => ({ size: 100, mtimeMs: 100, ino: 1 }),
      readFile: async () => {
        throw new Error("ENOENT");
      },
      exec: async ({ args }) => {
        if (args[0] === "--version") return { exitCode: 0, stdout: "agy 1.2.11\n", stderr: "" };
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            status: "SUCCESS",
            command: {
              name: "usage",
              data: {
                groups: [
                  {
                    name: "Gemini Models",
                    buckets: [
                      {
                        id: "gemini-5h",
                        window: "5h",
                        remaining_fraction: 0.8,
                        reset_time: "2026-08-09T15:00:00Z",
                      },
                    ],
                  },
                ],
              },
            },
          }),
          stderr: "",
        };
      },
    });

    expect(report).toMatchObject({
      harness: "antigravity",
      provider: "antigravity",
      generatedAt: checkedAt,
      authenticated: true,
      available: "yes",
    });
    expect(report.windows).toHaveLength(1);
  });
});
