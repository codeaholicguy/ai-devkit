import { describe, expect, it, vi } from "vitest";
import { PiCliProbe } from "../../../../harnesses/pi/durable/PiCliProbe.js";

describe("PiCliProbe", () => {
  it("validates documented JSON mode and session capabilities", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "pi 0.52.8", stderr: "" })
      .mockResolvedValueOnce({
        stdout: "--mode json\n--session-id <uuid>\n--session <path|id>",
        stderr: "",
      });
    await expect(new PiCliProbe({ executable: "fake-pi", exec }).validate()).resolves.toEqual({
      executable: "fake-pi",
      version: "pi 0.52.8",
    });
    expect(exec.mock.calls).toEqual([
      ["fake-pi", ["--version"]],
      ["fake-pi", ["--help"]],
    ]);
  });

  it("rejects unsupported and unavailable CLIs with sanitized errors", async () => {
    await expect(
      new PiCliProbe({
        exec: vi
          .fn()
          .mockResolvedValueOnce({ stdout: "", stderr: "" })
          .mockResolvedValueOnce({ stdout: "--print only", stderr: "" }),
      }).validate(),
    ).rejects.toMatchObject({ code: "PI_CLI_UNSUPPORTED" });
    const unavailable = new PiCliProbe({
      exec: vi.fn().mockRejectedValue(new Error(`bad\0${"x".repeat(1000)}`)),
    });
    const error = await unavailable.validate().catch((value: Error & { code: string }) => value);
    expect(error.code).toBe("PI_CLI_UNAVAILABLE");
    expect(error.message).not.toContain("\0");
    expect(error.message.length).toBeLessThan(600);
  });

  it("reports an empty version as unknown", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: " \n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "--mode json --session-id --session", stderr: "" });
    await expect(new PiCliProbe({ exec }).validate()).resolves.toMatchObject({
      version: "unknown",
    });
  });
});
