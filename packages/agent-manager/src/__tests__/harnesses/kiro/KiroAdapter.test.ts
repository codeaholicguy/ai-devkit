import type { MockedFunction } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { KiroAdapter } from "../../../harnesses/kiro/KiroAdapter.js";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../../adapters/AgentAdapter.js";
import { captureProcessSnapshot } from "../../../utils/process.js";
import { generateAgentName } from "../../../utils/matching.js";

vi.mock("../../../utils/process.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../../utils/process.js");
  return { ...actual, captureProcessSnapshot: vi.fn() };
});

vi.mock("../../../utils/matching.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../../utils/matching.js");
  return {
    ...actual,
    generateAgentName: vi.fn(),
  };
});

const mockedCaptureProcessSnapshot = captureProcessSnapshot as MockedFunction<
  typeof captureProcessSnapshot
>;
const mockedGenerateAgentName = generateAgentName as MockedFunction<typeof generateAgentName>;

describe("KiroAdapter", () => {
  let adapter: KiroAdapter;
  let tmpHome: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "kiro-adapter-test-"));
    process.env.HOME = tmpHome;
    sessionsDir = path.join(tmpHome, ".kiro", "sessions", "cli");
    fs.mkdirSync(sessionsDir, { recursive: true });

    adapter = new KiroAdapter();

    mockedCaptureProcessSnapshot.mockReset();
    mockedGenerateAgentName.mockReset();
    mockedGenerateAgentName.mockImplementation((cwd: string, pid: number) => {
      const folder = path.basename(cwd) || "unknown";
      return `${folder} (${pid})`;
    });
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("exposes the kiro type and process names", () => {
    expect(adapter.type).toBe("kiro");
    expect(adapter.processNames).toEqual(["kiro-cli", "kiro", "kiro-cli-chat", "node", "bun"]);
  });

  describe("canHandle", () => {
    const handles = (command: string) =>
      adapter.canHandle({ pid: 1, command, cwd: "/repo", tty: "ttys001" });

    it.each([
      "kiro-cli",
      "kiro-cli chat",
      "/usr/local/bin/kiro --model x",
      "node /opt/kiro/bin/kiro-cli.js",
      "bun /opt/kiro/bin/kiro-cli.js",
    ])("handles %s", (command) => {
      expect(handles(command)).toBe(true);
    });

    it.each([
      "node /repo/feature-kiro-adapter/script.js",
      "node /usr/local/bin/ai-devkit agent start --type kiro",
      "node server.js --name kiro",
      "kiro-cli-chat acp",
    ])("ignores %s", (command) => {
      expect(handles(command)).toBe(false);
    });

    it("identifies Kiro when the runtime or script path contains spaces", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "kiro-spaces-"));
      try {
        const install = (relativePath: string) => {
          const fullPath = path.join(root, relativePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, "");
          return fullPath;
        };
        const node = install("Applications/Dev Tools/bin/node");
        const kiro = install("Applications/Kiro App.app/Contents/Resources/kiro-cli");
        const script = install("My Tools/kiro/bin/kiro-cli.js");

        expect(handles(`${kiro} chat --trust-all-tools`)).toBe(true);
        expect(handles(`${node} /opt/kiro/bin/kiro-cli.js`)).toBe(true);
        expect(handles(`${node} --no-warnings ${script} chat`)).toBe(true);
        expect(handles(`${node} /repo/server.js --name My Dir/kiro-cli`)).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe("detectAgents", () => {
    it("returns [] when there are no Kiro processes", async () => {
      mockedCaptureProcessSnapshot.mockResolvedValue([]);
      expect(await adapter.detectAgents()).toEqual([]);
    });

    it("maps a running Kiro process through its session lock and metadata", async () => {
      const cwd = "/repo/project-a";
      const proc = makeProcess({ pid: 101, cwd: "/process/cwd" });
      const updatedAt = new Date().toISOString();
      const sessionFile = writeKiroSession(
        "sess-101",
        cwd,
        [prompt("implement Kiro adapter", 1781098057), assistantText("working on it")],
        101,
        updatedAt,
      );
      mockedCaptureProcessSnapshot.mockResolvedValue([proc]);

      const agents = await adapter.detectAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        type: "kiro",
        pid: 101,
        projectPath: cwd,
        sessionId: "sess-101",
        summary: "implement Kiro adapter",
        status: AgentStatus.WAITING,
        sessionFilePath: sessionFile,
        lastActive: new Date(updatedAt),
      });
    });

    it("walks through the bundled bun TUI to the kiro-cli that owns an acp lock", async () => {
      // Real kiro-cli tree: the acp helper has no tty, so only the parent chain links it.
      const bun = path.join(tmpHome, "Library", "Application Support", "kiro-cli", "bun");
      fs.mkdirSync(path.dirname(bun), { recursive: true });
      fs.writeFileSync(bun, "");
      const sessionFile = writeKiroSession(
        "sess-bun",
        "/repo/bun",
        [prompt("hello", 1781098057)],
        35355,
      );
      const kiro = makeProcess({ pid: 35261, command: "kiro-cli", ppid: 28496, tty: "ttys007" });
      const chat = makeProcess({
        pid: 35320,
        command: "/home/.local/bin/kiro-cli-chat chat",
        ppid: 35261,
        tty: "ttys007",
      });
      const tui = makeProcess({
        pid: 35349,
        command: `${bun} --no-env-file ${path.dirname(bun)}/tui.js chat`,
        ppid: 35320,
        tty: "ttys007",
      });
      const acp = makeProcess({
        pid: 35355,
        command: "/home/.local/bin/kiro-cli-chat acp",
        ppid: 35349,
        tty: "??",
      });
      mockedCaptureProcessSnapshot.mockResolvedValue([kiro, chat, tui, acp]);

      const agents = await adapter.detectAgents();

      expect(agents).toEqual([
        expect.objectContaining({
          pid: 35261,
          sessionId: "sess-bun",
          sessionFilePath: sessionFile,
        }),
      ]);
    });

    it("falls back to the sole kiro-cli on the lock holder tty when its parent chain is broken", async () => {
      const cwd = "/repo/project-a";
      const sessionFile = writeKiroSession(
        "sess-acp",
        cwd,
        [prompt("implement Kiro adapter", 1781098057), assistantText("working on it")],
        55236,
      );
      const kiro = makeProcess({ pid: 55111, command: "kiro-cli", cwd: "/process/cwd", ppid: 1 });
      const chat = makeProcess({
        pid: 55168,
        command: "kiro-cli-chat chat",
        ppid: 55111,
        tty: "ttys001",
      });
      const acp = makeProcess({
        pid: 55236,
        command: "kiro-cli-chat acp",
        ppid: 55198,
        tty: "ttys001",
      });
      mockedCaptureProcessSnapshot.mockResolvedValue([kiro, chat, acp]);

      const agents = await adapter.detectAgents();

      expect(agents).toEqual([
        expect.objectContaining({
          type: "kiro",
          pid: 55111,
          projectPath: cwd,
          sessionId: "sess-acp",
          summary: "implement Kiro adapter",
          sessionFilePath: sessionFile,
        }),
      ]);
    });

    it("walks a collected kiro-cli-chat parent chain to the owning kiro-cli", async () => {
      const sessionFile = writeKiroSession(
        "sess-owner",
        "/repo/owner",
        [prompt("owned session", 1781098057)],
        55236,
      );
      const owner = makeProcess({ pid: 55111, command: "kiro-cli", cwd: "/repo/owner", ppid: 1 });
      const other = makeProcess({ pid: 66111, command: "kiro-cli", cwd: "/repo/other", ppid: 1 });
      const chat = makeProcess({ pid: 55168, command: "kiro-cli-chat chat", ppid: 55111 });
      const acp = makeProcess({ pid: 55236, command: "kiro-cli-chat acp", ppid: 55168 });
      mockedCaptureProcessSnapshot.mockResolvedValue([owner, other, chat, acp]);

      const agents = await adapter.detectAgents();

      expect(agents).toEqual([
        expect.objectContaining({
          pid: 55111,
          projectPath: "/repo/owner",
          sessionId: "sess-owner",
          sessionFilePath: sessionFile,
        }),
        expect.objectContaining({ pid: 66111, sessionId: "pid-66111" }),
      ]);
    });

    it("does not attach a session through tty ?? or an ambiguous tty", async () => {
      writeKiroSession("sess-unknown-tty", "/repo/unknown", [prompt("hello", 1781098057)], 55236);
      const unknownTty = makeProcess({ pid: 55111, command: "kiro-cli", tty: "??", ppid: 1 });
      const unknownAcp = makeProcess({
        pid: 55236,
        command: "kiro-cli-chat acp",
        tty: "??",
        ppid: 55198,
      });
      mockedCaptureProcessSnapshot.mockResolvedValue([unknownTty, unknownAcp]);

      expect(await adapter.detectAgents()).toEqual([
        expect.objectContaining({ pid: 55111, sessionId: "pid-55111" }),
      ]);

      writeKiroSession("sess-shared-tty", "/repo/shared", [prompt("hello", 1781098057)], 66236);
      const first = makeProcess({ pid: 55111, command: "kiro-cli", tty: "ttys001", ppid: 1 });
      const second = makeProcess({ pid: 66111, command: "kiro-cli", tty: "ttys001", ppid: 1 });
      const sharedAcp = makeProcess({
        pid: 66236,
        command: "kiro-cli-chat acp",
        tty: "ttys001",
        ppid: 55198,
      });
      mockedCaptureProcessSnapshot.mockResolvedValue([first, second, sharedAcp]);

      expect(await adapter.detectAgents()).toEqual([
        expect.objectContaining({ pid: 55111, sessionId: "pid-55111" }),
        expect.objectContaining({ pid: 66111, sessionId: "pid-66111" }),
      ]);
    });

    it("uses a supplied process snapshot instead of scanning again", async () => {
      const proc = makeProcess({ pid: 606, cwd: "/repo/context" });
      mockedCaptureProcessSnapshot.mockResolvedValue([makeProcess({ pid: 999 })]);

      const agents = await adapter.detectAgents({ processes: [proc] });

      expect(mockedCaptureProcessSnapshot).not.toHaveBeenCalled();
      expect(agents).toEqual([
        expect.objectContaining({
          pid: 606,
          projectPath: "/repo/context",
          sessionId: "pid-606",
        }),
      ]);
    });

    it("uses only a lock whose PID belongs to a running Kiro process", async () => {
      writeKiroSession("ended-session", "/repo/ended", [prompt("old conversation", 1781098057)]);
      writeKiroSession(
        "other-process",
        "/repo/other",
        [prompt("other conversation", 1781098057)],
        999,
      );
      const proc = makeProcess({ pid: 202, cwd: "/repo/current" });
      mockedCaptureProcessSnapshot.mockResolvedValue([proc]);

      const agents = await adapter.detectAgents();

      expect(agents).toEqual([
        expect.objectContaining({
          pid: 202,
          projectPath: "/repo/current",
          sessionId: "pid-202",
          summary: "Kiro process running",
        }),
      ]);
    });

    it("ignores malformed lock files", async () => {
      writeKiroSession("bad-lock", "/repo/project", [prompt("hello", 1781098057)]);
      fs.writeFileSync(path.join(sessionsDir, "bad-lock.lock"), "{bad json");
      const proc = makeProcess({ pid: 303, cwd: "/repo/project" });
      mockedCaptureProcessSnapshot.mockResolvedValue([proc]);

      const agents = await adapter.detectAgents();

      expect(agents[0]).toMatchObject({ sessionId: "pid-303" });
    });

    it("reports running while the latest assistant event invokes a tool", async () => {
      writeKiroSession(
        "tool-session",
        "/repo/project",
        [
          prompt("inspect the file", Math.floor(Date.now() / 1000)),
          assistantTool("fs_read", { path: "/repo/project/file.ts" }),
        ],
        404,
        new Date().toISOString(),
      );
      const proc = makeProcess({ pid: 404, cwd: "/repo/project" });
      mockedCaptureProcessSnapshot.mockResolvedValue([proc]);

      const agents = await adapter.detectAgents();

      expect(agents[0].status).toBe(AgentStatus.RUNNING);
    });

    it("returns a process-only agent when the locked transcript is missing", async () => {
      fs.writeFileSync(path.join(sessionsDir, "missing.lock"), JSON.stringify({ pid: 505 }));
      const proc = makeProcess({ pid: 505, cwd: "/repo/project-e" });
      mockedCaptureProcessSnapshot.mockResolvedValue([proc]);

      const agents = await adapter.detectAgents();

      expect(agents).toEqual([
        expect.objectContaining({
          type: "kiro",
          status: AgentStatus.RUNNING,
          pid: 505,
          projectPath: "/repo/project-e",
          sessionId: "pid-505",
          summary: "Kiro process running",
        }),
      ]);
    });
  });

  describe("getConversation", () => {
    it("reads real Kiro prompt and assistant message envelopes", () => {
      const sessionFile = writeKiroSession("conversation", "/repo/project-f", [
        prompt("hello kiro", 1781098057),
        assistantText("Hello! How can I help?"),
        "{not json",
      ]);

      expect(adapter.getConversation(sessionFile)).toEqual([
        { role: "user", content: "hello kiro", timestamp: "2026-06-10T13:27:37.000Z" },
        { role: "assistant", content: "Hello! How can I help?", timestamp: undefined },
      ]);
    });

    it("includes Kiro tool use and results only in verbose conversation mode", () => {
      const sessionFile = writeKiroSession("tools", "/repo/project-tools", [
        prompt("read package.json", 1781098057),
        assistantTool("fs_read", { path: "package.json" }),
        toolResult("contents", "success"),
        assistantText("Done."),
      ]);

      expect(adapter.getConversation(sessionFile)).toEqual([
        { role: "user", content: "read package.json", timestamp: "2026-06-10T13:27:37.000Z" },
        { role: "assistant", content: "Done.", timestamp: undefined },
      ]);
      expect(adapter.getConversation(sessionFile, { verbose: true })).toEqual([
        { role: "user", content: "read package.json", timestamp: "2026-06-10T13:27:37.000Z" },
        {
          role: "assistant",
          content: '[Tool: fs_read] {"path":"package.json"}',
          timestamp: undefined,
        },
        { role: "system", content: "[Tool Result] contents", timestamp: undefined },
        { role: "assistant", content: "Done.", timestamp: undefined },
      ]);
    });
  });

  describe("listSessions", () => {
    it("lists historical sessions using metadata and applies cwd filtering", async () => {
      const matchingCwd = "/repo/project-g";
      const matchingSession = writeKiroSession("sess-g", matchingCwd, [
        prompt("first matching message", 1781098057),
        assistantText("response"),
      ]);
      writeKiroSession("sess-h", "/repo/project-h", [prompt("other message", 1781098057)]);

      const sessions = await adapter.listSessions({ cwd: matchingCwd });

      expect(sessions).toEqual([
        expect.objectContaining({
          type: "kiro",
          sessionId: "sess-g",
          cwd: matchingCwd,
          firstUserMessage: "first matching message",
          startedAt: new Date("2026-06-10T13:27:17.000Z"),
          lastActive: new Date("2026-06-10T13:27:40.000Z"),
          sessionFilePath: matchingSession,
        }),
      ]);
    });
  });

  describe("findSessionsById", () => {
    it("reads only the session stored under that id", async () => {
      const sessionFile = writeKiroSession("sess-find", "/repo/find", [
        prompt("find me", 1781098057),
      ]);
      writeKiroSession("sess-other", "/repo/other", [prompt("not me", 1781098057)]);

      expect(await adapter.findSessionsById("sess-find")).toEqual([
        expect.objectContaining({
          type: "kiro",
          sessionId: "sess-find",
          cwd: "/repo/find",
          firstUserMessage: "find me",
          sessionFilePath: sessionFile,
        }),
      ]);
    });

    it("returns [] for a missing or unsafe id", async () => {
      writeKiroSession("sess-find", "/repo/find", [prompt("find me", 1781098057)]);

      expect(await adapter.findSessionsById("missing")).toEqual([]);
      expect(await adapter.findSessionsById("../cli/sess-find")).toEqual([]);
    });
  });

  function makeProcess(overrides: Partial<ProcessInfo>): ProcessInfo {
    return {
      pid: 1,
      command: "kiro-cli chat",
      cwd: "/repo",
      tty: "ttys001",
      startTime: new Date("2026-06-10T13:27:17.000Z"),
      ...overrides,
    };
  }

  function writeKiroSession(
    sessionId: string,
    cwd: string,
    entries: Array<Record<string, unknown> | string>,
    pid?: number,
    updatedAt = "2026-06-10T13:27:40.000Z",
  ): string {
    fs.writeFileSync(
      path.join(sessionsDir, `${sessionId}.json`),
      JSON.stringify({
        session_id: sessionId,
        cwd,
        created_at: "2026-06-10T13:27:17.000Z",
        updated_at: updatedAt,
        title: "Session title",
      }),
    );
    const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
    fs.writeFileSync(
      filePath,
      entries
        .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
        .join("\n"),
    );
    if (pid !== undefined) {
      fs.writeFileSync(
        path.join(sessionsDir, `${sessionId}.lock`),
        JSON.stringify({
          pid,
          started_at: "2026-06-10T13:27:17.000Z",
        }),
      );
    }
    return filePath;
  }

  function prompt(text: string, timestamp: number): Record<string, unknown> {
    return {
      version: "v1",
      kind: "Prompt",
      data: {
        content: [{ kind: "text", data: text }],
        meta: { timestamp },
      },
    };
  }

  function assistantText(text: string): Record<string, unknown> {
    return {
      version: "v1",
      kind: "AssistantMessage",
      data: { content: [{ kind: "text", data: text }] },
    };
  }

  function assistantTool(name: string, input: Record<string, unknown>): Record<string, unknown> {
    return {
      version: "v1",
      kind: "AssistantMessage",
      data: {
        content: [
          {
            kind: "toolUse",
            data: { toolUseId: "tool-1", name, input },
          },
        ],
      },
    };
  }

  function toolResult(result: string, status: string): Record<string, unknown> {
    return {
      version: "v1",
      kind: "ToolResults",
      data: {
        content: [
          {
            kind: "toolResult",
            data: { toolUseId: "tool-1", status, result },
          },
        ],
      },
    };
  }
});
