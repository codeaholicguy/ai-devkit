import Database from "better-sqlite3";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentStatus, type ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { OpenCodeAdapter } from "../../../harnesses/opencode/OpenCodeAdapter.js";

describe("OpenCodeAdapter", () => {
  let adapter: OpenCodeAdapter;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-adapter-test-"));
    dbPath = path.join(tmpDir, "opencode.db");
    adapter = new OpenCodeAdapter(dbPath);
  });

  afterEach(() => {
    adapter.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects opencode executables", () => {
    expect(adapter.canHandle({ pid: 1, command: "opencode", cwd: "/repo" })).toBe(true);
    expect(adapter.canHandle({ pid: 2, command: "/usr/bin/opencode.exe", cwd: "/repo" })).toBe(
      true,
    );
    expect(adapter.canHandle({ pid: 3, command: "node /repo/opencode-plugin.js" })).toBe(false);
  });

  it("folds spawned child opencode processes into their parent agent (issue #402)", async () => {
    // Chatting in an OpenCode session can spawn another session — the child
    // process is that session's backend, not a new agent, so the manager must
    // not list it under its raw auto-generated name.
    const now = Date.now();
    writeDatabase(dbPath, {
      sessions: [
        { id: "sess-parent", directory: "/repo", timeCreated: now - 60_000, title: "main session" },
        {
          id: "sess-child",
          directory: "/repo",
          timeCreated: now - 10_000,
          title: "slug-lib-75800",
        },
      ],
    });

    const parent: ProcessInfo = { pid: 100, command: "opencode", cwd: "/repo", tty: "ttys001" };
    const child: ProcessInfo = {
      pid: 75800,
      ppid: 100,
      command: "opencode",
      cwd: "/repo",
      tty: "ttys001",
    };
    const agents = await adapter.detectAgents({ processes: [parent, child] });

    expect(agents.map((a) => a.pid)).toEqual([100]);
    expect(agents).toHaveLength(1);
  });

  it("keeps sibling opencode processes with no ancestry link as separate agents", async () => {
    const a: ProcessInfo = { pid: 100, command: "opencode", cwd: "/repo", tty: "ttys001" };
    const b: ProcessInfo = { pid: 200, command: "opencode", cwd: "/repo", tty: "ttys002" };
    const agents = await adapter.detectAgents({ processes: [a, b] });

    expect(agents.map((agent) => agent.pid).sort()).toEqual([100, 200]);
  });

  it("returns process-only agents when the database is unavailable", async () => {
    const agents = await adapter.detectAgents({
      processes: [{ pid: 100, command: "opencode", cwd: "/repo", tty: "ttys001" }],
    });

    expect(agents).toEqual([
      expect.objectContaining({
        type: "opencode",
        status: AgentStatus.RUNNING,
        pid: 100,
        projectPath: "/repo",
        sessionId: "pid-100",
        summary: "OpenCode process running",
      }),
    ]);
  });

  it("maps matching OpenCode sessions to agents", async () => {
    const now = Date.now();
    writeDatabase(dbPath, {
      sessions: [{ id: "sess-001", directory: "/repo", timeCreated: now - 60_000 }],
      messages: [
        {
          id: "msg-user",
          sessionId: "sess-001",
          role: "user",
          timeCreated: now - 50_000,
          timeUpdated: now - 50_000,
        },
        {
          id: "msg-assistant",
          sessionId: "sess-001",
          role: "assistant",
          timeCreated: now - 30_000,
          timeUpdated: now - 30_000,
          completed: now - 20_000,
        },
      ],
      parts: [
        {
          messageId: "msg-user",
          sessionId: "sess-001",
          type: "text",
          text: "Refactor this module",
          timeCreated: now - 50_000,
        },
      ],
    });

    const process: ProcessInfo = { pid: 200, command: "opencode", cwd: "/repo", tty: "ttys002" };
    const [agent] = await adapter.detectAgents({ processes: [process] });

    expect(agent).toMatchObject({
      type: "opencode",
      status: AgentStatus.WAITING,
      pid: 200,
      projectPath: "/repo",
      sessionId: "sess-001",
      summary: "Refactor this module",
      sessionFilePath: `${dbPath}::sess-001`,
    });
  });

  it("keeps the session title as summary metadata, never as the agent name", async () => {
    // Issue #402: authenticated OpenCode writes an auto-generated title like
    // "slug-lib-75800" into session.title. Detection must leave the harness
    // title out of `name` (registry assigns identity in the manager merge).
    const now = Date.now();
    writeDatabase(dbPath, {
      sessions: [
        {
          id: "sess-titled",
          directory: "/repo",
          timeCreated: now - 60_000,
          title: "slug-lib-75800",
        },
      ],
    });

    const process: ProcessInfo = { pid: 75800, command: "opencode", cwd: "/repo", tty: "ttys009" };
    const [agent] = await adapter.detectAgents({ processes: [process] });

    expect(agent.name).toBe("repo-75800");
    expect(agent.name).not.toBe("slug-lib-75800");
    expect(agent.summary).toBe("slug-lib-75800");

    const [summary] = await adapter.listSessions();
    expect(summary.firstUserMessage).toBe("slug-lib-75800");
  });

  it("detects agents against a session table without a title column", async () => {
    const now = Date.now();
    writeDatabase(dbPath, {
      legacySchema: true,
      sessions: [{ id: "sess-legacy", directory: "/repo", timeCreated: now - 60_000 }],
    });

    const process: ProcessInfo = { pid: 300, command: "opencode", cwd: "/repo", tty: "ttys010" };
    const [agent] = await adapter.detectAgents({ processes: [process] });

    expect(agent.sessionId).toBe("sess-legacy");
    expect(agent.summary).toBe("OpenCode session active");
  });

  it("returns conversation messages for encoded OpenCode session refs", () => {
    writeDatabase(dbPath, {
      sessions: [{ id: "sess-abc", directory: "/repo", timeCreated: Date.now() }],
      messages: [
        {
          id: "msg-user",
          sessionId: "sess-abc",
          role: "user",
          timeCreated: 1000,
          timeUpdated: 1000,
        },
      ],
      parts: [
        {
          messageId: "msg-user",
          sessionId: "sess-abc",
          type: "text",
          text: "Hello agent",
          timeCreated: 1000,
        },
      ],
    });

    expect(adapter.getConversation(`${dbPath}::sess-abc`)).toEqual([
      { role: "user", content: "Hello agent" },
    ]);
    expect(adapter.getConversation("/not-an-opencode-ref")).toEqual([]);
  });

  it("finds an exact session ID with a targeted database query", async () => {
    const now = Date.now();
    writeDatabase(dbPath, {
      sessions: [
        { id: "wanted", directory: "/repo", timeCreated: now },
        { id: "other", directory: "/other", timeCreated: now - 1_000 },
      ],
    });

    await expect(adapter.findSessionsById("wanted")).resolves.toEqual([
      expect.objectContaining({
        type: "opencode",
        sessionId: "wanted",
        sessionFilePath: `${dbPath}::wanted`,
      }),
    ]);
  });
});

function writeDatabase(
  filePath: string,
  data: {
    sessions: Array<{ id: string; directory: string; timeCreated: number; title?: string }>;
    /** When true, create the pre-title schema (no `title` column). */
    legacySchema?: boolean;
    messages?: Array<{
      id: string;
      sessionId: string;
      role: string;
      timeCreated: number;
      timeUpdated: number;
      completed?: number;
    }>;
    parts?: Array<{
      messageId: string;
      sessionId: string;
      type: string;
      text?: string;
      reasoning?: string;
      tool?: string;
      timeCreated: number;
    }>;
  },
): void {
  const db = new Database(filePath);
  const sessionTable = data.legacySchema
    ? "CREATE TABLE session (id TEXT, directory TEXT, time_created INTEGER)"
    : "CREATE TABLE session (id TEXT, directory TEXT, title TEXT, time_created INTEGER)";
  db.exec(`
    ${sessionTable};
    CREATE TABLE message (id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE part (message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER);
  `);

  const insertSession = db.prepare(
    data.legacySchema
      ? "INSERT INTO session (id, directory, time_created) VALUES (?, ?, ?)"
      : "INSERT INTO session (id, directory, title, time_created) VALUES (?, ?, ?, ?)",
  );
  for (const session of data.sessions) {
    if (data.legacySchema) {
      insertSession.run(session.id, session.directory, session.timeCreated);
    } else {
      insertSession.run(session.id, session.directory, session.title ?? null, session.timeCreated);
    }
  }

  const insertMessage = db.prepare(
    "INSERT INTO message (id, session_id, data, time_created, time_updated) VALUES (?, ?, ?, ?, ?)",
  );
  for (const message of data.messages ?? []) {
    insertMessage.run(
      message.id,
      message.sessionId,
      JSON.stringify({
        role: message.role,
        time: message.completed === undefined ? {} : { completed: message.completed },
      }),
      message.timeCreated,
      message.timeUpdated,
    );
  }

  const insertPart = db.prepare(
    "INSERT INTO part (message_id, session_id, data, time_created) VALUES (?, ?, ?, ?)",
  );
  for (const part of data.parts ?? []) {
    insertPart.run(
      part.messageId,
      part.sessionId,
      JSON.stringify({
        type: part.type,
        text: part.text,
        reasoning: part.reasoning,
        tool: part.tool,
      }),
      part.timeCreated,
    );
  }

  db.close();
}
