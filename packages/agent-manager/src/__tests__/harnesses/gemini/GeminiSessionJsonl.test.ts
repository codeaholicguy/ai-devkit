/**
 * Gemini CLI 0.46+ session logs (issue #278).
 *
 * Current Gemini CLI versions write `session-<timestamp>-<id>.jsonl`: line 1
 * is a metadata record, later lines are appended records that Gemini replays
 * on load:
 * - a message record (has a string `id`) upserts that message by id;
 * - `{"$set": {...}}` merges metadata, and a `$set.messages` array replaces
 *   every message;
 * - `{"$rewindTo": "<id>"}` drops that message and every later one.
 *
 * All fixtures are synthetic and only mirror those record shapes.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { GeminiCliAdapter } from "../../../harnesses/gemini/GeminiCliAdapter.js";
import { GeminiSessionLocator } from "../../../harnesses/gemini/GeminiSessionLocator.js";
import { GeminiSessionParser } from "../../../harnesses/gemini/GeminiSessionParser.js";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { AgentRegistry } from "../../../utils/AgentRegistry.js";

vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs");
  const wrapped = {
    ...actual,
    openSync: vi.fn(actual.openSync),
    readSync: vi.fn(actual.readSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
  return { ...wrapped, default: wrapped };
});

const PROJECT_ROOT = "/work/jsonl-project";
const T0 = "2026-09-01T10:00:00.000Z";
const T1 = "2026-09-01T10:01:00.000Z";
const T2 = "2026-09-01T10:02:00.000Z";
const T3 = "2026-09-01T10:03:00.000Z";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function toJsonl(records: unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

function metadataRecord(sessionId: string, projectRoot = PROJECT_ROOT) {
  return {
    sessionId,
    projectHash: sha256(projectRoot),
    startTime: T0,
    lastUpdated: T0,
    kind: "main",
  };
}

const userMessage = {
  id: "msg-user-1",
  timestamp: T0,
  type: "user",
  content: [{ text: "first synthetic prompt" }],
};
const infoMessage = { id: "msg-info-1", timestamp: T1, type: "info", content: "synthetic notice" };
const geminiDraft = { id: "msg-gemini-1", timestamp: T2, type: "gemini", content: "" };
const geminiFinal = {
  id: "msg-gemini-1",
  timestamp: T2,
  type: "gemini",
  content: "synthetic answer",
};
const secondUserMessage = {
  id: "msg-user-2",
  timestamp: T3,
  type: "user",
  content: [{ text: "second synthetic prompt" }],
};

/** Legacy single-document equivalent of {@link equivalentLog}. */
function legacyDocument(sessionId: string) {
  return {
    ...metadataRecord(sessionId),
    lastUpdated: T3,
    directories: [PROJECT_ROOT],
    messages: [userMessage, infoMessage, geminiFinal, secondUserMessage],
  };
}

function equivalentLog(sessionId: string): unknown[] {
  return [
    metadataRecord(sessionId),
    { $set: { directories: [PROJECT_ROOT] } },
    { $set: { messages: [userMessage], lastUpdated: T0 } },
    infoMessage,
    { $set: { lastUpdated: T1 } },
    geminiDraft,
    // Gemini re-appends a message when it updates it; it keeps its position.
    geminiFinal,
    { $set: { lastUpdated: T2 } },
    secondUserMessage,
    { $set: { lastUpdated: T3 } },
  ];
}

let fsActual: typeof import("fs");

describe("Gemini .jsonl session logs (#278)", () => {
  let tmpHome: string;
  let tmpDir: string;
  let chatsDir: string;

  beforeAll(async () => {
    fsActual = await vi.importActual<typeof import("fs")>("fs");
  });

  beforeEach(() => {
    tmpHome = fsActual.mkdtempSync(path.join(os.tmpdir(), "gemini-jsonl-test-"));
    tmpDir = path.join(tmpHome, ".gemini", "tmp");
    chatsDir = path.join(tmpDir, "jsonl-project", "chats");
    fsActual.mkdirSync(chatsDir, { recursive: true });
    fsActual.writeFileSync(path.join(tmpDir, "jsonl-project", ".project_root"), PROJECT_ROOT);
    vi.mocked(fs.openSync).mockClear();
    vi.mocked(fs.readSync).mockClear();
    vi.mocked(fs.readFileSync).mockClear();
  });

  afterEach(() => {
    fsActual.rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeLog(fileName: string, records: unknown[]): string {
    const filePath = path.join(chatsDir, fileName);
    fsActual.writeFileSync(filePath, toJsonl(records));
    return filePath;
  }

  function writeLegacy(fileName: string, body: unknown): string {
    const filePath = path.join(chatsDir, fileName);
    fsActual.writeFileSync(filePath, JSON.stringify(body, null, 2));
    return filePath;
  }

  function geminiProcess(pid: number, cwd = PROJECT_ROOT): ProcessInfo {
    return { pid, command: "node /usr/local/bin/gemini", cwd, tty: "ttys001" };
  }

  describe("GeminiSessionParser", () => {
    it("parses a .jsonl log into the same session as the equivalent .json document", () => {
      const jsonlPath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", equivalentLog("s-1"));
      const jsonPath = writeLegacy("session-2026-09-01T10-00-bbbb2222.json", legacyDocument("s-1"));
      const parser = new GeminiSessionParser();

      const fromLog = parser.parseSession(undefined, jsonlPath);
      const fromDocument = parser.parseSession(undefined, jsonPath);

      expect(fromLog).not.toBeNull();
      expect(fromLog).toEqual(fromDocument);
      expect(fromLog).toMatchObject({
        sessionId: "s-1",
        projectPath: PROJECT_ROOT,
        summary: "second synthetic prompt",
        lastMessageType: "user",
        sessionStart: new Date(T0),
        lastActive: new Date(T3),
      });
    });

    it("parses .jsonl content handed in directly the same way as from disk", () => {
      const jsonlPath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", equivalentLog("s-1"));
      const parser = new GeminiSessionParser();

      expect(parser.parseSession(toJsonl(equivalentLog("s-1")), jsonlPath)).toEqual(
        new GeminiSessionParser().parseSession(undefined, jsonlPath),
      );
    });

    it("returns the same conversation for both formats", () => {
      const jsonlPath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", equivalentLog("s-1"));
      const jsonPath = writeLegacy("session-2026-09-01T10-00-bbbb2222.json", legacyDocument("s-1"));
      const parser = new GeminiSessionParser();

      for (const verbose of [false, true]) {
        const fromLog = parser.getConversation(jsonlPath, { verbose });
        expect(fromLog).toEqual(parser.getConversation(jsonPath, { verbose }));
        expect(fromLog.length).toBeGreaterThan(0);
      }
      expect(parser.getConversation(jsonlPath)).toEqual([
        { role: "user", content: "first synthetic prompt", timestamp: T0 },
        { role: "assistant", content: "synthetic answer", timestamp: T2 },
        { role: "user", content: "second synthetic prompt", timestamp: T3 },
      ]);
    });

    it("returns the same session summary for both formats", () => {
      const jsonlPath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", equivalentLog("s-1"));
      const jsonPath = writeLegacy("session-2026-09-01T10-00-bbbb2222.json", legacyDocument("s-1"));
      const parser = new GeminiSessionParser();

      const fromLog = parser.fileToSessionSummary(jsonlPath);
      const fromDocument = parser.fileToSessionSummary(jsonPath);

      expect(fromLog).toEqual({ ...fromDocument, sessionFilePath: jsonlPath });
      expect(fromLog).toMatchObject({
        type: "gemini_cli",
        sessionId: "s-1",
        cwd: PROJECT_ROOT,
        firstUserMessage: "first synthetic prompt",
        startedAt: new Date(T0),
        lastActive: new Date(T3),
      });
    });

    it("ignores unknown operators, non-object lines and a torn trailing line", () => {
      const filePath = path.join(chatsDir, "session-2026-09-01T10-00-cccc3333.jsonl");
      fsActual.writeFileSync(
        filePath,
        [
          JSON.stringify(metadataRecord("s-unknown")),
          JSON.stringify({ $unset: { lastUpdated: true } }),
          JSON.stringify({ $push: { messages: { id: "ghost", type: "user", content: "x" } } }),
          JSON.stringify({ $set: "not-an-object" }),
          JSON.stringify(userMessage),
          "42",
          "null",
          '["array"]',
          "",
          JSON.stringify({ $set: { lastUpdated: T1 } }),
          '{"id":"msg-torn","type":"user","content":"never fini',
        ].join("\n"),
      );
      const parser = new GeminiSessionParser();

      expect(() => parser.parseSession(undefined, filePath)).not.toThrow();
      expect(parser.parseSession(undefined, filePath)).toMatchObject({
        sessionId: "s-unknown",
        summary: "first synthetic prompt",
        lastActive: new Date(T1),
      });
      expect(parser.getConversation(filePath)).toEqual([
        { role: "user", content: "first synthetic prompt", timestamp: T0 },
      ]);
    });

    it("applies $rewindTo by dropping the target message and everything after it", () => {
      const filePath = writeLog("session-2026-09-01T10-00-dddd4444.jsonl", [
        metadataRecord("s-rewind"),
        userMessage,
        geminiFinal,
        secondUserMessage,
        { $rewindTo: "msg-gemini-1" },
        { id: "msg-user-3", timestamp: T3, type: "user", content: "retried prompt" },
      ]);
      const parser = new GeminiSessionParser();

      expect(parser.getConversation(filePath).map((m) => m.content)).toEqual([
        "first synthetic prompt",
        "retried prompt",
      ]);
    });

    it("clears every message when $rewindTo names an unknown id", () => {
      const filePath = writeLog("session-2026-09-01T10-00-eeee5555.jsonl", [
        metadataRecord("s-rewind-all"),
        userMessage,
        { $rewindTo: "missing" },
      ]);

      expect(new GeminiSessionParser().getConversation(filePath)).toEqual([]);
    });

    it("returns null for a .jsonl log without session metadata", () => {
      const filePath = writeLog("session-2026-09-01T10-00-ffff6666.jsonl", [userMessage]);
      const parser = new GeminiSessionParser();

      expect(parser.parseSession(undefined, filePath)).toBeNull();
      expect(parser.fileToSessionSummary(filePath)).toBeNull();
    });
  });

  describe("GeminiSessionLocator", () => {
    it("discovers live .jsonl sessions alongside legacy .json sessions", () => {
      const jsonlPath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", equivalentLog("s-new"));
      const jsonPath = writeLegacy(
        "session-2026-08-01T10-00-bbbb2222.json",
        legacyDocument("s-old"),
      );
      const locator = new GeminiSessionLocator({ geminiTmpDir: tmpDir });

      const { sessions } = locator.discoverSessions([geminiProcess(1)]);

      expect(sessions.map((s) => [s.sessionId, s.filePath]).sort()).toEqual(
        [
          ["s-new", jsonlPath],
          ["s-old", jsonPath],
        ].sort(),
      );
      expect(sessions.every((s) => s.resolvedCwd === PROJECT_ROOT)).toBe(true);
    });

    it("reads .jsonl metadata from a bounded head of line 1", () => {
      const bulk = Array.from({ length: 400 }, (_, i) => ({
        id: `bulk-${i}`,
        timestamp: T1,
        type: "gemini",
        content: "x".repeat(1024),
      }));
      const filePath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", [
        metadataRecord("s-big"),
        ...bulk,
      ]);
      expect(fsActual.statSync(filePath).size).toBeGreaterThan(256 * 1024);
      const locator = new GeminiSessionLocator({ geminiTmpDir: tmpDir });

      const { sessions } = locator.discoverSessions([geminiProcess(1)]);

      expect(sessions.map((s) => s.sessionId)).toEqual(["s-big"]);
      expect(vi.mocked(fs.readFileSync).mock.calls.map((c) => String(c[0]))).not.toContain(
        filePath,
      );
      const bytesRead = vi
        .mocked(fs.readSync)
        .mock.results.reduce((sum, r) => sum + (r.value as number), 0);
      expect(bytesRead).toBeLessThanOrEqual(64 * 1024);
    });

    it("skips a .jsonl whose first line is not session metadata without a full read", () => {
      const filePath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", [
        userMessage,
        metadataRecord("s-late"),
      ]);
      const locator = new GeminiSessionLocator({ geminiTmpDir: tmpDir });

      expect(locator.discoverSessions([geminiProcess(1)]).sessions).toEqual([]);
      expect(vi.mocked(fs.readFileSync).mock.calls.map((c) => String(c[0]))).not.toContain(
        filePath,
      );
    });

    it("falls back to the file name for the session id when line 1 lacks one", () => {
      writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", [
        { projectHash: sha256(PROJECT_ROOT), startTime: T0 },
      ]);
      const locator = new GeminiSessionLocator({ geminiTmpDir: tmpDir });

      expect(locator.discoverSessions([geminiProcess(1)]).sessions.map((s) => s.sessionId)).toEqual(
        ["session-2026-09-01T10-00-aaaa1111"],
      );
    });

    it("prefers the .jsonl continuation over the legacy .json it was resumed from", () => {
      // Resuming a legacy session makes Gemini write `<name>.jsonl` next to it.
      writeLegacy("session-2026-08-01T10-00-resumed.json", legacyDocument("s-resumed"));
      const jsonlPath = writeLog(
        "session-2026-08-01T10-00-resumed.jsonl",
        equivalentLog("s-resumed"),
      );
      const locator = new GeminiSessionLocator({ geminiTmpDir: tmpDir });

      expect(locator.discoverSessions([geminiProcess(1)]).sessions.map((s) => s.filePath)).toEqual([
        jsonlPath,
      ]);
      expect(locator.discoverHistoricalSessionFiles()).toEqual([jsonlPath]);
    });

    it("lists .jsonl files as historical sessions", () => {
      const jsonlPath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", equivalentLog("s-new"));
      const jsonPath = writeLegacy(
        "session-2026-08-01T10-00-bbbb2222.json",
        legacyDocument("s-old"),
      );
      fsActual.writeFileSync(path.join(chatsDir, "session-notes.txt"), "ignored");

      const locator = new GeminiSessionLocator({ geminiTmpDir: tmpDir });

      expect(locator.discoverHistoricalSessionFiles().sort()).toEqual([jsonPath, jsonlPath].sort());
    });
  });

  describe("GeminiCliAdapter", () => {
    it("lists and finds .jsonl sessions by id", async () => {
      const jsonlPath = writeLog("session-2026-09-01T10-00-aaaa1111.jsonl", equivalentLog("s-new"));
      writeLegacy("session-2026-08-01T10-00-bbbb2222.json", legacyDocument("s-old"));
      const adapter = new GeminiCliAdapter(new AgentRegistry(path.join(tmpHome, "agents.json")), {
        geminiTmpDir: tmpDir,
      });

      const listed = await adapter.listSessions({ cwd: PROJECT_ROOT });
      expect(listed.map((s) => s.sessionId).sort()).toEqual(["s-new", "s-old"]);

      await expect(adapter.findSessionsById("s-new")).resolves.toEqual([
        expect.objectContaining({
          sessionId: "s-new",
          sessionFilePath: jsonlPath,
          firstUserMessage: "first synthetic prompt",
        }),
      ]);
    });
  });
});
