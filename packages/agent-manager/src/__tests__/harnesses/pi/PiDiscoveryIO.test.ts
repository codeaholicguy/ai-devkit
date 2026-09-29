/**
 * Refresh-path I/O tests for Pi live-session discovery: cost must follow live
 * processes, not the number of historical Pi session files.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { PiAdapter } from "../../../harnesses/pi/PiAdapter.js";
import { AgentRegistry } from "../../../utils/AgentRegistry.js";

vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs");
  return {
    ...actual,
    openSync: vi.fn(actual.openSync),
    readSync: vi.fn(actual.readSync),
    readFileSync: vi.fn(actual.readFileSync),
    readdirSync: vi.fn(actual.readdirSync),
  };
});

const mockedOpenSync = vi.mocked(fs.openSync);
const mockedReadSync = vi.mocked(fs.readSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedReaddirSync = vi.mocked(fs.readdirSync);

const HEAD_LIMIT = 64 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bytes read from `filePath` via readFileSync or fd reads since the last `resetReads()`. */
function bytesReadFrom(filePath: string): number {
  // fds are reused after close, so attribute each read to the latest open of that fd
  const opens = mockedOpenSync.mock.calls.map((call, index) => ({
    path: String(call[0]),
    fd: mockedOpenSync.mock.results[index]?.value as number,
    order: mockedOpenSync.mock.invocationCallOrder[index],
  }));

  let total = 0;
  mockedReadSync.mock.calls.forEach((call, index) => {
    const result = mockedReadSync.mock.results[index];
    const order = mockedReadSync.mock.invocationCallOrder[index];
    const open = opens.filter((o) => o.fd === call[0] && o.order < order).at(-1);
    if (result?.type === "return" && open?.path === filePath) {
      total += result.value as number;
    }
  });
  mockedReadFileSync.mock.calls.forEach((call, index) => {
    const result = mockedReadFileSync.mock.results[index];
    if (result?.type === "return" && String(call[0]) === filePath) {
      total += Buffer.byteLength(result.value as string | Buffer);
    }
  });
  return total;
}

function resetReads(): void {
  mockedOpenSync.mockClear();
  mockedReadSync.mockClear();
  mockedReadFileSync.mockClear();
  mockedReaddirSync.mockClear();
}

function jsonl(entries: unknown[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}

function encodeProjectDir(cwd: string): string {
  return `--${cwd.replace(/^\//, "").replace(/\//g, "-")}--`;
}

/** Pi's session file name for a session created at `createdAt`. */
function sessionFileName(createdAt: Date, sessionId: string): string {
  return `${createdAt.toISOString().replace(/[:.]/g, "-")}_${sessionId}.jsonl`;
}

describe("Pi live discovery I/O", () => {
  let originalHome: string | undefined;
  let tmpHome: string;
  let sessionsDir: string;
  let adapter: PiAdapter;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-discovery-io-"));
    process.env.HOME = tmpHome;
    sessionsDir = path.join(tmpHome, ".pi", "agent", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    adapter = new PiAdapter(new AgentRegistry(path.join(tmpHome, "agents.json")));
    resetReads();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeSession(cwd: string, createdAt: Date, sessionId: string, body = ""): string {
    const projectDir = path.join(sessionsDir, encodeProjectDir(cwd));
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(projectDir, sessionFileName(createdAt, sessionId));
    fs.writeFileSync(
      filePath,
      jsonl([
        {
          type: "session",
          version: 3,
          id: sessionId,
          timestamp: createdAt.toISOString(),
          cwd,
        },
        {
          type: "message",
          timestamp: createdAt.toISOString(),
          message: {
            role: "user",
            content: [{ type: "text", text: `prompt ${sessionId}` }],
          },
        },
      ]) + body,
    );
    return filePath;
  }

  function makeProcess(pid: number, cwd: string, startTime: Date): ProcessInfo {
    return { pid, command: "pi", cwd, tty: "ttys001", startTime };
  }

  /** Session files (under the sessions tree) opened or read since the last reset. */
  function sessionFilesTouched(): string[] {
    const paths = [
      ...mockedOpenSync.mock.calls.map((call) => String(call[0])),
      ...mockedReadFileSync.mock.calls.map((call) => String(call[0])),
    ];
    return [...new Set(paths.filter((p) => p.startsWith(sessionsDir + path.sep)))].sort();
  }

  function sessionBytesRead(): number {
    return sessionFilesTouched().reduce((sum, filePath) => sum + bytesReadFrom(filePath), 0);
  }

  it("opens only in-window files of the process project dir, heads only, then nothing", async () => {
    const liveCwd = "/repo/live-project";
    const startTime = new Date(Date.now() - 2 * DAY_MS);
    const proc = makeProcess(4242, liveCwd, startTime);

    // 1,000 historical sessions: 950 in other projects, 49 old ones in the live
    // project, plus one created right after the process started.
    let count = 0;
    for (let project = 0; project < 50; project++) {
      for (let i = 0; i < 19; i++) {
        writeSession(
          `/repo/other-${project}`,
          new Date(startTime.getTime() + (i - 9) * 1000),
          `other-${project}-${i}`,
        );
        count++;
      }
    }
    for (let i = 0; i < 49; i++) {
      writeSession(liveCwd, new Date(startTime.getTime() - (i + 1) * DAY_MS), `old-${i}`);
      count++;
    }
    const bigBody = jsonl(
      Array.from({ length: 2000 }, (_, i) => ({
        type: "message",
        timestamp: new Date(startTime.getTime() + i).toISOString(),
        message: { role: "assistant", content: `reply ${i} ${"x".repeat(80)}` },
      })),
    );
    const inWindow = writeSession(
      liveCwd,
      new Date(startTime.getTime() + 10_000),
      "in-window",
      bigBody,
    );
    count++;
    expect(count).toBe(1000);
    expect(fs.statSync(inWindow).size).toBeGreaterThan(HEAD_LIMIT);

    const first = await adapter.detectAgents({ processes: [proc] });

    // Unmatched: the only in-window file's birthtime is "now", not near start
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ pid: 4242, sessionId: "pid-4242" });
    expect(sessionFilesTouched()).toEqual([inWindow]);
    expect(
      mockedReadFileSync.mock.calls.some((c) => String(c[0]).startsWith(sessionsDir + path.sep)),
    ).toBe(false);
    expect(bytesReadFrom(inWindow)).toBeGreaterThan(0);
    expect(bytesReadFrom(inWindow)).toBeLessThanOrEqual(HEAD_LIMIT);
    // Only the live project dir is listed, never the whole history tree
    const listed = mockedReaddirSync.mock.calls
      .map((c) => String(c[0]))
      .filter((p) => p.startsWith(sessionsDir + path.sep));
    expect(listed).toEqual([path.join(sessionsDir, encodeProjectDir(liveCwd))]);

    resetReads();
    const second = await adapter.detectAgents({ processes: [proc] });

    expect(second).toEqual([expect.objectContaining({ pid: 4242, sessionId: "pid-4242" })]);
    expect(sessionFilesTouched()).toEqual([]);
    expect(sessionBytesRead()).toBe(0);
    expect(
      mockedReaddirSync.mock.calls.some((c) => String(c[0]).startsWith(sessionsDir + path.sep)),
    ).toBe(false);
  });

  it("re-checks a no-match project dir when a session file is added", async () => {
    const cwd = "/repo/added-later";
    const startTime = new Date(Date.now() - 2 * DAY_MS);
    const proc = makeProcess(5151, cwd, startTime);
    writeSession(cwd, new Date(startTime.getTime() - DAY_MS), "stale");

    await adapter.detectAgents({ processes: [proc] });
    expect(sessionFilesTouched()).toEqual([]);

    resetReads();
    await adapter.detectAgents({ processes: [proc] });
    expect(mockedReaddirSync).not.toHaveBeenCalledWith(
      path.join(sessionsDir, encodeProjectDir(cwd)),
    );

    const added = writeSession(cwd, new Date(startTime.getTime() + 5_000), "added");
    resetReads();
    await adapter.detectAgents({ processes: [proc] });

    expect(sessionFilesTouched()).toEqual([added]);
    expect(bytesReadFrom(added)).toBeLessThanOrEqual(HEAD_LIMIT);
  });

  it("re-checks a no-match project dir when a new process needs it", async () => {
    const cwd = "/repo/new-process";
    const oldStart = new Date(Date.now() - 2 * DAY_MS);
    await adapter.detectAgents({
      processes: [makeProcess(6161, cwd, oldStart)],
    });

    const sessionFile = writeSession(cwd, new Date(), "fresh");
    const oldProc = makeProcess(6161, cwd, oldStart);
    await adapter.detectAgents({ processes: [oldProc] });

    // A new process started now must still be matched to the fresh session
    const agents = await adapter.detectAgents({
      processes: [oldProc, makeProcess(6262, cwd, new Date())],
    });
    expect(agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pid: 6262,
          sessionId: "fresh",
          sessionFilePath: sessionFile,
        }),
        expect.objectContaining({ pid: 6161, sessionId: "pid-6161" }),
      ]),
    );
  });

  it("hands a session to the losing rival once the matched process exits", async () => {
    const cwd = "/repo/rivals";
    const now = Date.now();
    const sessionFile = writeSession(cwd, new Date(now), "shared");
    const winner = makeProcess(7171, cwd, new Date(now));
    const loser = makeProcess(7272, cwd, new Date(now + 60_000));

    const both = await adapter.detectAgents({ processes: [winner, loser] });
    expect(both).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pid: 7171, sessionId: "shared" }),
        expect.objectContaining({ pid: 7272, sessionId: "pid-7272" }),
      ]),
    );

    const alone = await adapter.detectAgents({ processes: [loser] });
    expect(alone).toEqual([
      expect.objectContaining({
        pid: 7272,
        sessionId: "shared",
        sessionFilePath: sessionFile,
      }),
    ]);
  });

  it("reads 0 bytes of an unchanged matched session and only appended bytes after growth", async () => {
    const cwd = "/repo/matched";
    const now = new Date();
    const sessionFile = writeSession(cwd, now, "matched-session");
    const proc = makeProcess(8181, cwd, now);

    const first = await adapter.detectAgents({ processes: [proc] });
    expect(first).toEqual([
      expect.objectContaining({
        pid: 8181,
        sessionId: "matched-session",
        summary: "prompt matched-session",
      }),
    ]);

    resetReads();
    await adapter.detectAgents({ processes: [proc] });
    expect(sessionBytesRead()).toBe(0);

    const appended = jsonl([
      {
        type: "message",
        timestamp: new Date().toISOString(),
        message: { role: "user", content: "follow-up prompt" },
      },
    ]);
    fs.appendFileSync(sessionFile, appended);
    resetReads();
    const third = await adapter.detectAgents({ processes: [proc] });

    expect(third).toEqual([expect.objectContaining({ pid: 8181, summary: "follow-up prompt" })]);
    expect(bytesReadFrom(sessionFile)).toBe(Buffer.byteLength(appended));
  });

  it("serves tracker-matched sessions from the incremental cache", async () => {
    const cwd = "/repo/tracked";
    const sessionFile = writeSession(cwd, new Date(), "tracked-session");
    fs.writeFileSync(
      path.join(tmpHome, ".pi", "agent", "sessions.json"),
      JSON.stringify({ 9191: sessionFile }),
    );
    const proc = makeProcess(9191, cwd, new Date(Date.now() - DAY_MS));

    await adapter.detectAgents({ processes: [proc] });
    resetReads();
    const agents = await adapter.detectAgents({ processes: [proc] });

    expect(agents).toEqual([expect.objectContaining({ sessionId: "tracked-session" })]);
    expect(bytesReadFrom(sessionFile)).toBe(0);
  });
});
