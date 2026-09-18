import Database from "better-sqlite3";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentStatus, type ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { OpenCodeAdapter } from "../../../providers/opencode/OpenCodeAdapter.js";

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
});

function writeDatabase(
  filePath: string,
  data: {
    sessions: Array<{ id: string; directory: string; timeCreated: number }>;
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
  db.exec(`
    CREATE TABLE session (id TEXT, directory TEXT, time_created INTEGER);
    CREATE TABLE message (id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE part (message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER);
  `);

  const insertSession = db.prepare(
    "INSERT INTO session (id, directory, time_created) VALUES (?, ?, ?)",
  );
  for (const session of data.sessions) {
    insertSession.run(session.id, session.directory, session.timeCreated);
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
