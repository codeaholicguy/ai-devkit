import Database from "better-sqlite3";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DevinSessionParser } from "../../../harnesses/devin/DevinSessionParser.js";
import { writeDatabase } from "./fixtures.js";

describe("DevinSessionParser", () => {
  let tmpDir: string;
  let dbPath: string;
  let parser: DevinSessionParser;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devin-parser-test-"));
    dbPath = path.join(tmpDir, "sessions.db");
    parser = new DevinSessionParser();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function openDb(): Database.Database {
    return new Database(dbPath, { readonly: true });
  }

  it("returns user and assistant messages in node order, skipping system", () => {
    writeDatabase(dbPath, {
      nodes: [
        { sessionId: "s", nodeId: 1, role: "system", content: "preamble" },
        { sessionId: "s", nodeId: 2, role: "user", content: "hello", isUserInput: true },
        { sessionId: "s", nodeId: 3, role: "assistant", content: "hi" },
        // Later turn roots a fresh preamble chain:
        { sessionId: "s", nodeId: 4, role: "system", content: "more preamble" },
        { sessionId: "s", nodeId: 5, role: "user", content: "again", isUserInput: true },
        { sessionId: "s", nodeId: 6, role: "assistant", content: "done" },
      ],
    });
    const db = openDb();
    try {
      expect(parser.getConversation(db, "s")).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "again" },
        { role: "assistant", content: "done" },
      ]);
    } finally {
      db.close();
    }
  });

  it("dedupes sibling revisions by message_id keeping the highest node_id", () => {
    writeDatabase(dbPath, {
      nodes: [
        { sessionId: "s", nodeId: 1, role: "assistant", content: "draft", messageId: "m1" },
        { sessionId: "s", nodeId: 2, role: "assistant", content: "final", messageId: "m1" },
      ],
    });
    const db = openDb();
    try {
      expect(parser.getConversation(db, "s")).toEqual([
        { role: "assistant", content: "final" },
      ]);
    } finally {
      db.close();
    }
  });

  it("skips non-input user nodes and empty content", () => {
    writeDatabase(dbPath, {
      nodes: [
        { sessionId: "s", nodeId: 1, role: "user", content: "wrapper", isUserInput: false },
        { sessionId: "s", nodeId: 2, role: "user", content: "   ", isUserInput: true },
        { sessionId: "s", nodeId: 3, role: "user", content: "real", isUserInput: true },
      ],
    });
    const db = openDb();
    try {
      expect(parser.getConversation(db, "s")).toEqual([{ role: "user", content: "real" }]);
    } finally {
      db.close();
    }
  });

  it("includes tools and thinking only in verbose mode", () => {
    writeDatabase(dbPath, {
      nodes: [
        {
          sessionId: "s",
          nodeId: 1,
          role: "assistant",
          content: "working",
          thinking: "hmm",
          toolCalls: [{ function: { name: "exec" } }],
        },
        { sessionId: "s", nodeId: 2, role: "tool", content: "tool output", name: "exec" },
      ],
    });
    const db = openDb();
    try {
      expect(parser.getConversation(db, "s")).toEqual([
        { role: "assistant", content: "working" },
      ]);
      expect(parser.getConversation(db, "s", { verbose: true })).toEqual([
        { role: "assistant", content: "[thinking] hmm" },
        { role: "assistant", content: "working" },
        { role: "assistant", content: "[tool: exec]" },
        { role: "assistant", content: "[tool: exec] tool output" },
      ]);
    } finally {
      db.close();
    }
  });

  it("honors tail and bounds the query window", () => {
    writeDatabase(dbPath, {
      nodes: Array.from({ length: 30 }, (_, i) => ({
        sessionId: "s",
        nodeId: i + 1,
        role: "user" as const,
        content: `msg-${i + 1}`,
        isUserInput: true,
      })),
    });
    const db = openDb();
    try {
      const convo = parser.getConversation(db, "s", { tail: 3 });
      expect(convo).toEqual([
        { role: "user", content: "msg-28" },
        { role: "user", content: "msg-29" },
        { role: "user", content: "msg-30" },
      ]);
    } finally {
      db.close();
    }
  });

  it("skips malformed chat_message rows and missing sessions", () => {
    writeDatabase(dbPath, {
      nodes: [
        { sessionId: "s", nodeId: 1, raw: "{not json" },
        { sessionId: "s", nodeId: 2, role: "assistant", content: "ok" },
      ],
    });
    const db = openDb();
    try {
      expect(parser.getConversation(db, "s")).toEqual([
        { role: "assistant", content: "ok" },
      ]);
      expect(parser.getConversation(db, "missing")).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("reports session stats from the frontier node and latest prompt", () => {
    writeDatabase(dbPath, {
      nodes: [
        { sessionId: "s", nodeId: 1, role: "user", content: "go", createdAt: 100 },
        { sessionId: "s", nodeId: 2, role: "assistant", content: "done", createdAt: 200 },
      ],
      prompts: [
        { sessionId: "s", content: "first task", timestamp: 100 },
        { sessionId: "s", content: "/mcp", timestamp: 300 },
        { sessionId: "s", content: "latest task", timestamp: 200 },
        { sessionId: "s", content: "!shell", timestamp: 400, isShell: 1 },
      ],
    });
    const db = openDb();
    try {
      expect(parser.getSessionStats(db, "s")).toEqual({
        lastRole: "assistant",
        lastTimeUpdated: 200_000,
        summary: "latest task",
      });
      expect(parser.getSessionStats(db, "missing")).toEqual({
        lastRole: null,
        lastTimeUpdated: 0,
        summary: "",
      });
    } finally {
      db.close();
    }
  });

  it("falls back to the first is_user_input node for the summary", () => {
    writeDatabase(dbPath, {
      nodes: [
        { sessionId: "s", nodeId: 1, role: "user", content: "wrapper", isUserInput: false },
        { sessionId: "s", nodeId: 2, role: "user", content: "real first", isUserInput: true },
      ],
    });
    const db = openDb();
    try {
      expect(parser.getFirstUserMessage(db, "s")).toBe("real first");
    } finally {
      db.close();
    }
  });

  it("falls back to the last is_user_input node for the working-on summary", () => {
    writeDatabase(dbPath, {
      nodes: [
        { sessionId: "s", nodeId: 1, role: "user", content: "first", isUserInput: true },
        { sessionId: "s", nodeId: 2, role: "user", content: "wrapper", isUserInput: false },
        { sessionId: "s", nodeId: 3, role: "user", content: "last real", isUserInput: true },
      ],
    });
    const db = openDb();
    try {
      expect(parser.getLastUserPrompt(db, "s")).toBe("last real");
      expect(parser.getLastUserPrompt(db, "missing")).toBe("");
    } finally {
      db.close();
    }
  });
});
