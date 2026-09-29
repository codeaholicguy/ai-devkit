/**
 * Bounded cold start (#261) for the Pi, Grok, Copilot, Kiro and Antigravity
 * summary reducers (#279).
 *
 * Files are laid out as `[head fixture, neutral padding, tail fixture]` with
 * bounds that make each window cover exactly one fixture, so the middle is
 * skipped (`skippedBytes > 0`). "First" fields must come from the head only
 * and "latest" fields from the tail only; a first-* value that lies only in
 * the skipped middle falls back to the documented default instead of being
 * filled from the tail.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AntigravitySessionParser } from "../../harnesses/antigravity/AntigravitySessionParser.js";
import { CopilotSessionParser } from "../../harnesses/copilot/CopilotSessionParser.js";
import { GrokSessionParser } from "../../harnesses/grok/GrokSessionParser.js";
import { KiroSessionParser } from "../../harnesses/kiro/KiroSessionParser.js";
import { PiSessionParser } from "../../harnesses/pi/PiSessionParser.js";

const PAD_COUNT = 60;

function jsonl(entries: unknown[]): string {
  return entries.map((entry) => JSON.stringify(entry) + "\n").join("");
}

/**
 * Render `[head, padding, tail]` and bounds whose head window ends right
 * after `head` and whose tail window starts right at `tail`.
 */
function layout(head: unknown[], padLine: unknown, tail: unknown[]) {
  const headText = jsonl(head);
  const tailText = jsonl(tail);
  const padText = jsonl(Array.from({ length: PAD_COUNT }, () => padLine));
  const buffer = Buffer.from(headText + padText + tailText);
  const bounds = {
    headBytes: Math.max(Buffer.byteLength(headText), 1),
    tailBytes: Buffer.byteLength(tailText),
  };
  return { buffer, bounds };
}

let tmpDir: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounded-skip-"));
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Pi: bounded cold start", () => {
  const pad = { type: "custom", note: "x".repeat(60) };
  const header = {
    type: "session",
    id: "sess-pi",
    timestamp: "2026-06-10T08:00:00.000Z",
    cwd: "/repo/pi",
  };
  const msg = (id: string, role: string, ts: string, content: string) => ({
    type: "message",
    id,
    timestamp: ts,
    message: { role, content: [{ type: "text", text: content }] },
  });

  function write(head: unknown[], tail: unknown[]) {
    const { buffer, bounds } = layout(head, pad, tail);
    const filePath = path.join(tmpDir, "2026-06-10_sess-file.jsonl");
    fs.writeFileSync(filePath, buffer);
    const parser = new PiSessionParser({ summaryBounds: bounds });
    return { filePath, parser };
  }

  it("takes first fields from the head and latest fields from the tail", () => {
    const { filePath, parser } = write(
      [header, msg("m1", "user", "2026-06-10T08:00:01.000Z", "head prompt")],
      [
        msg("m8", "user", "2026-06-10T09:00:00.000Z", "tail prompt"),
        msg("m9", "assistant", "2026-06-10T09:00:01.000Z", "tail answer"),
      ],
    );

    const session = parser.readSessionIncremental(filePath);

    expect((parser as any).sessionCache.read(filePath).skippedBytes).toBeGreaterThan(0);
    expect(session).toEqual(new PiSessionParser().readSession(filePath));
    expect(session).toMatchObject({
      sessionId: "sess-pi",
      projectPath: "/repo/pi",
      sessionStart: new Date("2026-06-10T08:00:00.000Z"),
      lastActive: new Date("2026-06-10T09:00:01.000Z"),
      summary: "tail prompt",
      lastRole: "assistant",
    });
    expect((parser as any).sessionCache.read(filePath).state.firstUserMessage).toBe("head prompt");
  });

  it("clears latest fields that only appear before the tail window", () => {
    const { filePath, parser } = write(
      [header, msg("m1", "user", "2026-06-10T08:00:01.000Z", "head prompt")],
      [pad],
    );

    const session = parser.readSessionIncremental(filePath);

    expect(session).toMatchObject({
      sessionId: "sess-pi",
      projectPath: "/repo/pi",
      sessionStart: new Date("2026-06-10T08:00:00.000Z"),
      summary: "Pi session active",
      lastRole: undefined,
    });
    // No timestamp in the tail: last active falls back to the file mtime
    expect(session?.lastActive).toEqual(fs.statSync(filePath).mtime);
  });

  it("cap reached: first-* values only in the skipped middle are not filled from the tail", () => {
    // The session header is longer than the head window, so nothing identifies the session
    const bigHeader = { ...header, base: "y".repeat(400) };
    const pad2 = { type: "custom", note: "x".repeat(60) };
    const filePath = path.join(tmpDir, "2026-06-10_sess-file.jsonl");
    const tail = [
      msg("m9", "user", "2026-06-10T09:00:00.000Z", "tail prompt"),
      { ...msg("m10", "assistant", "2026-06-10T09:00:01.000Z", "ok"), cwd: "/elsewhere" },
    ];
    const tailText = jsonl(tail);
    fs.writeFileSync(
      filePath,
      jsonl([bigHeader, msg("m1", "user", "2026-06-10T08:00:01.000Z", "middle prompt")]) +
        jsonl(Array.from({ length: PAD_COUNT }, () => pad2)) +
        tailText,
    );
    const parser = new PiSessionParser({
      summaryBounds: { headBytes: 64, tailBytes: Buffer.byteLength(tailText) },
    });

    const result = (parser as any).sessionCache.read(filePath);
    const session = parser.readSessionIncremental(filePath, "/fallback");

    expect(result.skippedBytes).toBeGreaterThan(0);
    expect(new PiSessionParser().readSession(filePath)?.sessionId).toBe("sess-pi");
    expect(result.state.firstUserMessage).toBeUndefined();
    expect(session).toMatchObject({
      // filename id and fallback cwd, never the tail message's id or cwd
      sessionId: "sess-file",
      projectPath: "/fallback",
      // no head timestamp: session start falls back to the file's birthtime
      sessionStart: fs.statSync(filePath).birthtime,
      lastActive: new Date("2026-06-10T09:00:01.000Z"),
      summary: "tail prompt",
      lastRole: "assistant",
    });
  });
});

describe("Grok: bounded cold start", () => {
  const pad = { type: "system", content: "x".repeat(60) };
  const user = (text: string) => ({
    type: "user",
    content: [{ type: "text", text: `<user_query>\n${text}\n</user_query>` }],
  });
  const assistant = (text: string) => ({ type: "assistant", content: text });

  function write(head: unknown[], tail: unknown[]) {
    const { buffer, bounds } = layout(head, pad, tail);
    const sessionDir = path.join(tmpDir, "sess-grok");
    fs.mkdirSync(sessionDir, { recursive: true });
    const chatPath = path.join(sessionDir, "chat_history.jsonl");
    fs.writeFileSync(chatPath, buffer);
    const parser = new GrokSessionParser({ summaryBounds: bounds });
    return { sessionDir, chatPath, parser };
  }

  it("takes first fields from the head and latest fields from the tail", () => {
    const { sessionDir, chatPath, parser } = write(
      [user("head prompt"), assistant("head answer")],
      [user("tail prompt"), assistant("tail answer")],
    );

    const session = parser.readSessionIncremental(sessionDir, "/repo");

    expect((parser as any).sessionCache.read(chatPath).skippedBytes).toBeGreaterThan(0);
    expect(session).toEqual(new GrokSessionParser().readSession(sessionDir, "/repo"));
    expect(session).toMatchObject({
      firstUserMessage: "head prompt",
      lastUserMessage: "tail prompt",
      lastRole: "assistant",
    });
  });

  it("clears latest fields that only appear before the tail window", () => {
    const { sessionDir, parser } = write([user("head prompt"), assistant("head answer")], [pad]);

    expect(parser.readSessionIncremental(sessionDir, "/repo")).toMatchObject({
      firstUserMessage: "head prompt",
      lastUserMessage: undefined,
      lastRole: undefined,
    });
  });

  it("cap reached: a first user message only in the skipped middle stays undefined", () => {
    const sessionDir = path.join(tmpDir, "sess-grok");
    fs.mkdirSync(sessionDir, { recursive: true });
    const chatPath = path.join(sessionDir, "chat_history.jsonl");
    const head = [pad];
    const tail = [user("tail prompt"), assistant("tail answer")];
    const headText = jsonl(head);
    const tailText = jsonl(tail);
    fs.writeFileSync(
      chatPath,
      headText +
        jsonl([user("middle prompt")]) +
        jsonl(Array.from({ length: PAD_COUNT }, () => pad)) +
        tailText,
    );
    const parser = new GrokSessionParser({
      summaryBounds: {
        headBytes: Buffer.byteLength(headText),
        tailBytes: Buffer.byteLength(tailText),
      },
    });

    const session = parser.readSessionIncremental(sessionDir, "/repo");

    expect((parser as any).sessionCache.read(chatPath).skippedBytes).toBeGreaterThan(0);
    expect(new GrokSessionParser().readSession(sessionDir, "/repo")?.firstUserMessage).toBe(
      "middle prompt",
    );
    expect(session).toMatchObject({
      firstUserMessage: undefined,
      lastUserMessage: "tail prompt",
      lastRole: "assistant",
    });
  });
});

describe("Copilot: bounded cold start", () => {
  // No type and no timestamp: changes no summary field
  const pad = { data: { note: "x".repeat(60) } };
  const start = {
    type: "session.start",
    timestamp: "2026-06-10T08:00:00.000Z",
    data: {
      sessionId: "sess-copilot",
      startTime: "2026-06-10T08:00:00.000Z",
      context: { cwd: "/repo/copilot" },
    },
  };
  const event = (type: string, ts: string, content: string) => ({
    type,
    timestamp: ts,
    data: { content },
  });

  function write(head: unknown[], tail: unknown[]) {
    const { buffer, bounds } = layout(head, pad, tail);
    const sessionDir = path.join(tmpDir, "sess-copilot");
    fs.mkdirSync(sessionDir, { recursive: true });
    const eventsPath = path.join(sessionDir, "events.jsonl");
    fs.writeFileSync(eventsPath, buffer);
    const parser = new CopilotSessionParser({ summaryBounds: bounds });
    return { sessionDir, eventsPath, parser };
  }

  it("takes first fields from the head and latest fields from the tail", () => {
    const { sessionDir, eventsPath, parser } = write(
      [start, event("user.message", "2026-06-10T08:00:01.000Z", "head prompt")],
      [
        event("user.message", "2026-06-10T09:00:00.000Z", "tail prompt"),
        event("assistant.message", "2026-06-10T09:00:01.000Z", "tail answer"),
      ],
    );

    const session = parser.readSessionDirIncremental(sessionDir, "fallback");
    const result = (parser as any).eventCache.read(eventsPath);

    expect(result.skippedBytes).toBeGreaterThan(0);
    expect(session).toEqual(new CopilotSessionParser().readSessionDir(sessionDir, "fallback"));
    expect(session).toMatchObject({
      sessionId: "sess-copilot",
      projectPath: "/repo/copilot",
      sessionStart: new Date("2026-06-10T08:00:00.000Z"),
      lastActive: new Date("2026-06-10T09:00:01.000Z"),
      lastEventType: "assistant.message",
      firstUserMessage: "head prompt",
      summary: "head prompt",
    });
    expect(result.state.lastText).toBe("tail answer");
  });

  it("clears latest fields that only appear before the tail window", () => {
    const { sessionDir, eventsPath, parser } = write(
      [start, event("user.message", "2026-06-10T08:00:01.000Z", "head prompt")],
      [pad],
    );

    const session = parser.readSessionDirIncremental(sessionDir, "fallback");

    expect((parser as any).eventCache.read(eventsPath).state.lastText).toBe("");
    expect(session).toMatchObject({
      sessionId: "sess-copilot",
      projectPath: "/repo/copilot",
      sessionStart: new Date("2026-06-10T08:00:00.000Z"),
      lastEventType: undefined,
      firstUserMessage: "head prompt",
    });
    // No timestamp in the tail: last active falls back to the file mtime
    expect(session?.lastActive).toEqual(fs.statSync(eventsPath).mtime);
  });

  it("cap reached: a first user message only in the skipped middle is not filled from the tail", () => {
    const sessionDir = path.join(tmpDir, "sess-copilot");
    fs.mkdirSync(sessionDir, { recursive: true });
    const eventsPath = path.join(sessionDir, "events.jsonl");
    const headText = jsonl([start]);
    const tailText = jsonl([
      event("user.message", "2026-06-10T09:00:00.000Z", "tail prompt"),
      event("assistant.message", "2026-06-10T09:00:01.000Z", "tail answer"),
    ]);
    fs.writeFileSync(
      eventsPath,
      headText +
        jsonl([event("user.message", "2026-06-10T08:00:01.000Z", "middle prompt")]) +
        jsonl(Array.from({ length: PAD_COUNT }, () => pad)) +
        tailText,
    );
    const parser = new CopilotSessionParser({
      summaryBounds: {
        headBytes: Buffer.byteLength(headText),
        tailBytes: Buffer.byteLength(tailText),
      },
    });

    const session = parser.readSessionDirIncremental(sessionDir, "fallback");

    expect((parser as any).eventCache.read(eventsPath).skippedBytes).toBeGreaterThan(0);
    expect(
      new CopilotSessionParser().readSessionDir(sessionDir, "fallback")?.firstUserMessage,
    ).toBe("middle prompt");
    expect(session).toMatchObject({
      sessionId: "sess-copilot",
      firstUserMessage: "",
      // summary falls back to the latest user/assistant text from the tail
      summary: "tail answer",
      lastEventType: "assistant.message",
    });
  });

  it("a session.start in the tail still overrides the head's identity, as in a full scan", () => {
    const { sessionDir, parser } = write(
      [start],
      [
        {
          ...start,
          timestamp: "2026-06-10T09:00:00.000Z",
          data: { ...start.data, sessionId: "sess-resumed", startTime: "2026-06-10T09:00:00.000Z" },
        },
      ],
    );

    const session = parser.readSessionDirIncremental(sessionDir, "fallback");

    expect(session).toEqual(new CopilotSessionParser().readSessionDir(sessionDir, "fallback"));
    expect(session).toMatchObject({
      sessionId: "sess-resumed",
      sessionStart: new Date("2026-06-10T09:00:00.000Z"),
    });
  });
});

describe("Kiro: bounded cold start", () => {
  const pad = { kind: "Checkpoint", note: "x".repeat(60) };
  const prompt = (text: string, at: string) => ({
    kind: "Prompt",
    data: { content: [{ kind: "text", data: text }], meta: { timestamp: at } },
  });
  const reply = (text: string) => ({
    kind: "AssistantMessage",
    data: { content: [{ kind: "text", data: text }] },
  });

  function write(buffer: Buffer | string, bounds: { headBytes: number; tailBytes: number }) {
    const paths = {
      sessionId: "sess-kiro",
      transcriptPath: path.join(tmpDir, "sess-kiro.jsonl"),
      metadataPath: path.join(tmpDir, "sess-kiro.json"),
    };
    fs.writeFileSync(paths.transcriptPath, buffer);
    return { paths, parser: new KiroSessionParser({ summaryBounds: bounds }) };
  }

  it("takes first fields from the head and latest fields from the tail", () => {
    const { buffer, bounds } = layout(
      [prompt("head prompt", "2026-06-10T08:00:00.000Z"), reply("head answer")],
      pad,
      [prompt("tail prompt", "2026-06-10T09:00:00.000Z"), reply("tail answer")],
    );
    const { paths, parser } = write(buffer, bounds);

    const session = parser.readSessionIncremental(paths, "/repo");

    expect((parser as any).sessionCache.read(paths.transcriptPath).skippedBytes).toBeGreaterThan(0);
    expect(session).toEqual(new KiroSessionParser().readSession(paths, "/repo"));
    expect(session).toMatchObject({
      firstUserMessage: "head prompt",
      lastUserMessage: "tail prompt",
      sessionStart: new Date("2026-06-10T08:00:00.000Z"),
      lastActive: new Date("2026-06-10T09:00:00.000Z"),
      lastEventKind: "AssistantMessage",
    });
  });

  it("cap reached: a first prompt only in the skipped middle falls back to empty", () => {
    const head = jsonl([pad]);
    const tail = jsonl([prompt("tail prompt", "2026-06-10T09:00:00.000Z")]);
    const { paths, parser } = write(
      head +
        jsonl([prompt("middle prompt", "2026-06-10T08:30:00.000Z")]) +
        jsonl(Array.from({ length: PAD_COUNT }, () => pad)) +
        tail,
      { headBytes: Buffer.byteLength(head), tailBytes: Buffer.byteLength(tail) },
    );

    expect(new KiroSessionParser().readSession(paths, "/repo")?.firstUserMessage).toBe(
      "middle prompt",
    );
    expect(parser.readSessionIncremental(paths, "/repo")).toMatchObject({
      firstUserMessage: "",
      lastUserMessage: "tail prompt",
    });
  });
});

describe("Antigravity: bounded cold start", () => {
  const pad = { type: "CHECKPOINT", note: "x".repeat(60) };
  const request = (text: string, at: string) => ({
    type: "USER_INPUT",
    created_at: at,
    content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>`,
  });
  const reply = (text: string, at: string) => ({
    type: "PLANNER_RESPONSE",
    created_at: at,
    content: text,
  });
  const filePath = () => path.join(tmpDir, "transcript.jsonl");

  it("takes first fields from the head and latest fields from the tail", () => {
    const { buffer, bounds } = layout(
      [
        request("head prompt", "2026-06-10T08:00:00Z"),
        reply("head answer", "2026-06-10T08:01:00Z"),
      ],
      pad,
      [
        request("tail prompt", "2026-06-10T09:00:00Z"),
        reply("tail answer", "2026-06-10T09:01:00Z"),
      ],
    );
    fs.writeFileSync(filePath(), buffer);
    const parser = new AntigravitySessionParser({ summaryBounds: bounds });

    const session = parser.readSessionIncremental("conv", filePath(), "/repo");

    expect((parser as any).sessionCache.read(filePath()).skippedBytes).toBeGreaterThan(0);
    expect(session).toEqual(
      new AntigravitySessionParser().readSession("conv", filePath(), "/repo"),
    );
    expect(session).toMatchObject({
      firstUserMessage: "head prompt",
      lastUserMessage: "tail prompt",
      lastRole: "assistant",
      lastActive: new Date("2026-06-10T09:01:00Z"),
    });
  });

  it("falls back to the file mtime when the tail window has no timestamp", () => {
    const { buffer, bounds } = layout([request("head prompt", "2026-06-10T08:00:00Z")], pad, [pad]);
    fs.writeFileSync(filePath(), buffer);
    const parser = new AntigravitySessionParser({ summaryBounds: bounds });

    expect(parser.readSessionIncremental("conv", filePath(), "/repo")).toMatchObject({
      firstUserMessage: "head prompt",
      lastUserMessage: undefined,
      lastRole: undefined,
      lastActive: fs.statSync(filePath()).mtime,
    });
  });
});
