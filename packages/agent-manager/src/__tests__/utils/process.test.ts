/**
 * Tests for new functions in utils/process.ts
 */

import type { MockedFunction } from "vitest";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile, execFileSync } from "child_process";
import {
  listAgentProcesses,
  batchGetProcessCwds,
  batchGetProcessStartTimes,
  enrichProcesses,
  findWrapperProcess,
  findWrapperProcessPids,
  captureProcessSnapshot,
  createProcessSnapshotCapture,
  filterByProcessNames,
  executableBasename,
  executablePath,
  type ProcessExec,
} from "../../utils/process.js";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = execFileSync as MockedFunction<typeof execFileSync>;
const mockedExecFile = execFile as unknown as MockedFunction<
  (
    file: string,
    args: readonly string[],
    options: object,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => void
>;

describe("captureProcessSnapshot", () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
    mockedExecFileSync.mockReset();
  });

  it("captures and enriches relevant processes without synchronous scans", async () => {
    mockedExecFile.mockImplementation((file, args, _options, callback) => {
      queueMicrotask(() => {
        if (file === "ps" && args.includes("-axo")) {
          callback(
            null,
            "100 1 s001 /usr/bin/claude --resume abc\n" +
              "200 1 s002 C:\\\\tools\\\\node.exe C:\\\\bin\\\\pi.js\n" +
              "300 1 s003 /usr/bin/unrelated\n",
            "",
          );
          return;
        }
        if (file === "lsof") {
          callback(null, "p100\nn/projects/claude\np200\nn/projects/pi\n", "");
          return;
        }
        if (file === "ps" && args.some((arg) => arg.includes("lstart="))) {
          callback(null, "100 Wed Mar 18 23:18:01 2026\n" + "200 Thu Mar 19 10:00:00 2026\n", "");
          return;
        }
        callback(new Error(`unexpected command: ${file} ${args.join(" ")}`), "", "");
      });
    });

    const snapshot = await captureProcessSnapshot(["claude", "node"]);

    expect(snapshot.map((process) => process.pid)).toEqual([100, 200]);
    expect(snapshot.map((process) => process.cwd)).toEqual(["/projects/claude", "/projects/pi"]);
    expect(snapshot.map((process) => process.startTime)).toEqual([
      expect.any(Date),
      expect.any(Date),
    ]);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
    expect(mockedExecFile.mock.calls.filter(([, args]) => args.includes("-axo"))).toHaveLength(1);
    for (const [, , options] of mockedExecFile.mock.calls) {
      expect(options).toMatchObject({ encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      expect(options).not.toHaveProperty("stdio");
    }
  });
});

describe("createProcessSnapshotCapture", () => {
  interface FakeProcess {
    pid: number;
    ppid?: number;
    command: string;
    cwd?: string;
    lstart?: string;
  }

  function createFakeExec(initial: FakeProcess[]) {
    let table = initial;
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const pidsArg = (args: readonly string[]) =>
      args[args.indexOf("-p") + 1].split(",").map((pid) => parseInt(pid, 10));
    const exec: ProcessExec = async (file, args) => {
      calls.push({ file, args });
      if (file === "ps" && args.includes("-axo")) {
        return table.map((p) => `${p.pid} ${p.ppid ?? 1} s001 ${p.command}`).join("\n");
      }
      const requested = new Set(pidsArg(args));
      const rows = table.filter((p) => requested.has(p.pid));
      if (file === "lsof") {
        return rows.map((p) => `p${p.pid}\nn${p.cwd ?? "/"}`).join("\n");
      }
      if (file === "ps" && args.some((arg) => arg.includes("lstart="))) {
        return rows.map((p) => `${p.pid} ${p.lstart ?? "Wed Mar 18 23:18:01 2026"}`).join("\n");
      }
      throw new Error(`unexpected command: ${file} ${args.join(" ")}`);
    };
    return {
      exec,
      calls,
      setTable: (next: FakeProcess[]) => {
        table = next;
      },
      enrichedPids: (file: "lsof" | "lstart") =>
        calls
          .filter((call) =>
            file === "lsof"
              ? call.file === "lsof"
              : call.args.some((arg) => arg.includes("lstart=")),
          )
          .map((call) => pidsArg(call.args)),
    };
  }

  const isGemini = (process: ProcessInfo) => /gemini/.test(process.command);

  it("enriches only candidate PIDs but still returns every name-matched process", async () => {
    const fake = createFakeExec([
      { pid: 10, command: "node /opt/gemini.js", cwd: "/g" },
      { pid: 11, command: "node /opt/vite.js", cwd: "/v" },
      { pid: 12, command: "/usr/bin/unrelated" },
    ]);
    const capture = createProcessSnapshotCapture({ exec: fake.exec });

    const snapshot = await capture(["node"], { isCandidate: isGemini });

    expect(snapshot.map((process) => process.pid)).toEqual([10, 11]);
    expect(snapshot[0]).toMatchObject({ cwd: "/g", startTime: expect.any(Date) });
    expect(snapshot[1].cwd).toBe("");
    expect(snapshot[1].startTime).toBeUndefined();
    expect(fake.enrichedPids("lsof")).toEqual([[10]]);
    expect(fake.enrichedPids("lstart")).toEqual([[10]]);
  });

  it("enriches every name-matched process when no candidate predicate is given", async () => {
    const fake = createFakeExec([
      { pid: 10, command: "node /opt/gemini.js" },
      { pid: 11, command: "node /opt/vite.js" },
    ]);
    const capture = createProcessSnapshotCapture({ exec: fake.exec });

    await capture(["node"]);

    expect(fake.enrichedPids("lsof")).toEqual([[10, 11]]);
    expect(fake.enrichedPids("lstart")).toEqual([[10, 11]]);
  });

  it("spawns only the base ps when no process is a candidate", async () => {
    const fake = createFakeExec([
      { pid: 11, command: "node /opt/vite.js" },
      { pid: 12, command: "node /opt/eslint-server.js" },
    ]);
    const capture = createProcessSnapshotCapture({ exec: fake.exec });

    const snapshot = await capture(["node"], { isCandidate: isGemini });

    expect(snapshot.map((process) => process.pid)).toEqual([11, 12]);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].args).toContain("-axo");
  });

  it("fetches start times once per live PID across refreshes, but cwd every refresh", async () => {
    const fake = createFakeExec([
      { pid: 10, command: "node /opt/gemini.js", lstart: "Wed Mar 18 23:18:01 2026" },
    ]);
    const capture = createProcessSnapshotCapture({ exec: fake.exec });

    const first = await capture(["node"], { isCandidate: isGemini });
    fake.setTable([
      { pid: 10, command: "node /opt/gemini.js", lstart: "Wed Mar 18 23:18:01 2026" },
      { pid: 20, command: "node /opt/gemini.js", lstart: "Thu Mar 19 10:00:00 2026" },
    ]);
    const second = await capture(["node"], { isCandidate: isGemini });
    const third = await capture(["node"], { isCandidate: isGemini });

    expect(fake.enrichedPids("lstart")).toEqual([[10], [20]]);
    expect(fake.enrichedPids("lsof")).toEqual([[10], [10, 20], [10, 20]]);
    expect(second[0].startTime).toEqual(first[0].startTime);
    expect(third.map((process) => process.startTime)).toEqual([
      new Date("Wed Mar 18 23:18:01 2026"),
      new Date("Thu Mar 19 10:00:00 2026"),
    ]);
  });

  it("refetches the start time when a PID is reused by a different process", async () => {
    const fake = createFakeExec([
      { pid: 10, command: "node /opt/gemini.js", lstart: "Wed Mar 18 23:18:01 2026" },
    ]);
    const capture = createProcessSnapshotCapture({ exec: fake.exec });

    await capture(["node"], { isCandidate: isGemini });
    fake.setTable([
      { pid: 10, command: "node /opt/gemini.js --resume", lstart: "Fri Mar 20 08:00:00 2026" },
    ]);
    const reused = await capture(["node"], { isCandidate: isGemini });

    expect(fake.enrichedPids("lstart")).toEqual([[10], [10]]);
    expect(reused[0].startTime).toEqual(new Date("Fri Mar 20 08:00:00 2026"));
  });

  it("forgets cached start times once the PID disappears", async () => {
    const fake = createFakeExec([
      { pid: 10, command: "node /opt/gemini.js", lstart: "Wed Mar 18 23:18:01 2026" },
    ]);
    const capture = createProcessSnapshotCapture({ exec: fake.exec });

    await capture(["node"], { isCandidate: isGemini });
    fake.setTable([]);
    await capture(["node"], { isCandidate: isGemini });
    fake.setTable([
      { pid: 10, command: "node /opt/gemini.js", lstart: "Fri Mar 20 08:00:00 2026" },
    ]);
    const restarted = await capture(["node"], { isCandidate: isGemini });

    expect(fake.enrichedPids("lstart")).toEqual([[10], [10]]);
    expect(restarted[0].startTime).toEqual(new Date("Fri Mar 20 08:00:00 2026"));
  });

  it("retries start times that could not be read", async () => {
    const fake = createFakeExec([{ pid: 10, command: "node /opt/gemini.js", lstart: "garbage" }]);
    const capture = createProcessSnapshotCapture({ exec: fake.exec });

    await capture(["node"], { isCandidate: isGemini });
    await capture(["node"], { isCandidate: isGemini });

    expect(fake.enrichedPids("lstart")).toEqual([[10], [10]]);
  });
});

describe("filterByProcessNames", () => {
  it("matches only argv[0] and normalizes Windows paths and executable suffixes", () => {
    const processes: ProcessInfo[] = [
      { pid: 1, command: "C:\\tools\\node.exe C:\\bin\\pi.js", cwd: "", tty: "" },
      { pid: 2, command: "/usr/local/bin/node /opt/gemini.js", cwd: "", tty: "" },
      { pid: 3, command: "codex exec --cd C:\\repos\\node", cwd: "", tty: "" },
    ];

    expect(filterByProcessNames(processes, ["node"])).toEqual([processes[0], processes[1]]);
    expect(filterByProcessNames(processes, ["node.exe"])).toEqual([processes[0], processes[1]]);
  });
});

describe("executables installed under paths containing spaces", () => {
  let root: string;
  let codexPath: string;
  let nodePath: string;
  let editorPath: string;

  function install(relativePath: string): string {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, "");
    return fullPath;
  }

  beforeEach(() => {
    mockedExecFileSync.mockReset();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "process-spaces-"));
    codexPath = install("Applications/Some App.app/Contents/Resources/codex");
    nodePath = install("Applications/Dev Tools/node/bin/node");
    editorPath = install("usr/bin/vim");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("recovers argv[0] when its directory contains spaces", () => {
    expect(executableBasename(`${codexPath} exec --cd /repo`)).toBe("codex");
    expect(executablePath(`${codexPath} exec --cd /repo`)).toBe(codexPath);
    expect(executableBasename(`${nodePath} /Users/me/.npm/bin/gemini --yolo`)).toBe("node");
  });

  it("does not treat arguments containing spaces as part of the executable path", () => {
    expect(executableBasename(`${editorPath} My Notes/claude`)).toBe("vim");
    expect(executableBasename(`${codexPath} exec fix the Other Dir/claude bug`)).toBe("codex");
    expect(executableBasename("/usr/local/bin/node --title my agent/claude")).toBe("node");
  });

  it("keeps the first-token behaviour for commands without spaces in the path", () => {
    expect(executableBasename("claude")).toBe("claude");
    expect(executableBasename("/usr/local/bin/CLAUDE --continue")).toBe("claude");
    expect(executableBasename("C:\\tools\\node.exe C:\\bin\\pi.js")).toBe("node.exe");
    expect(executableBasename("  ")).toBe("");
  });

  it("matches spaced executables by name in filterByProcessNames", () => {
    const processes: ProcessInfo[] = [
      { pid: 1, command: `${codexPath} resume --last`, cwd: "", tty: "" },
      { pid: 2, command: `${nodePath} /opt/gemini.js`, cwd: "", tty: "" },
      { pid: 3, command: `${editorPath} Some App.app/Contents/Resources/codex`, cwd: "", tty: "" },
      { pid: 4, command: `${codexPath} exec review My Folder/claude`, cwd: "", tty: "" },
    ];

    expect(filterByProcessNames(processes, ["codex"])).toEqual([processes[0], processes[3]]);
    expect(filterByProcessNames(processes, ["node"])).toEqual([processes[1]]);
    expect(filterByProcessNames(processes, ["claude"])).toEqual([]);
  });

  it("captures spaced executables with a single base ps call", async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const exec: ProcessExec = async (file, args) => {
      calls.push({ file, args });
      if (file === "ps" && args.includes("-axo")) {
        return [
          `100 1 s001 ${codexPath} --sandbox workspace-write`,
          `200 1 s002 ${editorPath} Some App.app/Contents/Resources/codex`,
        ].join("\n");
      }
      return "";
    };
    const capture = createProcessSnapshotCapture({ exec });

    const snapshot = await capture(["codex"]);

    expect(snapshot.map((process) => process.pid)).toEqual([100]);
    expect(snapshot[0].command).toBe(`${codexPath} --sandbox workspace-write`);
    expect(calls.filter((call) => call.args.includes("-axo"))).toHaveLength(1);
  });

  it("lists spaced executables in listAgentProcesses", () => {
    mockedExecFileSync.mockReturnValue(`100 1 s001 ${codexPath} exec --json\n`);

    expect(listAgentProcesses("codex").map((process) => process.pid)).toEqual([100]);
  });
});

describe("listAgentProcesses", () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it("should parse ps output and post-filter by executable name", () => {
    mockedExecFileSync.mockReturnValue(
      "78070     1 s018     claude\n" + "55106 55100 s015     claude\n",
    );

    const processes = listAgentProcesses("claude");
    expect(processes).toHaveLength(2);
    expect(processes[0].pid).toBe(78070);
    expect(processes[0].ppid).toBe(1);
    expect(processes[0].command).toBe("claude");
    expect(processes[0].tty).toBe("s018");
    expect(processes[0].cwd).toBe(""); // not populated yet
    expect(processes[1].pid).toBe(55106);
    expect(processes[1].ppid).toBe(55100);
  });

  it("should filter out non-matching executables", () => {
    mockedExecFileSync.mockReturnValue(
      "100 1 s001 claude\n" +
        "200 1 s002 claude-helper --pid 100\n" +
        "300 1 s003 /usr/bin/claude\n",
    );

    const processes = listAgentProcesses("claude");
    expect(processes).toHaveLength(2);
    expect(processes.map((p) => p.pid)).toEqual([100, 300]);
  });

  it("should return empty array on command failure", () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("fail");
    });
    expect(listAgentProcesses("claude")).toEqual([]);
  });

  it("should handle empty output", () => {
    mockedExecFileSync.mockReturnValue("");
    expect(listAgentProcesses("claude")).toEqual([]);
  });

  it("should reject empty pattern", () => {
    expect(listAgentProcesses("")).toEqual([]);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it("should reject patterns with shell injection characters", () => {
    expect(listAgentProcesses("claude; rm -rf /")).toEqual([]);
    expect(listAgentProcesses("claude' || true")).toEqual([]);
    expect(listAgentProcesses("$(whoami)")).toEqual([]);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it("should accept valid patterns with dashes and underscores", () => {
    mockedExecFileSync.mockReturnValue("");
    listAgentProcesses("claude-code");
    expect(mockedExecFileSync).toHaveBeenCalledWith("ps", ["-axo", "pid=,ppid=,tty=,command="], {
      encoding: "utf-8",
    });

    mockedExecFileSync.mockReset();
    mockedExecFileSync.mockReturnValue("");
    listAgentProcesses("my_agent");
    expect(mockedExecFileSync).toHaveBeenCalled();
  });
});

describe("batchGetProcessCwds", () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it("should parse batched lsof output", () => {
    mockedExecFileSync.mockReturnValue(
      "p78070\nn/Users/user/ai-devkit\np55106\nn/Users/user/other-project\n",
    );

    const cwds = batchGetProcessCwds([78070, 55106]);
    expect(cwds.get(78070)).toBe("/Users/user/ai-devkit");
    expect(cwds.get(55106)).toBe("/Users/user/other-project");
  });

  it("should return empty map for empty pids", () => {
    expect(batchGetProcessCwds([])).toEqual(new Map());
  });

  it("should return partial results when lsof succeeds for some PIDs", () => {
    // lsof might not return entries for dead processes
    mockedExecFileSync.mockReturnValue("p78070\nn/Users/user/ai-devkit\n");

    const cwds = batchGetProcessCwds([78070, 99999]);
    expect(cwds.size).toBe(1);
    expect(cwds.get(78070)).toBe("/Users/user/ai-devkit");
  });

  it("should return empty map on total failure", () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("fail");
    });
    const cwds = batchGetProcessCwds([78070]);
    // Falls through to pwdx fallback which also fails
    expect(cwds.size).toBe(0);
  });
});

describe("batchGetProcessStartTimes", () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it("should parse ps lstart output", () => {
    mockedExecFileSync.mockReturnValue(
      " 78070 Wed Mar 18 23:18:01 2026\n" + " 55106 Mon Mar  9 21:41:42 2026\n",
    );

    const times = batchGetProcessStartTimes([78070, 55106]);
    expect(times.size).toBe(2);
    expect(times.get(78070)?.getFullYear()).toBe(2026);
    expect(times.get(55106)?.getMonth()).toBe(2); // March = 2
  });

  it("should return empty map for empty pids", () => {
    expect(batchGetProcessStartTimes([])).toEqual(new Map());
  });

  it("should skip lines with unparseable dates", () => {
    mockedExecFileSync.mockReturnValue(
      " 78070 Wed Mar 18 23:18:01 2026\n" + " 99999 INVALID_DATE\n",
    );

    const times = batchGetProcessStartTimes([78070, 99999]);
    expect(times.size).toBe(1);
    expect(times.has(78070)).toBe(true);
  });

  it("should return empty map on failure", () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("fail");
    });
    expect(batchGetProcessStartTimes([78070])).toEqual(new Map());
  });
});

describe("enrichProcesses", () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it("should populate cwd and startTime on processes", () => {
    // First call: batchGetProcessCwds (lsof)
    // Second call: batchGetProcessStartTimes (ps lstart)
    mockedExecFileSync
      .mockReturnValueOnce("p100\nn/projects/app\n")
      .mockReturnValueOnce(" 100 Wed Mar 18 23:18:01 2026\n");

    const processes = [{ pid: 100, command: "claude", cwd: "", tty: "s001" }];

    const enriched = enrichProcesses(processes);
    expect(enriched[0].cwd).toBe("/projects/app");
    expect(enriched[0].startTime).toBeDefined();
  });

  it("should return empty array for empty input", () => {
    expect(enrichProcesses([])).toEqual([]);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it("should handle partial failures", () => {
    // lsof succeeds, ps lstart fails
    mockedExecFileSync.mockReturnValueOnce("p100\nn/projects/app\n").mockImplementationOnce(() => {
      throw new Error("fail");
    });

    const processes = [{ pid: 100, command: "claude", cwd: "", tty: "s001" }];

    const enriched = enrichProcesses(processes);
    expect(enriched[0].cwd).toBe("/projects/app");
    expect(enriched[0].startTime).toBeUndefined();
  });
});

describe("wrapper process detection", () => {
  it("finds the parent wrapper process for a child in the same terminal and cwd", () => {
    const wrapper = {
      pid: 100,
      ppid: 1,
      command: "node /bin/gemini",
      cwd: "/repo",
      tty: "ttys001",
    };
    const child = {
      pid: 200,
      ppid: 100,
      command: "node --max-old-space-size=8192 /bin/gemini",
      cwd: "/repo",
      tty: "ttys001",
    };

    expect(findWrapperProcess([wrapper, child], child)).toBe(wrapper);
    expect(findWrapperProcessPids([wrapper, child])).toEqual(new Set([100]));
  });

  it("does not mark a matched child process as its own wrapper", () => {
    const child = {
      pid: 200,
      ppid: 100,
      command: "node --max-old-space-size=8192 /bin/gemini",
      cwd: "/repo",
      tty: "ttys001",
    };

    expect(findWrapperProcessPids([child], [child])).toEqual(new Set());
  });
});
