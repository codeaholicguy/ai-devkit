import { resolveTextFromStdinOption } from "../../src/util/stdin.js";

describe("resolveTextFromStdinOption", () => {
  let restoreStdin: (() => void) | undefined;

  function mockReadableStdin(input: string): void {
    const originalIsTTY = process.stdin.isTTY;
    const setEncodingSpy = vi.spyOn(process.stdin, "setEncoding").mockReturnValue(process.stdin);

    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });

    process.nextTick(() => {
      process.stdin.emit("data", input);
      process.stdin.emit("end");
    });

    restoreStdin = () => {
      setEncodingSpy.mockRestore();
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalIsTTY,
      });
    };
  }

  afterEach(() => {
    restoreStdin?.();
    restoreStdin = undefined;
  });

  it("returns inline text when provided", async () => {
    await expect(resolveTextFromStdinOption("inline", {}, "missing", "conflict")).resolves.toBe(
      "inline",
    );
  });

  it("reads stdin when --stdin is set", async () => {
    mockReadableStdin("from stdin\n");
    await expect(
      resolveTextFromStdinOption(undefined, { stdin: true }, "missing", "conflict"),
    ).resolves.toBe("from stdin\n");
  });

  it("rejects inline text combined with --stdin", async () => {
    await expect(
      resolveTextFromStdinOption("inline", { stdin: true }, "missing", "conflict"),
    ).rejects.toThrow("conflict");
  });
});
