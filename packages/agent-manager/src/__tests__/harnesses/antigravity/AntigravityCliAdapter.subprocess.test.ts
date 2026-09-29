/**
 * Subprocess budget tests for AntigravityCliAdapter (#257).
 *
 * `child_process` is mocked so every spawn is recorded; the real process
 * utilities and AgentManager run on top of it. Detection must never use the
 * synchronous child_process APIs and must reuse the shared snapshot.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as childProcess from "child_process";

import { AntigravityCliAdapter } from "../../../harnesses/antigravity/AntigravityCliAdapter.js";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { AgentManager } from "../../../AgentManager.js";
import { AgentRegistry } from "../../../utils/AgentRegistry.js";
import { createProcessSnapshotCapture } from "../../../utils/process.js";

vi.mock("child_process", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("child_process");
  const forbidden = (name: string) =>
    vi.fn(() => {
      throw new Error(`unexpected child_process.${name} call`);
    });
  return {
    ...actual,
    execFile: vi.fn(),
    exec: forbidden("exec"),
    spawn: forbidden("spawn"),
    execFileSync: forbidden("execFileSync"),
    execSync: forbidden("execSync"),
    spawnSync: forbidden("spawnSync"),
  };
});

const AGY_PID = 4242;
const AGY_CWD = "/Users/dev/my-project";

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

/** Fake `ps`/`lsof` output for one running agy process plus an unrelated one. */
function fakeExecFile(file: string, args: readonly string[]): string {
  if (file === "ps" && args[0] === "-axo") {
    return [`${AGY_PID} 1 ttys010 /usr/local/bin/agy`, "77 1 ttys011 node server.js"].join("\n");
  }
  if (file === "lsof") return `p${AGY_PID}\nn${AGY_CWD}\n`;
  if (file === "ps" && args[0] === "-o") return `${AGY_PID} Wed Mar 18 23:18:01 2026\n`;
  throw new Error(`unexpected execFile ${file} ${args.join(" ")}`);
}

const mockedExecFile = childProcess.execFile as unknown as ReturnType<typeof vi.fn>;
const syncApis = ["execFileSync", "execSync", "spawnSync"] as const;
const allSpawnApis = [...syncApis, "execFile", "exec", "spawn"] as const;

function callCount(api: (typeof allSpawnApis)[number]): number {
  return (childProcess[api] as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
}

describe("AntigravityCliAdapter subprocess usage", () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "agy-subprocess-test-"));
    process.env.ANTIGRAVITY_CLI_HOME = base;
    for (const api of allSpawnApis) {
      (childProcess[api] as unknown as ReturnType<typeof vi.fn>).mockClear();
    }
    mockedExecFile.mockImplementation(
      (file: string, args: readonly string[], _opts: unknown, cb: ExecFileCallback) => {
        try {
          cb(null, fakeExecFile(file, args), "");
        } catch (error) {
          cb(error as Error, "", "");
        }
      },
    );
  });

  afterEach(() => {
    delete process.env.ANTIGRAVITY_CLI_HOME;
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("spawns no subprocess when the injected snapshot has no agy process", async () => {
    const adapter = new AntigravityCliAdapter();
    const snapshot: ProcessInfo[] = [{ pid: 77, command: "node server.js", cwd: "/x", tty: "" }];

    expect(await adapter.detectAgents({ processes: snapshot })).toEqual([]);

    for (const api of allSpawnApis) expect(callCount(api)).toBe(0);
  });

  it("spawns no subprocess when the injected snapshot contains an agy process", async () => {
    const adapter = new AntigravityCliAdapter();
    const snapshot: ProcessInfo[] = [
      { pid: AGY_PID, command: "agy", cwd: AGY_CWD, tty: "ttys010", startTime: new Date() },
    ];

    const agents = await adapter.detectAgents({ processes: snapshot });

    expect(agents.map((agent) => agent.pid)).toEqual([AGY_PID]);
    for (const api of allSpawnApis) expect(callCount(api)).toBe(0);
  });

  it("never calls synchronous child_process APIs when capturing its own snapshot", async () => {
    const adapter = new AntigravityCliAdapter();

    const agents = await adapter.detectAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ pid: AGY_PID, projectPath: AGY_CWD });
    for (const api of syncApis) expect(callCount(api)).toBe(0);
  });

  it("makes a full listAgents() refresh spawn exactly one ps + lsof + ps lstart set", async () => {
    // A fresh capture: the shared one caches start times from earlier tests (#266).
    const manager = new AgentManager(
      new AgentRegistry(path.join(base, "agents.json")),
      createProcessSnapshotCapture(),
    );
    manager.registerAdapter(new AntigravityCliAdapter());

    const agents = await manager.listAgents();

    expect(agents.map((agent) => agent.pid)).toEqual([AGY_PID]);
    const spawned = mockedExecFile.mock.calls.map(
      ([file, args]) => `${file} ${(args as string[])[0]}`,
    );
    expect(spawned.sort()).toEqual(["lsof -a", "ps -axo", "ps -o"]);
    for (const api of syncApis) expect(callCount(api)).toBe(0);
  });
});
