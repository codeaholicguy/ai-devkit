import type { MockedFunction } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CodexAdapter } from "../../../harnesses/codex/CodexAdapter.js";
import { CodexSessionLocator } from "../../../harnesses/codex/CodexSessionLocator.js";
import { AgentStatus, type ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { AgentRegistry, type RegistryEntry } from "../../../utils/AgentRegistry.js";
import { batchGetSessionFileBirthtimes, type SessionFile } from "../../../utils/session.js";
import {
  captureProcessSnapshot,
  enrichProcesses,
  listAgentProcesses,
} from "../../../utils/process.js";
import {
  generateAgentName,
  matchProcessesToSessions,
  type MatchResult,
} from "../../../utils/matching.js";

vi.mock("../../../utils/process.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../../utils/process.js");
  return {
    ...actual,
    listAgentProcesses: vi.fn(),
    enrichProcesses: vi.fn(),
    captureProcessSnapshot: vi.fn(),
  };
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

vi.mock("../../../utils/matching.js", () => ({
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

  describe("helper process exclusion", () => {
    const sessionId = "019a0000-0000-7000-8000-000000000001";
    const helperCommands = [
      "/Applications/SomeApp.app/Contents/Resources/codex sandbox -c sandbox_permissions=[] -- node /opt/tools/server.js",
      "/Applications/SomeApp.app/Contents/Resources/codex debug seatbelt -- node /opt/tools/server.js",
      "codex app-server --listen stdio://",
      "/usr/local/bin/codex -c model=o3 app-server --listen stdio://",
      "/home/user/.codex/packages/app-server-daemon/releases/1.2.3/bin/codex",
      "/home/user/.codex/packages/app-server-daemon/releases/1.2.3/bin/codex app-server --listen ws://127.0.0.1:4500",
      "codex mcp-server",
      "codex exec-server",
      "codex remote-control start",
      "codex login",
      "codex mcp list",
      "codex completion zsh",
      "codex apply",
      "codex features list",
      "C:\\Users\\user\\.codex\\packages\\app-server-daemon\\releases\\1.2.3\\bin\\codex.exe",
    ];
    const agentCommands = [
      "codex",
      "/opt/homebrew/bin/codex --model o3",
      "codex -c model_reasoning_effort=high",
      "codex --sandbox workspace-write --ask-for-approval on-request",
      "codex -s danger-full-access fix the failing tests",
      `codex resume ${sessionId}`,
      "codex resume --last",
      `codex fork ${sessionId}`,
      "codex exec --json -",
      `codex exec resume --json ${sessionId} -`,
      "codex exec --cd /repos/project summarize the change",
      "C:\\tools\\codex.exe",
    ];

    it.each(helperCommands)("does not handle helper command %s", (command) => {
      expect(adapter.canHandle({ pid: 10, command, cwd: "/repo", tty: "??" })).toBe(false);
    });

    it.each(agentCommands)("handles agent command %s", (command) => {
      expect(adapter.canHandle({ pid: 11, command, cwd: "/repo", tty: "ttys001" })).toBe(true);
    });

    it("does not list helper processes or run session discovery for them", async () => {
      const locatorSpy = vi.spyOn(CodexSessionLocator.prototype, "matchRunningProcesses");
      const processes: ProcessInfo[] = helperCommands.map((command, index) => ({
        pid: 500 + index,
        command,
        cwd: "/repo-a",
        tty: "??",
      }));

      await expect(adapter.detectAgents({ processes })).resolves.toEqual([]);
      expect(locatorSpy).not.toHaveBeenCalled();
      locatorSpy.mockRestore();
    });

    it("only passes agent processes to session discovery when helpers run alongside", async () => {
      const locatorSpy = vi.spyOn(CodexSessionLocator.prototype, "matchRunningProcesses");
      const agentProcess: ProcessInfo = {
        pid: 100,
        command: "codex",
        cwd: "/repo-a",
        tty: "ttys001",
      };
      const processes: ProcessInfo[] = [
        agentProcess,
        { pid: 101, command: "codex app-server --listen stdio://", cwd: "/repo-a", tty: "??" },
        {
          pid: 102,
          command: "/Applications/SomeApp.app/Contents/Resources/codex sandbox -- node server.js",
          cwd: "/repo-a",
          tty: "??",
        },
      ];

      const agents = await adapter.detectAgents({ processes });

      expect(agents.map((agent) => agent.pid)).toEqual([100]);
      expect(locatorSpy).toHaveBeenCalledTimes(1);
      expect(locatorSpy.mock.calls[0]![0]).toEqual([agentProcess]);
      locatorSpy.mockRestore();
    });
  });

  // Verified against Codex CLI 0.157.1 (source tag rust-v0.157.1):
  // - `codex review` runs as `codex exec review` and writes a local rollout
  //   (session_meta source `exec`), so it is listed.
  // - `codex cloud` only talks to Codex Cloud over HTTP and writes no rollout.
  // - `codex agents` is a dashboard over the shared app-server daemon's sessions
  //   and starts no thread of its own, so it owns no rollout.
  describe("review, cloud and agents classification (Codex CLI 0.157.1)", () => {
    const reviewCommands = [
      "codex review",
      "codex review --uncommitted",
      "codex review --base main",
      "codex review --commit 0123abc --title fix",
      "codex review -",
      "/opt/homebrew/bin/codex -c model=o3 review focus on error handling",
    ];
    const sessionlessCommands = [
      "codex cloud",
      "codex cloud exec --env env_123 fix the flaky test",
      "codex cloud list",
      "codex cloud apply task_123",
      "codex -c model=o3 cloud",
      "codex agents",
      "codex agents --remote ws://127.0.0.1:4500",
      "codex agents -C /repos/project --no-alt-screen",
      "codex --remote ws://127.0.0.1:4500 agents",
      "codex --remote-auth-token-env CODEX_TOKEN --remote wss://host:4500 agents",
      "codex --enable some_feature agents",
    ];

    it.each(reviewCommands)("lists review command %s", (command) => {
      expect(adapter.canHandle({ pid: 20, command, cwd: "/repo", tty: "ttys002" })).toBe(true);
    });

    it.each(sessionlessCommands)("does not list sessionless command %s", (command) => {
      expect(adapter.canHandle({ pid: 21, command, cwd: "/repo", tty: "ttys002" })).toBe(false);
    });

    it("passes review processes to session discovery and never lists cloud or agents", async () => {
      const locatorSpy = vi.spyOn(CodexSessionLocator.prototype, "matchRunningProcesses");
      const reviewProcess: ProcessInfo = {
        pid: 300,
        command: "codex review --uncommitted",
        cwd: "/repo-a",
        tty: "ttys003",
      };
      const processes: ProcessInfo[] = [
        reviewProcess,
        ...sessionlessCommands.map((command, index) => ({
          pid: 400 + index,
          command,
          cwd: "/repo-a",
          tty: "ttys004",
        })),
      ];

      const agents = await adapter.detectAgents({ processes });

      expect(agents.map((agent) => agent.pid)).toEqual([300]);
      expect(locatorSpy).toHaveBeenCalledTimes(1);
      expect(locatorSpy.mock.calls[0]![0]).toEqual([reviewProcess]);
      locatorSpy.mockRestore();
    });
  });

  it("handles Codex installed under a path containing spaces", async () => {
    const executable = path.join(
      tmpHome,
      "Applications",
      "Some App.app",
      "Contents",
      "Resources",
      "codex",
    );
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, "");
    const codex: ProcessInfo = {
      pid: 4321,
      command: `${executable} exec fix the Other Dir/claude bug`,
      cwd: "/repo",
      tty: "ttys001",
    };
    const editor: ProcessInfo = {
      pid: 4322,
      command: `/usr/bin/vim ${path.join(tmpHome, "Applications", "Some")} App.app/Contents/Resources/codex`,
      cwd: "/repo",
      tty: "ttys002",
    };

    expect(adapter.canHandle(codex)).toBe(true);
    expect(adapter.canHandle(editor)).toBe(false);

    const agents = await adapter.detectAgents({ processes: [codex, editor] });
    expect(agents.map((agent) => agent.pid)).toEqual([4321]);
  });

  // Codex CLI 0.157.1 declares `-i, --image <FILE>...` (clap `num_args = 1..`,
  // `value_delimiter = ','`), its only variadic root flag. clap keeps taking
  // image values until a flag or a subcommand name, so a helper subcommand can
  // follow several images.
  describe("variadic -i/--image values (Codex CLI 0.157.1)", () => {
    const helperCommands = [
      "codex -i a.png b.png cloud",
      "codex --image a.png b.png app-server",
      "codex -i a.png -i b.png agents",
      "codex -i a.png b.png c.png --model o3 mcp list",
      "codex --image=a.png,b.png cloud",
      "codex -i a.png,b.png login",
      "codex -i a.png b.png a",
      "codex --image a.png b.png cloud-tasks list",
    ];
    const agentCommands = [
      'codex -i a.png "fix the bug"',
      "codex -i a.png fix the bug",
      "codex -i a.png b.png",
      "codex -i a.png resume --last",
      "codex --image a.png b.png fork --last",
      "codex -i a.png b.png exec summarize the screenshots",
      "codex -i a.png b.png e -",
      "codex -i a.png b.png review",
      "codex -i a.png --model o3 describe this",
    ];

    it.each(helperCommands)("does not handle helper command %s", (command) => {
      expect(adapter.canHandle({ pid: 30, command, cwd: "/repo", tty: "??" })).toBe(false);
    });

    it.each(agentCommands)("handles agent command %s", (command) => {
      expect(adapter.canHandle({ pid: 31, command, cwd: "/repo", tty: "ttys003" })).toBe(true);
    });
  });

  it("still excludes helper subcommands when Codex lives under a path containing spaces", () => {
    const executable = path.join(
      tmpHome,
      "Applications",
      "Some App.app",
      "Contents",
      "Resources",
      "codex",
    );
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, "");

    for (const args of [
      "sandbox -c sandbox_permissions=[] -- node server.js",
      "app-server --listen stdio://",
    ]) {
      expect(
        adapter.canHandle({ pid: 4323, command: `${executable} ${args}`, cwd: "/repo", tty: "??" }),
      ).toBe(false);
    }
    expect(
      adapter.canHandle({
        pid: 4324,
        command: `${executable} resume --last`,
        cwd: "/repo",
        tty: "ttys003",
      }),
    ).toBe(true);
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

  it("does not rescan session files for an unmatched process on the next refresh", async () => {
    const processInfo: ProcessInfo = {
      pid: 100,
      command: "codex",
      cwd: "/repo-a",
      tty: "ttys001",
      startTime: new Date("2026-03-18T15:00:00.000Z"),
    };
    writeSession("sess-other", "/repo-other", []);
    mockedListAgentProcesses.mockReturnValue([processInfo]);
    mockedBatchGetSessionFileBirthtimes.mockReturnValue([]);

    await adapter.detectAgents();
    const agents = await adapter.detectAgents();

    expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);
    expect(agents).toMatchObject([{ pid: 100, sessionId: "pid-100" }]);
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
    await expect(adapter.findSessionsById("listed")).resolves.toMatchObject([
      {
        type: "codex",
        sessionId: "listed",
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
