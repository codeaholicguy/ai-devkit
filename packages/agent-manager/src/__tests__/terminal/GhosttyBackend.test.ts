import { execFile } from "child_process";
import { writeFile } from "fs/promises";
import type { Mock } from "vitest";

import { ghosttyBackend } from "../../terminal/backends/ghostty.js";
import { TerminalType, type TerminalLocation } from "../../terminal/types.js";
import { TtyWriter } from "../../terminal/TtyWriter.js";
import { getProcessCwdsAsync } from "../../utils/process.js";

vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>("child_process");
  return { ...actual, execFile: vi.fn() };
});

vi.mock("fs/promises", async () => {
  const actual = await vi.importActual<typeof import("fs/promises")>("fs/promises");
  return { ...actual, writeFile: vi.fn() };
});

vi.mock("../../utils/process.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../utils/process.js")>("../../utils/process.js");
  return { ...actual, getProcessCwdsAsync: vi.fn() };
});

const mockedExecFile = execFile as unknown as Mock;
const mockedGetProcessCwds = getProcessCwdsAsync as unknown as Mock;
const mockedWriteFile = writeFile as unknown as Mock;
const SEP = "\x1f";

interface FakeTerminal {
  id: string;
  name: string;
  dir: string;
}

/**
 * Fake `ps`, process cwds and Ghostty AppleScript. `processes` rows are
 * `pid ppid tty comm`; `cwds` maps pid to its working directory. Writing an
 * OSC 2 title to a TTY renames the terminal listed in `ttyOwner`.
 */
function fakeSystem(opts: {
  processes: string[];
  cwds?: Record<number, string>;
  terminals: FakeTerminal[];
  ttyOwner?: Record<string, string>;
  osascriptResult?: string;
}) {
  const terminals = opts.terminals.map((t) => ({ ...t }));
  mockedGetProcessCwds.mockImplementation(async (pids: number[]) => {
    const cwds = new Map<number, string>();
    for (const pid of pids) if (opts.cwds?.[pid]) cwds.set(pid, opts.cwds[pid]);
    return cwds;
  });
  mockedWriteFile.mockImplementation(async (tty: string, data: string) => {
    // eslint-disable-next-line no-control-regex
    const title = /^\x1b\]2;(.*)\x07$/.exec(data)?.[1];
    const owner = terminals.find((t) => t.id === opts.ttyOwner?.[tty]);
    if (owner && title !== undefined) owner.name = title;
  });
  mockedExecFile.mockImplementation((...args: unknown[]) => {
    const [cmd, argv] = args as [string, string[]];
    const cb = args[args.length - 1] as (err: Error | null, r?: { stdout: string }) => void;
    let stdout = "";
    if (cmd === "ps") stdout = opts.processes.join("\n") + "\n";
    else if (cmd === "osascript" && argv[1].includes("repeat with t in terminals")) {
      stdout = terminals.map((t) => [t.id, t.name, t.dir].join(SEP)).join("\n") + "\n";
    } else if (cmd === "osascript") stdout = opts.osascriptResult ?? "ok\n";
    cb(null, { stdout });
    return {};
  });
  return terminals;
}

const GHOSTTY = "500 1 ?? /Applications/Ghostty.app/Contents/MacOS/ghostty";

describe("Ghostty terminal backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("find", () => {
    it("ignores TTYs when Ghostty is not running", async () => {
      fakeSystem({ processes: ["600 1 ttys001 /usr/bin/login"], terminals: [] });

      expect(await ghosttyBackend.find("/dev/ttys001")).toBeNull();
      expect(mockedExecFile).not.toHaveBeenCalledWith(
        "osascript",
        expect.anything(),
        expect.anything(),
      );
    });

    it("ignores TTYs whose session was not started by Ghostty", async () => {
      fakeSystem({
        processes: [GHOSTTY, "600 500 ttys001 /usr/bin/login", "700 1 ttys002 /usr/bin/login"],
        terminals: [{ id: "T1", name: "zsh", dir: "/repo" }],
      });

      expect(await ghosttyBackend.find("/dev/ttys002")).toBeNull();
      expect(mockedWriteFile).not.toHaveBeenCalled();
    });

    it("matches by working directory when it pairs one terminal with one TTY", async () => {
      fakeSystem({
        processes: [
          GHOSTTY,
          "600 500 ttys001 /usr/bin/login",
          "601 600 ttys001 -zsh",
          "602 601 ttys001 claude",
          "700 500 ttys002 /usr/bin/login",
          "701 700 ttys002 -zsh",
        ],
        cwds: { 601: "/repo/a", 602: "/repo/a", 701: "/repo/b" },
        terminals: [
          { id: "T1", name: "claude", dir: "/repo/a" },
          { id: "T2", name: "zsh", dir: "/repo/b" },
        ],
      });

      expect(await ghosttyBackend.find("/dev/ttys001")).toEqual({
        type: TerminalType.GHOSTTY,
        identifier: "T1",
        tty: "/dev/ttys001",
      });
      expect(mockedWriteFile).not.toHaveBeenCalled();
    });

    it("uses a title marker when two terminals share the directory, then restores the title", async () => {
      const terminals = fakeSystem({
        processes: [
          GHOSTTY,
          "600 500 ttys001 /usr/bin/login",
          "601 600 ttys001 claude",
          "700 500 ttys002 /usr/bin/login",
          "701 700 ttys002 codex",
        ],
        cwds: { 601: "/repo", 701: "/repo" },
        terminals: [
          { id: "T1", name: "first agent", dir: "/repo" },
          { id: "T2", name: "second agent", dir: "/repo" },
        ],
        ttyOwner: { "/dev/ttys001": "T1", "/dev/ttys002": "T2" },
      });

      const location = await ghosttyBackend.find("/dev/ttys002");

      expect(location?.identifier).toBe("T2");
      const titles = mockedWriteFile.mock.calls.map(([tty, data]) => [tty, data]);
      expect(titles).toHaveLength(2);
      expect(titles[0][0]).toBe("/dev/ttys002");
      // eslint-disable-next-line no-control-regex
      expect(titles[0][1]).toMatch(/^\x1b\]2;ai-devkit-\d+-\d+\x07$/);
      expect(titles[1]).toEqual(["/dev/ttys002", "\x1b]2;second agent\x07"]);
      expect(terminals.find((t) => t.id === "T2")?.name).toBe("second agent");
    });

    it("does not trust a unique directory match when another Ghostty TTY has a process there", async () => {
      // T1's own working directory is unreported; T2 sits in the agent's directory.
      fakeSystem({
        processes: [
          GHOSTTY,
          "600 500 ttys001 /usr/bin/login",
          "601 600 ttys001 claude",
          "700 500 ttys002 /usr/bin/login",
          "701 700 ttys002 -zsh",
        ],
        cwds: { 601: "/repo", 701: "/repo" },
        terminals: [
          { id: "T1", name: "claude", dir: "" },
          { id: "T2", name: "zsh", dir: "/repo" },
        ],
        ttyOwner: { "/dev/ttys001": "T1", "/dev/ttys002": "T2" },
      });

      expect((await ghosttyBackend.find("/dev/ttys001"))?.identifier).toBe("T1");
      expect(mockedWriteFile).toHaveBeenCalled();
    });

    it("returns null when no terminal shows the marker", async () => {
      vi.useFakeTimers();
      try {
        fakeSystem({
          processes: [GHOSTTY, "600 500 ttys001 /usr/bin/login"],
          terminals: [
            { id: "T1", name: "a", dir: "/x" },
            { id: "T2", name: "b", dir: "/y" },
          ],
        });

        const result = ghosttyBackend.find("/dev/ttys001");
        await vi.runAllTimersAsync();

        expect(await result).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns null instead of throwing when Ghostty is not scriptable", async () => {
      mockedGetProcessCwds.mockResolvedValue(new Map());
      mockedExecFile.mockImplementation((...args: unknown[]) => {
        const [cmd] = args as [string];
        const cb = args[args.length - 1] as (err: Error | null, r?: { stdout: string }) => void;
        if (cmd === "osascript") cb(new Error("Not authorized to send Apple events"));
        else cb(null, { stdout: `${GHOSTTY}\n600 500 ttys001 /usr/bin/login\n` });
        return {};
      });

      expect(await ghosttyBackend.find("/dev/ttys001")).toBeNull();
    });
  });

  describe("focus, send and sendKey", () => {
    const location: TerminalLocation = {
      type: TerminalType.GHOSTTY,
      identifier: "T1",
      tty: "/dev/ttys001",
    };
    const scripts = () =>
      mockedExecFile.mock.calls.filter(([cmd]) => cmd === "osascript").map(([, argv]) => argv[1]);

    it("focuses the terminal by id and activates Ghostty", async () => {
      fakeSystem({ processes: [], terminals: [] });

      expect(await ghosttyBackend.focus(location)).toBe(true);
      expect(scripts()[0]).toContain('every terminal whose id is "T1"');
      expect(scripts()[0]).toContain("focus t");
      expect(scripts()[0]).toContain("activate");
    });

    it("reports a failed focus when the terminal is gone", async () => {
      fakeSystem({ processes: [], terminals: [], osascriptResult: "not_found\n" });

      expect(await ghosttyBackend.focus(location)).toBe(false);
    });

    it("pastes the message with input text, then types a carriage return", async () => {
      fakeSystem({ processes: [], terminals: [] });

      await TtyWriter.send(location, 'say "hi"\nnext');

      expect(scripts()).toHaveLength(2);
      expect(scripts()[0]).toContain('input text "say \\"hi\\"\\nnext" to t');
      expect(scripts()[1]).toContain('perform action "text:\\\\x0d" on t');
    });

    it("throws when the terminal is gone", async () => {
      fakeSystem({ processes: [], terminals: [], osascriptResult: "not_found\n" });

      await expect(TtyWriter.send(location, "hello")).rejects.toThrow(
        "Ghostty terminal not found for TTY /dev/ttys001",
      );
    });

    // Ghostty parses `text:` with Zig escapes; AppleScript doubles each backslash.
    it.each([
      ["2", "text:2"],
      ["\x1b", "text:\\\\x1b"],
      ["\r", "text:\\\\x0d"],
      ["\\", "text:\\\\\\\\"],
    ])("types key %j with the Ghostty action %s", async (key, action) => {
      fakeSystem({ processes: [], terminals: [] });

      await TtyWriter.sendKey(location, key);

      expect(scripts()[0]).toContain(`perform action "${action}" on t`);
      expect(scripts()[0]).not.toContain("send key");
    });
  });
});
