import type { MockedFunction } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { CodexSessionLocator } from "../../../harnesses/codex/CodexSessionLocator.js";
import { batchGetSessionFileBirthtimes, type SessionFile } from "../../../utils/session.js";
import { matchProcessesToSessions, type MatchResult } from "../../../utils/matching.js";

vi.mock("fs", async () => {
  const actual = (await vi.importActual("fs")) as typeof import("fs");
  const wrapped = {
    ...actual,
    readSync: vi.fn(actual.readSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
  return { ...wrapped, default: wrapped };
});

vi.mock("../../../utils/session.js", async () => {
  const actual = (await vi.importActual(
    "../../../utils/session",
  )) as typeof import("../../../utils/session");
  return {
    ...actual,
    batchGetSessionFileBirthtimes: vi.fn(),
  };
});

vi.mock("../../../utils/matching.js", async () => {
  const actual = (await vi.importActual(
    "../../../utils/matching",
  )) as typeof import("../../../utils/matching");
  return {
    ...actual,
    matchProcessesToSessions: vi.fn(),
  };
});

const mockedBatchGetSessionFileBirthtimes = batchGetSessionFileBirthtimes as MockedFunction<
  typeof batchGetSessionFileBirthtimes
>;
const mockedMatchProcessesToSessions = matchProcessesToSessions as MockedFunction<
  typeof matchProcessesToSessions
>;

describe("CodexSessionLocator", () => {
  let tmpDir: string;
  let sessionsDir: string;
  let locator: CodexSessionLocator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-locator-"));
    sessionsDir = path.join(tmpDir, "sessions");
    locator = new CodexSessionLocator({ sessionsDir });
    mockedBatchGetSessionFileBirthtimes.mockReset();
    mockedMatchProcessesToSessions.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("discovers live sessions from the process start day window and applies session_meta cwd and timestamp", () => {
    const dateDir = path.join(sessionsDir, "2026", "03", "18");
    fs.mkdirSync(dateDir, { recursive: true });
    const sessionFile = path.join(dateDir, "sess-meta-time.jsonl");
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({
        type: "session_meta",
        payload: { id: "sess-meta-time", timestamp: "2026-03-18T15:00:05.000Z", cwd: "/repo-a" },
      }),
    );
    mockedBatchGetSessionFileBirthtimes.mockReturnValue([
      {
        sessionId: "sess-meta-time",
        filePath: sessionFile,
        projectDir: dateDir,
        birthtimeMs: new Date("2026-03-18T15:05:30.000Z").getTime(),
        resolvedCwd: "",
      },
    ]);

    const result = locator.discoverLiveSessions([
      {
        pid: 1,
        command: "codex",
        cwd: "/repo-a",
        tty: "",
        startTime: new Date("2026-03-18T15:00:00Z"),
      },
    ]);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      resolvedCwd: "/repo-a",
      birthtimeMs: new Date("2026-03-18T15:00:05.000Z").getTime(),
    });
    expect(result).not.toHaveProperty("contentCache");
    expect(mockedBatchGetSessionFileBirthtimes.mock.calls[0][0]).toEqual([dateDir]);
  });

  it("matches resumed UUIDv7 sessions directly without legacy matching", () => {
    const sessionId = "019eabed-4079-7071-9531-b853ddd9914e";
    const sessionFile = writeSession(sessionId, "2026/06/09");
    const processInfo: ProcessInfo = {
      pid: 88018,
      command: `codex resume ${sessionId}`,
      cwd: "/repo-a",
      tty: "ttys001",
      startTime: new Date("2026-06-10T12:00:00.000Z"),
    };

    const result = locator.matchRunningProcesses([processInfo]);

    expect(result.direct).toHaveLength(1);
    expect(result.direct[0]).toMatchObject({
      process: processInfo,
      sessionFile: { sessionId, filePath: sessionFile, resolvedCwd: "/repo-a" },
    });
    expect(result.fallback).toEqual([]);
    expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
    expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
  });

  it("falls back to walking all session files for non-time-sortable resume ids", () => {
    const sessionId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const sessionFile = writeSession(sessionId, "2026/01/02");

    const result = locator.matchRunningProcesses([
      { pid: 42, command: `codex resume ${sessionId}`, cwd: "/repo-a", tty: "ttys001" },
    ]);

    expect(result.direct[0].sessionFile.filePath).toBe(sessionFile);
  });

  it("passes unmatched processes and discovered sessions to legacy matching", () => {
    const dateDir = path.join(sessionsDir, "2026", "03", "18");
    fs.mkdirSync(dateDir, { recursive: true });
    const candidate: SessionFile = {
      sessionId: "sess",
      filePath: path.join(dateDir, "sess.jsonl"),
      projectDir: dateDir,
      birthtimeMs: new Date("2026-03-18T15:00:05Z").getTime(),
      resolvedCwd: "",
    };
    fs.writeFileSync(
      candidate.filePath,
      JSON.stringify({
        type: "session_meta",
        payload: { id: "sess", cwd: "/repo-a", timestamp: "2026-03-18T15:00:05Z" },
      }),
    );
    const processInfo: ProcessInfo = {
      pid: 100,
      command: "codex",
      cwd: "/repo-a",
      tty: "ttys001",
      startTime: new Date("2026-03-18T15:00:00Z"),
    };
    const legacyMatch: MatchResult = {
      process: processInfo,
      session: { ...candidate, resolvedCwd: "/repo-a" },
      deltaMs: 5000,
    };

    mockedBatchGetSessionFileBirthtimes.mockReturnValue([candidate]);
    mockedMatchProcessesToSessions.mockReturnValue([legacyMatch]);

    const result = locator.matchRunningProcesses([processInfo]);

    expect(result.direct).toEqual([]);
    expect(result.fallback).toEqual([processInfo]);
    expect(result.legacyMatches).toEqual([legacyMatch]);
    expect(result).not.toHaveProperty("contentCache");
  });

  describe("bounded session_meta discovery", () => {
    const HEAD_LIMIT_BYTES = 64 * 1024;
    const dayDirParts = ["2026", "03", "18"];
    const mockedReadSync = fs.readSync as MockedFunction<typeof fs.readSync>;
    const mockedReadFileSync = fs.readFileSync as MockedFunction<typeof fs.readFileSync>;
    let dateDir: string;
    let nowMs: number;
    let actualBatch: typeof batchGetSessionFileBirthtimes;

    const processInfo: ProcessInfo = {
      pid: 4242,
      command: "codex",
      cwd: "/repo-a",
      tty: "ttys009",
      startTime: new Date("2026-03-18T15:00:00Z"),
    };

    beforeEach(async () => {
      dateDir = path.join(sessionsDir, ...dayDirParts);
      fs.mkdirSync(dateDir, { recursive: true });
      nowMs = new Date("2026-03-18T16:00:00Z").getTime();
      locator = new CodexSessionLocator({ sessionsDir, now: () => nowMs });
      actualBatch = (
        (await vi.importActual("../../../utils/session")) as typeof import("../../../utils/session")
      ).batchGetSessionFileBirthtimes;
      mockedBatchGetSessionFileBirthtimes.mockImplementation(actualBatch);
      mockedMatchProcessesToSessions.mockReturnValue([]);
      mockedReadSync.mockClear();
      mockedReadFileSync.mockClear();
    });

    it("reads at most 64 KiB of a 100 MB session file", () => {
      const filePath = writeMetaSession("big", "/repo-big", 100 * 1024 * 1024);

      const { sessions } = locator.discoverSessionFilesInDateDirs([dateDir]);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        filePath,
        resolvedCwd: "/repo-big",
        birthtimeMs: new Date("2026-03-18T15:00:05.000Z").getTime(),
      });
      expect(bytesRead()).toBeGreaterThan(0);
      expect(bytesRead()).toBeLessThanOrEqual(HEAD_LIMIT_BYTES);
    });

    it("extracts cwd and timestamp when the session_meta line exceeds 64 KiB", () => {
      const filePath = path.join(dateDir, "long-meta.jsonl");
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          timestamp: "2026-03-18T15:00:04.000Z",
          type: "session_meta",
          payload: {
            id: "long-meta",
            timestamp: "2026-03-18T15:00:05.000Z",
            cwd: '/repo "quoted"',
            instructions: "x".repeat(300 * 1024),
          },
        }) + "\n",
      );

      const { sessions } = locator.discoverSessionFilesInDateDirs([dateDir]);

      expect(sessions[0]).toMatchObject({
        resolvedCwd: '/repo "quoted"',
        birthtimeMs: new Date("2026-03-18T15:00:05.000Z").getTime(),
      });
      expect(bytesRead()).toBeLessThanOrEqual(HEAD_LIMIT_BYTES);
    });

    it("leaves files without a session_meta first line unresolved", () => {
      const filePath = path.join(dateDir, "not-meta.jsonl");
      fs.writeFileSync(filePath, JSON.stringify({ type: "event", payload: { cwd: "/x" } }) + "\n");
      const birthtimeMs = fs.statSync(filePath).birthtimeMs;

      const { sessions } = locator.discoverSessionFilesInDateDirs([dateDir]);

      expect(sessions[0]).toMatchObject({ resolvedCwd: "", birthtimeMs });
    });

    it("reads 0 bytes on later refreshes while session files only grow", () => {
      const filePath = writeMetaSession("grow", "/repo-a");
      mockedMatchProcessesToSessions.mockImplementation((_procs, sessions) => [
        { process: processInfo, session: sessions[0], deltaMs: 5000 },
      ]);

      const first = locator.matchRunningProcesses([processInfo]);
      expect(first.legacyMatches).toHaveLength(1);
      expect(bytesRead()).toBeGreaterThan(0);

      fs.appendFileSync(filePath, JSON.stringify({ type: "event", payload: {} }) + "\n");
      mockedReadSync.mockClear();
      mockedReadFileSync.mockClear();

      const second = locator.matchRunningProcesses([processInfo]);

      expect(second.legacyMatches).toHaveLength(1);
      expect(second.legacyMatches[0].session).toMatchObject({
        filePath,
        resolvedCwd: "/repo-a",
        birthtimeMs: new Date("2026-03-18T15:00:05.000Z").getTime(),
      });
      expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(2);
      expect(bytesRead()).toBe(0);
    });

    it("rereads a session head when the file is replaced", () => {
      const filePath = writeMetaSession("replaced", "/repo-old");
      locator.discoverSessionFilesInDateDirs([dateDir]);

      const tmpFile = path.join(tmpDir, "replacement.jsonl");
      fs.writeFileSync(tmpFile, metaLine("replaced", "/repo-new") + "\n");
      fs.renameSync(tmpFile, filePath);
      mockedReadSync.mockClear();

      const { sessions } = locator.discoverSessionFilesInDateDirs([dateDir]);

      expect(sessions[0].resolvedCwd).toBe("/repo-new");
      expect(bytesRead()).toBeGreaterThan(0);
    });

    it("does not rescan an unmatched process until its date directories change", () => {
      writeMetaSession("other", "/repo-other");
      setDirMtime(dateDir, new Date("2026-01-01T00:00:00Z"));

      const first = locator.matchRunningProcesses([processInfo]);
      expect(first.fallback).toEqual([processInfo]);
      expect(first.legacyMatches).toEqual([]);
      expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);

      mockedReadSync.mockClear();
      nowMs += 5_000;
      const second = locator.matchRunningProcesses([processInfo]);

      expect(second.fallback).toEqual([processInfo]);
      expect(second.legacyMatches).toEqual([]);
      expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);
      expect(mockedMatchProcessesToSessions).toHaveBeenCalledTimes(1);
      expect(bytesRead()).toBe(0);

      const newFile = writeMetaSession("new-session", "/repo-a");
      nowMs += 5_000;
      locator.matchRunningProcesses([processInfo]);

      expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(2);
      expect(mockedMatchProcessesToSessions).toHaveBeenCalledTimes(2);
      const rescannedPaths = mockedMatchProcessesToSessions.mock.calls[1][1].map(
        (session) => session.filePath,
      );
      expect(rescannedPaths).toContain(newFile);
      expect(bytesRead()).toBeGreaterThan(0);
      expect(bytesRead()).toBeLessThanOrEqual(HEAD_LIMIT_BYTES);
    });

    it("rescans a newly created adjacent date directory for an unmatched process", () => {
      locator.matchRunningProcesses([processInfo]);
      expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);

      const nextDayDir = path.join(sessionsDir, "2026", "03", "19");
      fs.mkdirSync(nextDayDir, { recursive: true });
      nowMs += 1_000;
      locator.matchRunningProcesses([processInfo]);

      expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(2);
      expect(mockedBatchGetSessionFileBirthtimes.mock.calls[1][0]).toContain(nextDayDir);
    });

    it("re-checks an unmatched process at most every 30 seconds with unchanged directories", () => {
      writeMetaSession("other", "/repo-other");
      setDirMtime(dateDir, new Date("2026-01-01T00:00:00Z"));
      locator.matchRunningProcesses([processInfo]);
      mockedReadSync.mockClear();

      nowMs += 29_999;
      locator.matchRunningProcesses([processInfo]);
      expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);

      nowMs += 1;
      locator.matchRunningProcesses([processInfo]);
      expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(2);
      expect(bytesRead()).toBe(0);
    });

    it("scans a new process even when another process is negatively cached", () => {
      writeMetaSession("other", "/repo-other");
      locator.matchRunningProcesses([processInfo]);
      const other: ProcessInfo = { ...processInfo, pid: 5151 };

      const result = locator.matchRunningProcesses([processInfo, other]);

      expect(mockedMatchProcessesToSessions).toHaveBeenLastCalledWith([other], expect.any(Array));
      expect(result.fallback).toEqual([processInfo, other]);
    });

    function metaLine(id: string, cwd: string): string {
      return JSON.stringify({
        type: "session_meta",
        payload: { id, timestamp: "2026-03-18T15:00:05.000Z", cwd },
      });
    }

    function writeMetaSession(id: string, cwd: string, totalBytes?: number): string {
      const filePath = path.join(dateDir, `${id}.jsonl`);
      fs.writeFileSync(filePath, metaLine(id, cwd) + "\n");
      if (totalBytes !== undefined) fs.truncateSync(filePath, totalBytes);
      return filePath;
    }

    function setDirMtime(dir: string, date: Date): void {
      fs.utimesSync(dir, date, date);
    }

    function bytesRead(): number {
      let total = 0;
      for (const result of mockedReadSync.mock.results) {
        if (result.type === "return" && typeof result.value === "number") total += result.value;
      }
      mockedReadFileSync.mock.calls.forEach((call, index) => {
        if (!String(call[0]).startsWith(sessionsDir)) return;
        const result = mockedReadFileSync.mock.results[index];
        if (result?.type === "return") total += Buffer.byteLength(result.value as string | Buffer);
      });
      return total;
    }
  });

  function writeSession(sessionId: string, day: string): string {
    const dateDir = path.join(sessionsDir, ...day.split("/"));
    fs.mkdirSync(dateDir, { recursive: true });
    const sessionFile = path.join(dateDir, `${sessionId}.jsonl`);
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({
        type: "session_meta",
        payload: { id: sessionId, timestamp: "2026-03-18T15:00:05.000Z", cwd: "/repo-a" },
      }),
    );
    return sessionFile;
  }
});
