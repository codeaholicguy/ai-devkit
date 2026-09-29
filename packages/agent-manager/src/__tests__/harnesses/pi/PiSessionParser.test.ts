import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AgentStatus } from "../../../adapters/AgentAdapter.js";
import { PiSessionParser } from "../../../harnesses/pi/PiSessionParser.js";

describe("PiSessionParser", () => {
  let tmpDir: string;
  let parser: PiSessionParser;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-parser-test-"));
    parser = new PiSessionParser();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads session metadata, summary, timestamps, and status signal", () => {
    const filePath = writeJsonl("session.jsonl", [
      {
        type: "session_meta",
        timestamp: "2026-06-10T08:58:20.754Z",
        sessionId: "sess-101",
        cwd: "/repo/project-a",
      },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "implement Pi adapter" },
      { role: "assistant", timestamp: new Date().toISOString(), content: "working on it" },
    ]);

    const session = parser.readSession(filePath);

    expect(session).toMatchObject({
      sessionId: "sess-101",
      projectPath: "/repo/project-a",
      summary: "implement Pi adapter",
      lastRole: "assistant",
    });
    expect(session?.sessionStart.toISOString()).toBe("2026-06-10T08:58:20.754Z");
    expect(parser.determineStatus(session!)).toBe(AgentStatus.WAITING);
  });

  it("uses the filename session id fallback and reports running when the latest message is from the user", () => {
    const filePath = writeJsonl("plain-session.jsonl", [
      { role: "user", timestamp: new Date().toISOString(), content: "still working" },
    ]);

    const session = parser.readSession(filePath);

    expect(session).toMatchObject({
      sessionId: "plain-session",
      summary: "still working",
      lastRole: "user",
    });
    expect(parser.determineStatus(session!)).toBe(AgentStatus.RUNNING);
  });

  it("truncates long user prompts in detected session summaries", () => {
    const longPrompt = "x".repeat(140);
    const filePath = writeJsonl("session.jsonl", [
      {
        type: "session",
        timestamp: "2026-06-10T08:58:20.754Z",
        id: "sess-long",
        cwd: "/repo/project-long-summary",
      },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: longPrompt },
    ]);

    const session = parser.readSession(filePath);

    expect(session?.summary).toHaveLength(120);
    expect(session?.summary.endsWith("...")).toBe(true);
  });

  it("reads user and assistant conversation messages from JSONL", () => {
    const filePath = writeJsonl("conversation.jsonl", [
      { role: "system", timestamp: "2026-06-10T08:58:20.000Z", content: "hidden" },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "hello pi" },
      {
        type: "assistant",
        timestamp: "2026-06-10T08:58:22.000Z",
        message: { content: "hello human" },
      },
      "{not json",
    ]);

    expect(parser.getConversation(filePath)).toEqual([
      { role: "user", content: "hello pi", timestamp: "2026-06-10T08:58:21.000Z" },
      { role: "assistant", content: "hello human", timestamp: "2026-06-10T08:58:22.000Z" },
    ]);
  });

  it("includes system entries only in verbose conversation mode", () => {
    const filePath = writeJsonl("verbose.jsonl", [
      { role: "system", timestamp: "2026-06-10T08:58:20.000Z", content: "model changed" },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "visible" },
    ]);

    expect(parser.getConversation(filePath)).toEqual([
      { role: "user", content: "visible", timestamp: "2026-06-10T08:58:21.000Z" },
    ]);
    expect(parser.getConversation(filePath, { verbose: true })).toEqual([
      { role: "system", content: "model changed", timestamp: "2026-06-10T08:58:20.000Z" },
      { role: "user", content: "visible", timestamp: "2026-06-10T08:58:21.000Z" },
    ]);
  });

  it("reads real Pi message entries with nested role and text parts", () => {
    const filePath = writeJsonl("real.jsonl", [
      {
        type: "session",
        version: 3,
        id: "sess-real",
        timestamp: "2026-06-10T13:27:17.581Z",
        cwd: "/repo/project-real",
      },
      {
        type: "model_change",
        id: "model-1",
        timestamp: "2026-06-10T13:27:17.655Z",
        modelId: "claude-sonnet-4-6",
      },
      {
        type: "message",
        id: "msg-user",
        timestamp: "2026-06-10T13:27:37.975Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "hello" }],
          timestamp: 1781098057974,
        },
      },
      {
        type: "message",
        id: "msg-assistant",
        timestamp: "2026-06-10T13:27:40.161Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello! How can I help you today?" }],
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          timestamp: 1781098058012,
        },
      },
    ]);

    expect(parser.getConversation(filePath)).toEqual([
      { role: "user", content: "hello", timestamp: "2026-06-10T13:27:37.975Z" },
      {
        role: "assistant",
        content: "Hello! How can I help you today?",
        timestamp: "2026-06-10T13:27:40.161Z",
      },
    ]);
    expect(parser.readSession(filePath)).toMatchObject({
      sessionId: "sess-real",
      summary: "hello",
      lastActive: new Date("2026-06-10T13:27:40.161Z"),
    });
  });

  it("builds historical summaries from the first user message", () => {
    const filePath = writeJsonl("summary.jsonl", [
      { timestamp: "2026-06-10T08:58:20.754Z", sessionId: "sess-g", cwd: "/repo/project-g" },
      { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "first matching message" },
    ]);

    expect(parser.fileToSessionSummary(filePath)).toMatchObject({
      type: "pi",
      sessionId: "sess-g",
      cwd: "/repo/project-g",
      firstUserMessage: "first matching message",
      sessionFilePath: filePath,
    });
  });

  describe("readSessionIncremental", () => {
    const fixtures: Array<Array<Record<string, unknown> | string>> = [
      [
        { type: "session", id: "sess-a", timestamp: "2026-06-10T08:58:20.754Z", cwd: "/repo/a" },
        { role: "system", timestamp: "2026-06-10T08:58:21.000Z", content: "model changed" },
        { role: "user", timestamp: "2026-06-10T08:58:22.000Z", content: "first" },
        { role: "assistant", timestamp: "2026-06-10T08:58:23.000Z", content: "reply" },
        { role: "user", timestamp: "bad-date", content: "x".repeat(200) },
        { role: "system", content: "trailing system" },
      ],
      [{ role: "user", content: "no timestamps or id" }, "{not json", "[1,2]", "42"],
      [
        {
          payload: { sessionId: "nested", cwd: "/repo/nested", timestamp: "2026-06-10T08:00:00Z" },
        },
        { data: { role: "assistant", content: [{ type: "text", text: "nested reply" }] } },
      ],
      ["{not json", "   "],
    ];

    it.each(fixtures.map((entries, index) => [index, entries] as const))(
      "matches readSession for fixture %i",
      (_index, entries) => {
        const filePath = writeJsonl("equivalence.jsonl", entries);
        expect(parser.readSessionIncremental(filePath, "/fallback")).toEqual(
          parser.readSession(filePath, "/fallback"),
        );
      },
    );

    it("folds appended lines into the cached summary", () => {
      const filePath = writeJsonl("append.jsonl", [
        { type: "session", id: "sess-append", timestamp: "2026-06-10T08:58:20.754Z", cwd: "/r" },
        { role: "user", timestamp: "2026-06-10T08:58:21.000Z", content: "before" },
      ]);
      expect(parser.readSessionIncremental(filePath)?.summary).toBe("before");

      const next = { role: "user", timestamp: "2026-06-10T09:00:00.000Z", content: "after" };
      fs.appendFileSync(filePath, `\n${JSON.stringify(next)}\n`);

      const session = parser.readSessionIncremental(filePath);
      expect(session).toEqual(parser.readSession(filePath));
      expect(session).toMatchObject({ summary: "after", sessionId: "sess-append" });
    });
  });

  describe("readSessionHead", () => {
    it("stops reading once the header gives session id and cwd", () => {
      const filePath = writeJsonl("head.jsonl", [
        { type: "session", id: "sess-head", timestamp: "2026-06-10T08:58:20.754Z", cwd: "/repo/h" },
        ...Array.from({ length: 5000 }, (_, i) => ({ role: "assistant", content: `line ${i}` })),
      ]);

      const head = parser.readSessionHead(filePath);

      expect(head).toMatchObject({ sessionId: "sess-head", projectPath: "/repo/h" });
      expect(head?.complete).toBe(false);
      expect(head!.bytesRead).toBeLessThanOrEqual(4 * 1024);
    });

    it("never reads more than the byte cap", () => {
      const filePath = writeJsonl(
        "no-header.jsonl",
        Array.from({ length: 5000 }, (_, i) => ({ role: "assistant", content: `line ${i}` })),
      );
      expect(fs.statSync(filePath).size).toBeGreaterThan(64 * 1024);

      expect(parser.readSessionHead(filePath)).toEqual({ bytesRead: 64 * 1024, complete: false });
      expect(parser.readSessionHead(filePath, 1000)?.bytesRead).toBe(1000);
    });

    it("uses an unterminated last line only when it ends the file", () => {
      const whole = writeJsonl("whole.jsonl", [{ id: "sess-whole", cwd: "/repo/whole" }]);
      expect(parser.readSessionHead(whole)).toMatchObject({
        sessionId: "sess-whole",
        projectPath: "/repo/whole",
        complete: true,
      });

      const cut = writeJsonl("cut.jsonl", [
        { id: "sess-cut", cwd: "/repo/cut", pad: "y".repeat(50) },
      ]);
      expect(parser.readSessionHead(cut, 20)).toEqual({ bytesRead: 20, complete: false });
    });

    it("returns null for a missing file", () => {
      expect(parser.readSessionHead(path.join(tmpDir, "missing.jsonl"))).toBeNull();
    });
  });

  function writeJsonl(name: string, entries: Array<Record<string, unknown> | string>): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(
      filePath,
      entries
        .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
        .join("\n"),
    );
    return filePath;
  }
});
