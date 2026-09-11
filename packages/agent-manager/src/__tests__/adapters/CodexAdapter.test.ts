import type { MockedFunction } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CodexAdapter } from "../../providers/codex/CodexAdapter.js";
import { AgentStatus, type ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AgentRegistry, type RegistryEntry } from "../../utils/AgentRegistry.js";
import { batchGetSessionFileBirthtimes, type SessionFile } from "../../utils/session.js";
import {
  captureProcessSnapshot,
  enrichProcesses,
  listAgentProcesses,
} from "../../utils/process.js";
import {
  generateAgentName,
  matchProcessesToSessions,
  type MatchResult,
} from "../../utils/matching.js";

vi.mock("../../utils/process.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../utils/process.js");
  return {
    ...actual,
    listAgentProcesses: vi.fn(),
    enrichProcesses: vi.fn(),
    captureProcessSnapshot: vi.fn(),
  };
});

vi.mock("../../utils/session.js", async () => {
  const actual = (await vi.importActual(
    "../../utils/session",
  )) as typeof import("../../utils/session");
  return {
    ...actual,
    batchGetSessionFileBirthtimes: vi.fn(),
  };
});

vi.mock("../../utils/matching.js", () => ({
  matchProcessesToSessions: vi.fn(),
  generateAgentName: vi.fn(),
}));

const mockedListAgentProcesses = listAgentProcesses as MockedFunction<typeof listAgentProcesses>;
const mockedEnrichProcesses = enrichProcesses as MockedFunction<typeof enrichProcesses>;
const mockedCaptureProcessSnapshot = captureProcessSnapshot as MockedFunction<
  typeof captureProcessSnapshot
>;
const mockedBatchGetSessionFileBirthtimes = batchGetSessionFileBirthtimes as MockedFunction<
  typeof batchGetSessionFileBirthtimes
>;
const mockedMatchProcessesToSessions = matchProcessesToSessions as MockedFunction<
  typeof matchProcessesToSessions
>;
const mockedGenerateAgentName = generateAgentName as MockedFunction<typeof generateAgentName>;

describe("CodexAdapter", () => {
  let originalHome: string | undefined;
  let tmpHome: string;
  let adapter: CodexAdapter;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-adapter-"));
    process.env.HOME = tmpHome;

    adapter = new CodexAdapter(new AgentRegistry(path.join(tmpHome, "agents.json")));
    mockedListAgentProcesses.mockReset();
    mockedEnrichProcesses.mockReset();
    mockedCaptureProcessSnapshot.mockReset();
    mockedBatchGetSessionFileBirthtimes.mockReset();
    mockedMatchProcessesToSessions.mockReset();
    mockedGenerateAgentName.mockReset();

    mockedEnrichProcesses.mockImplementation((processes) => processes);
    mockedCaptureProcessSnapshot.mockImplementation(async (names) =>
      enrichProcesses(names.flatMap((name) => listAgentProcesses(name))),
    );
    mockedGenerateAgentName.mockImplementation(
      (cwd, pid) => `${path.basename(cwd) || "unknown"} (${pid})`,
    );
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("exposes codex type and handles Codex executable names only", () => {
    expect(adapter.type).toBe("codex");
    expect(adapter.canHandle({ pid: 1, command: "codex", cwd: "/repo", tty: "ttys001" })).toBe(
      true,
    );
    expect(
      adapter.canHandle({
        pid: 2,
        command: "/usr/local/bin/CODEX --sandbox workspace-write",
        cwd: "/repo",
        tty: "ttys002",
      }),
    ).toBe(true);
    expect(
      adapter.canHandle({ pid: 3, command: "node app.js", cwd: "/repo", tty: "ttys003" }),
    ).toBe(false);
    expect(
      adapter.canHandle({
        pid: 4,
        command: "node /worktrees/feature-codex-adapter-agent-manager-package/server.js",
        cwd: "/repo",
        tty: "ttys004",
      }),
    ).toBe(false);
  });

  it("returns no agents when no Codex process is running", async () => {
    mockedListAgentProcesses.mockReturnValue([]);

    await expect(adapter.detectAgents()).resolves.toEqual([]);
    expect(mockedListAgentProcesses).toHaveBeenCalledWith("codex");
  });

  it("returns process-only agents when no session files are discovered", async () => {
    const processes: ProcessInfo[] = [
      { pid: 100, command: "codex", cwd: "/repo-a", tty: "ttys001" },
    ];
    mockedListAgentProcesses.mockReturnValue(processes);

    await expect(adapter.detectAgents()).resolves.toMatchObject([
      {
        type: "codex",
        status: AgentStatus.RUNNING,
        pid: 100,
        projectPath: "/repo-a",
        sessionId: "pid-100",
        summary: "Codex process running",
      },
    ]);
  });

  it("maps a running Codex process through legacy session matching", async () => {
    const processInfo: ProcessInfo = {
      pid: 100,
      command: "codex",
      cwd: "/repo-a",
      tty: "ttys001",
      startTime: new Date("2026-03-18T15:00:00.000Z"),
    };
    const { sessionFile, dateDir } = writeSession("sess-abc", "/repo-a", [
      {
        type: "event",
        timestamp: new Date().toISOString(),
        payload: { type: "token_count", message: "Implement adapter flow" },
      },
    ]);
    const candidate: SessionFile = {
      sessionId: "sess-abc",
      filePath: sessionFile,
      projectDir: dateDir,
      birthtimeMs: new Date("2026-03-18T15:00:05Z").getTime(),
      resolvedCwd: "",
    };
    const matches: MatchResult[] = [
      { process: processInfo, session: { ...candidate, resolvedCwd: "/repo-a" }, deltaMs: 5000 },
    ];

    mockedListAgentProcesses.mockReturnValue([processInfo]);
    mockedBatchGetSessionFileBirthtimes.mockReturnValue([candidate]);
    mockedMatchProcessesToSessions.mockReturnValue(matches);

    const agents = await adapter.detectAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "codex",
      status: AgentStatus.RUNNING,
      pid: 100,
      projectPath: "/repo-a",
      sessionId: "sess-abc",
      summary: "Implement adapter flow",
    });
  });

  it("maps resumed sessions directly by id", async () => {
    const sessionId = "019eabed-4079-7071-9531-b853ddd9914e";
    const processInfo: ProcessInfo = {
      pid: 88018,
      command: `codex resume ${sessionId}`,
      cwd: "/repo-a",
      tty: "ttys001",
      startTime: new Date("2026-06-10T12:00:00.000Z"),
    };
    const { sessionFile } = writeSession(
      sessionId,
      "/repo-a",
      [
        {
          type: "event",
          timestamp: new Date().toISOString(),
          payload: { type: "agent_message", message: "resumed codex conversation" },
        },
      ],
      "2026/06/09",
    );

    mockedListAgentProcesses.mockReturnValue([processInfo]);
    mockedBatchGetSessionFileBirthtimes.mockReturnValue([]);

    const agents = await adapter.detectAgents();

    expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
    expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "codex",
      pid: 88018,
      sessionId,
      projectPath: "/repo-a",
      sessionFilePath: sessionFile,
      summary: "resumed codex conversation",
    });
  });

  it("uses hook session mapping before a stale registry entry for the same pid", async () => {
    const registry = new AgentRegistry(path.join(tmpHome, "agents.json"));
    const staleSession = path.join(tmpHome, "stale.jsonl");
    fs.writeFileSync(
      staleSession,
      [
        JSON.stringify({
          type: "session_meta",
          payload: { id: "stale", timestamp: new Date().toISOString(), cwd: "/repo-stale" },
        }),
        JSON.stringify({
          type: "event",
          timestamp: new Date().toISOString(),
          payload: { type: "agent_message", message: "stale" },
        }),
      ].join("\n"),
    );
    registry.register(registryEntry({ sessionFilePath: staleSession }));

    const mappedAdapter = new CodexAdapter(registry);
    const { sessionFile } = writeSession(
      "current",
      "/repo-current",
      [
        {
          type: "event",
          timestamp: new Date().toISOString(),
          payload: { type: "agent_message", message: "Hello from current mapping" },
        },
      ],
      "2026/06/26",
    );
    fs.mkdirSync(path.join(tmpHome, ".codex", "ai-devkit"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".codex", "ai-devkit", "sessions.json"),
      JSON.stringify({ 100: sessionFile }),
    );

    mockedListAgentProcesses.mockReturnValue([
      { pid: 100, command: "codex", cwd: "/repo-current", tty: "ttys001", startTime: new Date() },
    ]);

    const agents = await mappedAdapter.detectAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      pid: 100,
      sessionId: "current",
      sessionFilePath: sessionFile,
      summary: "Hello from current mapping",
    });
    expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
    expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
  });

  it("uses a valid registry cache entry before scanning sessions", async () => {
    const registry = new AgentRegistry(path.join(tmpHome, "agents.json"));
    const { sessionFile } = writeSession("cached", "/repo-a", [
      {
        type: "event",
        timestamp: new Date().toISOString(),
        payload: { type: "token_count", message: "Hello from cache" },
      },
    ]);
    registry.register(registryEntry({ sessionId: "cached", sessionFilePath: sessionFile }));

    const cachedAdapter = new CodexAdapter(registry);
    mockedListAgentProcesses.mockReturnValue([
      { pid: 100, command: "codex", cwd: "/repo-a", tty: "ttys001", startTime: new Date() },
    ]);

    const agents = await cachedAdapter.detectAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "codex",
      pid: 100,
      sessionId: "cached",
      sessionFilePath: sessionFile,
      summary: "Hello from cache",
    });
    expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
    expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
  });

  it("delegates conversation parsing and historical session listing", async () => {
    const { sessionFile } = writeSession(
      "listed",
      "/repo",
      [
        {
          type: "event",
          timestamp: "2025-01-01T00:00:01Z",
          payload: { type: "user_message", message: "first user" },
        },
        {
          type: "event",
          timestamp: "2025-01-01T00:00:02Z",
          payload: { type: "agent_message", message: "answer" },
        },
      ],
      "2025/01/01",
    );

    expect(adapter.getConversation(sessionFile)).toEqual([
      { role: "user", content: "first user", timestamp: "2025-01-01T00:00:01Z" },
      { role: "assistant", content: "answer", timestamp: "2025-01-01T00:00:02Z" },
    ]);
    await expect(adapter.listSessions({ cwd: "/repo" })).resolves.toMatchObject([
      {
        type: "codex",
        sessionId: "listed",
        cwd: "/repo",
        firstUserMessage: "first user",
        sessionFilePath: sessionFile,
      },
    ]);
  });

  function writeSession(
    sessionId: string,
    cwd: string,
    entries: object[],
    day = "2026/03/18",
  ): { sessionFile: string; dateDir: string } {
    const dateDir = path.join(tmpHome, ".codex", "sessions", ...day.split("/"));
    fs.mkdirSync(dateDir, { recursive: true });
    const sessionFile = path.join(dateDir, `${sessionId}.jsonl`);
    fs.writeFileSync(
      sessionFile,
      [
        JSON.stringify({
          type: "session_meta",
          payload: { id: sessionId, timestamp: "2026-03-18T15:00:00Z", cwd },
        }),
        ...entries.map((entry) => JSON.stringify(entry)),
      ].join("\n"),
    );
    return { sessionFile, dateDir };
  }

  function registryEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
    return {
      name: "codex-100",
      type: "codex",
      pid: 100,
      runtime: "tmux",
      runtimeRef: null,
      cwd: "/repo-a",
      startedAt: "2026-05-30T00:00:00.000Z",
      sessionId: "cached",
      sessionFilePath: "",
      ...overrides,
    };
  }
});
