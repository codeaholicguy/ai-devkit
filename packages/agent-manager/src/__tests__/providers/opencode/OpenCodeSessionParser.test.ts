import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpenCodeSessionParser } from "../../../providers/opencode/OpenCodeSessionParser.js";

describe("OpenCodeSessionParser", () => {
  let db: Database.Database;
  let parser: OpenCodeSessionParser;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE message (id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
      CREATE TABLE part (message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER);
    `);
    parser = new OpenCodeSessionParser();
  });

  afterEach(() => {
    db.close();
  });

  it("extracts session stats from OpenCode messages and parts", () => {
    insertMessage(db, {
      id: "msg-user",
      sessionId: "sess-1",
      role: "user",
      timeCreated: 1000,
      timeUpdated: 1000,
    });
    insertMessage(db, {
      id: "msg-assistant",
      sessionId: "sess-1",
      role: "assistant",
      timeCreated: 2000,
      timeUpdated: 2500,
      completed: 2400,
    });
    insertPart(db, {
      messageId: "msg-user",
      sessionId: "sess-1",
      data: { type: "text", text: "Plan the migration" },
      timeCreated: 1000,
    });

    expect(parser.getSessionStats(db, "sess-1")).toEqual({
      lastRole: "assistant",
      lastTimeUpdated: 2500,
      lastAssistantCompleted: true,
      lastAssistantErrored: false,
      summary: "Plan the migration",
    });
  });

  it("orders stats by message creation time, not metadata update time", () => {
    insertMessage(db, {
      id: "msg-user",
      sessionId: "sess-1",
      role: "user",
      timeCreated: 1000,
      timeUpdated: 3000,
    });
    insertMessage(db, {
      id: "msg-assistant",
      sessionId: "sess-1",
      role: "assistant",
      timeCreated: 2000,
      timeUpdated: 2100,
      completed: 2200,
    });

    expect(parser.getSessionStats(db, "sess-1").lastRole).toBe("assistant");
  });

  it("reads visible conversation text and hides verbose-only parts by default", () => {
    insertMessage(db, {
      id: "msg-user",
      sessionId: "sess-1",
      role: "user",
      timeCreated: 1000,
      timeUpdated: 1000,
    });
    insertMessage(db, {
      id: "msg-assistant",
      sessionId: "sess-1",
      role: "assistant",
      timeCreated: 2000,
      timeUpdated: 2000,
    });
    insertPart(db, {
      messageId: "msg-user",
      sessionId: "sess-1",
      data: { type: "text", text: "Hello" },
      timeCreated: 1000,
    });
    insertPart(db, {
      messageId: "msg-assistant",
      sessionId: "sess-1",
      data: { type: "reasoning", reasoning: "private thought" },
      timeCreated: 2000,
    });
    insertPart(db, {
      messageId: "msg-assistant",
      sessionId: "sess-1",
      data: { type: "tool", tool: "read_file" },
      timeCreated: 3000,
    });

    expect(parser.getConversation(db, "sess-1")).toEqual([{ role: "user", content: "Hello" }]);
    expect(parser.getConversation(db, "sess-1", { verbose: true })).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "[thinking] private thought" },
      { role: "assistant", content: "[tool: read_file]" },
    ]);
  });
});

function insertMessage(
  db: Database.Database,
  input: {
    id: string;
    sessionId: string;
    role: string;
    timeCreated: number;
    timeUpdated: number;
    completed?: number;
  },
): void {
  db.prepare(
    "INSERT INTO message (id, session_id, data, time_created, time_updated) VALUES (?, ?, ?, ?, ?)",
  ).run(
    input.id,
    input.sessionId,
    JSON.stringify({
      role: input.role,
      time: input.completed === undefined ? {} : { completed: input.completed },
    }),
    input.timeCreated,
    input.timeUpdated,
  );
}

function insertPart(
  db: Database.Database,
  input: { messageId: string; sessionId: string; data: unknown; timeCreated: number },
): void {
  db.prepare("INSERT INTO part (message_id, session_id, data, time_created) VALUES (?, ?, ?, ?)")
    .run(input.messageId, input.sessionId, JSON.stringify(input.data), input.timeCreated);
}
