import { describe, expect, it } from "vitest";
import { parseAnthropicCapacity } from "../../capacity/providers/anthropic.js";
import { resolvePiAnthropicCredential } from "../../harnesses/pi/credentials.js";

describe("capacity boundaries", () => {
  it("keeps Pi credential extraction separate from Anthropic quota parsing", async () => {
    const credential = await resolvePiAnthropicCredential({
      env: { HOME: "/users/test" },
      readFile: async () =>
        JSON.stringify({
          anthropic: {
            type: "oauth",
            access: "fake-boundary-token",
            expires: Date.parse("2026-10-01T00:00:00.000Z"),
          },
        }),
    });

    const snapshot = parseAnthropicCapacity({ five_hour: { utilization: 25 } });

    expect(credential).toEqual({
      kind: "oauth",
      access: "fake-boundary-token",
      expiresMs: Date.parse("2026-10-01T00:00:00.000Z"),
    });
    expect(snapshot).toMatchObject({
      authenticated: true,
      available: "yes",
      windows: [{ id: "session", usedPercent: 25 }],
      creditsRemaining: null,
    });
    expect(snapshot).not.toHaveProperty("harness");
    expect(snapshot).not.toHaveProperty("provider");
    expect(snapshot).not.toHaveProperty("generatedAt");
  });
});
