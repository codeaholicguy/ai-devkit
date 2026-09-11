import type { MockedFunction } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { CodexSessionLocator } from "../../../providers/codex/CodexSessionLocator.js";
import { batchGetSessionFileBirthtimes, type SessionFile } from "../../../utils/session.js";
import { matchProcessesToSessions, type MatchResult } from "../../../utils/matching.js";

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

    const { sessions, contentCache } = locator.discoverLiveSessions([
      {
        pid: 1,
        command: "codex",
        cwd: "/repo-a",
        tty: "",
        startTime: new Date("2026-03-18T15:00:00Z"),
      },
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      resolvedCwd: "/repo-a",
      birthtimeMs: new Date("2026-03-18T15:00:05.000Z").getTime(),
    });
    expect(contentCache.has(sessionFile)).toBe(true);
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
    expect(result.contentCache.has(candidate.filePath)).toBe(true);
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
