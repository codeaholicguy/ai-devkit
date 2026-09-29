/**
 * Refresh-path I/O tests for Copilot: lock discovery must not rescan all
 * session history, and unchanged events.jsonl files must not be re-read.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { CopilotAdapter } from "../../../harnesses/copilot/CopilotAdapter.js";
import { CopilotSessionLocator } from "../../../harnesses/copilot/CopilotSessionLocator.js";
import { CopilotSessionParser } from "../../../harnesses/copilot/CopilotSessionParser.js";
import { AgentRegistry } from "../../../utils/AgentRegistry.js";

vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs");
  return {
    ...actual,
    readdirSync: vi.fn(actual.readdirSync),
    statSync: vi.fn(actual.statSync),
    openSync: vi.fn(actual.openSync),
    readSync: vi.fn(actual.readSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});

const mockedReaddirSync = vi.mocked(fs.readdirSync);
const mockedStatSync = vi.mocked(fs.statSync);
const mockedOpenSync = vi.mocked(fs.openSync);
const mockedReadSync = vi.mocked(fs.readSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);

function resetFsCalls(): void {
  mockedReaddirSync.mockClear();
  mockedStatSync.mockClear();
  mockedOpenSync.mockClear();
  mockedReadSync.mockClear();
  mockedReadFileSync.mockClear();
}

function readdirPaths(): string[] {
  return mockedReaddirSync.mock.calls.map((call) => String(call[0]));
}

function fsCallCount(): number {
  return (
    mockedReaddirSync.mock.calls.length +
    mockedStatSync.mock.calls.length +
    mockedOpenSync.mock.calls.length +
    mockedReadSync.mock.calls.length +
    mockedReadFileSync.mock.calls.length
  );
}

/** Bytes read from `filePath` via readFileSync or fd reads since the last reset. */
function bytesReadFrom(filePath: string): number {
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

function jsonl(entries: unknown[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}

const HISTORY_COUNT = 1000;
const LIVE_PID = 43001;

// Building 1,000 fixture directories is slow on loaded machines
describe("Copilot refresh I/O", { timeout: 60_000 }, () => {
  let tmpDir: string;
  let sessionStateDir: string;
  let liveDir: string;
  let eventsFile: string;
  let processes: ProcessInfo[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-refresh-"));
    sessionStateDir = path.join(tmpDir, "session-state");
    fs.mkdirSync(sessionStateDir, { recursive: true });

    // 1,000 historical session directories last modified two days ago; some
    // still carry stale locks (including one for the live PID, i.e. PID reuse).
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < HISTORY_COUNT; i++) {
      const dir = path.join(sessionStateDir, `history-${String(i).padStart(4, "0")}`);
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, "events.jsonl"),
        jsonl([{ type: "session.start", data: { sessionId: `history-${i}` } }]),
      );
      if (i % 100 === 0) {
        fs.writeFileSync(path.join(dir, `inuse.${i === 0 ? LIVE_PID : 50000 + i}.lock`), "");
      }
      fs.utimesSync(dir, old, old);
    }

    const startTime = new Date(Date.now() - 10_000);
    liveDir = path.join(sessionStateDir, "live-session");
    fs.mkdirSync(liveDir);
    eventsFile = path.join(liveDir, "events.jsonl");
    fs.writeFileSync(
      eventsFile,
      jsonl([
        {
          type: "session.start",
          data: { sessionId: "live-session", context: { cwd: "/repo/live" } },
          timestamp: startTime.toISOString(),
        },
        {
          type: "user.message",
          data: { content: "live task" },
          timestamp: new Date().toISOString(),
        },
        {
          type: "assistant.message",
          data: { content: "y".repeat(300_000) },
          timestamp: new Date().toISOString(),
        },
      ]),
    );
    fs.writeFileSync(path.join(liveDir, `inuse.${LIVE_PID}.lock`), "");

    processes = [
      { pid: LIVE_PID, command: "copilot", cwd: "/repo/live", tty: "ttys001", startTime },
    ];
    resetFsCalls();
  }, 60_000);

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("CopilotSessionLocator.discoverActiveLocks", () => {
    it("reads only session directories modified since the live process started", () => {
      const locator = new CopilotSessionLocator({ sessionStateDir });

      const locks = locator.discoverActiveLocks(processes);

      expect(locks).toEqual([{ sessionDir: liveDir, sessionId: "live-session", pid: LIVE_PID }]);
      expect(readdirPaths().sort()).toEqual([sessionStateDir, liveDir].sort());
    });

    it("re-validates a known live lock with a single stat and no readdir", () => {
      const locator = new CopilotSessionLocator({ sessionStateDir });
      locator.discoverActiveLocks(processes);
      resetFsCalls();

      const locks = locator.discoverActiveLocks(processes);

      expect(locks).toEqual([{ sessionDir: liveDir, sessionId: "live-session", pid: LIVE_PID }]);
      expect(mockedReaddirSync).not.toHaveBeenCalled();
      expect(fsCallCount()).toBe(1);
      expect(String(mockedStatSync.mock.calls[0][0])).toBe(
        path.join(liveDir, `inuse.${LIVE_PID}.lock`),
      );
    });

    it("rediscovers when the known lock disappears", () => {
      const locator = new CopilotSessionLocator({ sessionStateDir });
      locator.discoverActiveLocks(processes);
      fs.unlinkSync(path.join(liveDir, `inuse.${LIVE_PID}.lock`));
      const nextDir = path.join(sessionStateDir, "next-session");
      fs.mkdirSync(nextDir);
      fs.writeFileSync(path.join(nextDir, `inuse.${LIVE_PID}.lock`), "");
      resetFsCalls();

      const locks = locator.discoverActiveLocks(processes);

      expect(locks).toEqual([{ sessionDir: nextDir, sessionId: "next-session", pid: LIVE_PID }]);
      expect(readdirPaths()).not.toContain(path.join(sessionStateDir, "history-0000"));
    });

    it("does not reuse a cached lock after the PID is reused by a new process", () => {
      const locator = new CopilotSessionLocator({ sessionStateDir });
      locator.discoverActiveLocks(processes);
      resetFsCalls();

      const reused = [{ ...processes[0], startTime: new Date(Date.now() + 1_000) }];
      locator.discoverActiveLocks(reused);

      expect(readdirPaths()).toContain(sessionStateDir);
    });

    it("scans every session directory when a process start time is unknown", () => {
      const locator = new CopilotSessionLocator({ sessionStateDir });

      const locks = locator.discoverActiveLocks([{ pid: LIVE_PID }]);

      expect(mockedReaddirSync).toHaveBeenCalledTimes(HISTORY_COUNT + 2);
      expect(locks.map((lock) => lock.sessionId).sort()).toEqual(["history-0000", "live-session"]);
    });
  });

  describe("CopilotSessionParser.readSessionDirIncremental", () => {
    it("matches readSessionDir before and after an append", () => {
      const parser = new CopilotSessionParser();
      expect(parser.readSessionDirIncremental(liveDir, "fallback")).toEqual(
        parser.readSessionDir(liveDir, "fallback"),
      );

      fs.appendFileSync(
        eventsFile,
        '{"type":"assistant.message","data":{"content":"done"}}\nnot json\n',
      );
      expect(parser.readSessionDirIncremental(liveDir, "fallback")).toEqual(
        parser.readSessionDir(liveDir, "fallback"),
      );
    });
  });

  describe("CopilotAdapter.detectAgents", () => {
    it("reads 0 bytes of an unchanged events.jsonl and only appended bytes afterwards", async () => {
      const adapter = new CopilotAdapter(new AgentRegistry(path.join(tmpDir, "agents.json")), {
        sessionStateDir,
      });

      const first = await adapter.detectAgents({ processes });
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        pid: LIVE_PID,
        sessionId: "live-session",
        projectPath: "/repo/live",
        summary: "live task",
      });

      resetFsCalls();
      const second = await adapter.detectAgents({ processes });
      expect(second).toEqual(first);
      expect(bytesReadFrom(eventsFile)).toBe(0);
      expect(mockedReaddirSync).not.toHaveBeenCalled();

      const appended = jsonl([
        {
          type: "user.message",
          data: { content: "follow up" },
          timestamp: new Date().toISOString(),
        },
      ]);
      fs.appendFileSync(eventsFile, appended);
      resetFsCalls();

      const third = await adapter.detectAgents({ processes });
      expect(third[0]).toMatchObject({ sessionId: "live-session", summary: "live task" });
      expect(bytesReadFrom(eventsFile)).toBeLessThanOrEqual(
        Buffer.byteLength(appended) + 64 * 1024,
      );
    });
  });
});
