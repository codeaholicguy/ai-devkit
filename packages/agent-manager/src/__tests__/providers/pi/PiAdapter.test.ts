/**
 * Tests for PiAdapter provider orchestration.
 */

import type { MockedFunction } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AgentStatus, type ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { PiAdapter } from "../../../providers/pi/PiAdapter.js";
import { AgentRegistry } from "../../../utils/AgentRegistry.js";
import { captureProcessSnapshot } from "../../../utils/process.js";
import { generateAgentName, matchProcessesToSessions } from "../../../utils/matching.js";

vi.mock("../../../utils/process.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../../utils/process.js");
  return {
    ...actual,
    captureProcessSnapshot: vi.fn(),
  };
});

vi.mock("../../../utils/matching.js", () => ({
  matchProcessesToSessions: vi.fn(),
  generateAgentName: vi.fn(),
}));

const mockedCaptureProcessSnapshot = captureProcessSnapshot as MockedFunction<
  typeof captureProcessSnapshot
>;
const mockedMatchProcessesToSessions = matchProcessesToSessions as MockedFunction<
  typeof matchProcessesToSessions
>;
const mockedGenerateAgentName = generateAgentName as MockedFunction<typeof generateAgentName>;

describe("PiAdapter", () => {
  let adapter: PiAdapter;
  let tmpHome: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-adapter-test-"));
    process.env.HOME = tmpHome;
    sessionsDir = path.join(tmpHome, ".pi", "agent", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    adapter = new PiAdapter(new AgentRegistry(path.join(tmpHome, "agents.json")));
    mockedCaptureProcessSnapshot.mockReset();
    mockedMatchProcessesToSessions.mockReset();
    mockedGenerateAgentName.mockReset();

    mockedCaptureProcessSnapshot.mockResolvedValue([]);
    mockedMatchProcessesToSessions.mockReturnValue([]);
    mockedGenerateAgentName.mockImplementation((cwd: string, pid: number) => {
      const folder = path.basename(cwd) || "unknown";
      return `${folder} (${pid})`;
    });
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("exposes pi type", () => {
    expect(adapter.type).toBe("pi");
  });

  it("identifies Pi commands without matching unrelated paths", () => {
    expect(adapter.canHandle({ pid: 1, command: "pi", cwd: "/repo", tty: "ttys001" })).toBe(true);
    expect(
      adapter.canHandle({
        pid: 2,
        command: "/usr/local/bin/PI --model x",
        cwd: "/repo",
        tty: "ttys002",
      }),
    ).toBe(true);
    expect(
      adapter.canHandle({
        pid: 3,
        command: "node /opt/pi/bin/pi.js",
        cwd: "/repo",
        tty: "ttys003",
      }),
    ).toBe(true);
    expect(
      adapter.canHandle({
        pid: 4,
        command: "node /repo/feature-pi-adapter/script.js",
        cwd: "/repo",
        tty: "ttys004",
      }),
    ).toBe(false);
    expect(
      adapter.canHandle({
        pid: 5,
        command: "C:\\tools\\node.exe C:\\lib\\pi.js",
        cwd: "/repo",
        tty: "ttys005",
      }),
    ).toBe(true);
  });

  it("rejects foreign executables from a hand-built snapshot context", async () => {
    const foreign: ProcessInfo = {
      pid: 6,
      command: "claude --resume /Users/x/repos/pi/session.jsonl",
      cwd: "/repo",
      tty: "ttys006",
    };

    expect(await adapter.detectAgents({ processes: [foreign] })).toEqual([]);
  });

  it("maps a running Pi process to the tracker session for its PID", async () => {
    const cwd = "/repo/project-a";
    const proc = makeProcess({ pid: 101, cwd });
    const sessionFile = writePiSession(cwd, [
      { type: "session_meta", timestamp: "2026-06-10T08:58:20.754Z", sessionId: "sess-101", cwd },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "implement Pi adapter" },
      { role: "assistant", timestamp: new Date().toISOString(), content: "working on it" },
    ]);
    writeTracker({ 101: sessionFile });
    mockedCaptureProcessSnapshot.mockResolvedValue([proc]);

    const agents = await adapter.detectAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "pi",
      pid: 101,
      projectPath: cwd,
      sessionId: "sess-101",
      summary: "implement Pi adapter",
      status: AgentStatus.WAITING,
      sessionFilePath: sessionFile,
    });
    expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
  });

  it("falls back to legacy matching when sessions.json is missing", async () => {
    const cwd = "/repo/project-b";
    const proc = makeProcess({ pid: 202, cwd });
    const sessionFile = writePiSession(cwd, [
      { timestamp: "2026-06-10T08:58:20.754Z", sessionId: "sess-202" },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "fallback matching please" },
    ]);
    mockedCaptureProcessSnapshot.mockResolvedValue([proc]);
    mockedMatchProcessesToSessions.mockReturnValue([
      {
        process: proc,
        session: {
          sessionId: "sess-202",
          filePath: sessionFile,
          projectDir: path.dirname(sessionFile),
          birthtimeMs: Date.now(),
          resolvedCwd: cwd,
        },
        deltaMs: 0,
      },
    ]);

    const agents = await adapter.detectAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "pi",
      pid: 202,
      projectPath: cwd,
      sessionId: "sess-202",
      summary: "fallback matching please",
    });
    expect(mockedMatchProcessesToSessions).toHaveBeenCalledWith(
      [proc],
      expect.arrayContaining([
        expect.objectContaining({ filePath: sessionFile, resolvedCwd: cwd }),
      ]),
    );
  });

  it("falls back to legacy matching when a trusted tracker session is unparseable", async () => {
    const cwd = "/repo/project-bad-tracker-session";
    const proc = makeProcess({ pid: 304, cwd });
    const badSessionFile = writePiSessionWithFileName(cwd, "bad.jsonl", ["{not json"]);
    const fallbackSessionFile = writePiSession(cwd, [
      { timestamp: "2026-06-10T08:58:20.754Z", sessionId: "sess-304", cwd },
      {
        role: "user",
        timestamp: "2026-06-10T08:58:21.000Z",
        content: "fallback after bad tracker session",
      },
    ]);
    writeTracker({ 304: badSessionFile });
    mockedCaptureProcessSnapshot.mockResolvedValue([proc]);
    mockedMatchProcessesToSessions.mockReturnValue([
      {
        process: proc,
        session: {
          sessionId: "sess-304",
          filePath: fallbackSessionFile,
          projectDir: path.dirname(fallbackSessionFile),
          birthtimeMs: Date.now(),
          resolvedCwd: cwd,
        },
        deltaMs: 0,
      },
    ]);

    const agents = await adapter.detectAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      sessionId: "sess-304",
      summary: "fallback after bad tracker session",
      sessionFilePath: fallbackSessionFile,
    });
    expect(mockedMatchProcessesToSessions).toHaveBeenCalled();
  });

  it("returns a process-only agent when no session can be matched", async () => {
    const proc = makeProcess({ pid: 505, cwd: "/repo/project-e" });
    mockedCaptureProcessSnapshot.mockResolvedValue([proc]);

    const agents = await adapter.detectAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "pi",
      status: AgentStatus.RUNNING,
      pid: 505,
      projectPath: "/repo/project-e",
      sessionId: "pid-505",
      summary: "Pi process running",
    });
  });

  it("lists historical sessions and applies cwd filtering", async () => {
    const matchingCwd = "/repo/project-g";
    const otherCwd = "/repo/project-h";
    const matchingSession = writePiSession(matchingCwd, [
      { timestamp: "2026-06-10T08:58:20.754Z", sessionId: "sess-g", cwd: matchingCwd },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "first matching message" },
    ]);
    writePiSession(otherCwd, [
      { timestamp: "2026-06-10T08:58:20.754Z", sessionId: "sess-h", cwd: otherCwd },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "other message" },
    ]);

    const sessions = await adapter.listSessions({ cwd: matchingCwd });

    expect(sessions).toEqual([
      expect.objectContaining({
        type: "pi",
        sessionId: "sess-g",
        cwd: matchingCwd,
        firstUserMessage: "first matching message",
        sessionFilePath: matchingSession,
      }),
    ]);
  });

  function makeProcess(overrides: Partial<ProcessInfo>): ProcessInfo {
    return {
      pid: 1,
      command: "pi",
      cwd: "/repo",
      tty: "ttys001",
      startTime: new Date("2026-06-10T08:58:20.000Z"),
      ...overrides,
    };
  }

  function writeTracker(entries: Record<number, string>): void {
    fs.writeFileSync(path.join(tmpHome, ".pi", "agent", "sessions.json"), JSON.stringify(entries));
  }

  function writePiSession(cwd: string, entries: Array<Record<string, unknown> | string>): string {
    const sessionId =
      entries
        .map((entry) => (typeof entry === "string" ? undefined : entry.sessionId))
        .find((value): value is string => typeof value === "string") ?? cryptoRandomSessionId();
    return writePiSessionWithFileName(cwd, `2026-06-10T08-58-20-754Z_${sessionId}.jsonl`, entries);
  }

  function writePiSessionWithFileName(
    cwd: string,
    fileName: string,
    entries: Array<Record<string, unknown> | string>,
  ): string {
    const projectDir = path.join(sessionsDir, encodeProjectDir(cwd));
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(projectDir, fileName);
    fs.writeFileSync(
      filePath,
      entries
        .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
        .join("\n"),
    );
    return filePath;
  }
});

function encodeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, "-").replace(/^-?/, "--") + "--";
}

function cryptoRandomSessionId(): string {
  return `019eb0c1-06d2-71ed-90ee-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
}
