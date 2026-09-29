/**
 * Equivalence between the incremental session summaries used on refresh and
 * the full-file parse of Claude, Codex, Kiro and Antigravity transcripts.
 *
 * `legacyClaudeReadSession` / `legacyCodexReadSession` are verbatim copies of
 * the pre-incremental `readSession` algorithms, kept here as an oracle. Kiro
 * and Antigravity are checked against their own full `readSession`.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AntigravitySessionParser } from "../../harnesses/antigravity/AntigravitySessionParser.js";
import { ClaudeSessionParser } from "../../harnesses/claude/ClaudeSessionParser.js";
import { CodexSessionParser } from "../../harnesses/codex/CodexSessionParser.js";
import { KiroSessionParser } from "../../harnesses/kiro/KiroSessionParser.js";
import { parseTimestamp, truncate } from "../../harnesses/shared.js";

const CONVERSATION_ENTRY_TYPES = new Set(["user", "assistant", "system", "progress", "thinking"]);

function legacyClaudeReadSession(
  parser: ClaudeSessionParser,
  filePath: string,
  projectPath: string,
) {
  const p = parser as any;
  const sessionId = path.basename(filePath, ".jsonl");
  const content = fs.readFileSync(filePath, "utf-8");
  const allLines = content.trim().split("\n");

  let sessionStart: Date | null = null;
  try {
    const firstEntry = JSON.parse(allLines[0]);
    const rawTs: string | undefined = firstEntry.timestamp || firstEntry.snapshot?.timestamp;
    if (rawTs && !Number.isNaN(new Date(rawTs).getTime())) sessionStart = new Date(rawTs);
  } catch {
    /* malformed first line */
  }

  let lastEntryType: string | undefined;
  let lastActive: Date | undefined;
  let lastCwd: string | undefined;
  let isInterrupted = false;
  let lastUserMessage: string | undefined;
  let firstUserMessage: string | undefined;

  for (const line of allLines) {
    try {
      const entry = JSON.parse(line);
      if (entry.timestamp) {
        const ts = new Date(entry.timestamp);
        if (!Number.isNaN(ts.getTime())) lastActive = ts;
      }
      if (typeof entry.cwd === "string" && entry.cwd.trim().length > 0) lastCwd = entry.cwd;
      if (entry.type && CONVERSATION_ENTRY_TYPES.has(entry.type)) {
        lastEntryType = entry.type;
        if (entry.type === "user") {
          const msgContent = entry.message?.content;
          isInterrupted =
            Array.isArray(msgContent) &&
            msgContent.some(
              (c: any) =>
                (c.type === "text" && c.text?.includes("[Request interrupted")) ||
                (c.type === "tool_result" && c.content?.includes("[Request interrupted")),
            );
          const text = p.extractUserMessageText(msgContent);
          if (text) {
            lastUserMessage = text;
            if (!firstUserMessage) firstUserMessage = text;
          }
        } else {
          isInterrupted = false;
        }
      }
    } catch {
      continue;
    }
  }

  return {
    sessionId,
    projectPath: projectPath || lastCwd || "",
    lastCwd,
    sessionStart: sessionStart || lastActive || new Date(),
    lastActive: lastActive || new Date(),
    lastEntryType,
    isInterrupted,
    lastUserMessage,
    firstUserMessage,
  };
}

function legacyCodexReadSession(parser: CodexSessionParser, filePath: string) {
  const p = parser as any;
  const content = fs.readFileSync(filePath, "utf-8");
  const allLines = content.trim().split("\n");
  if (!allLines[0]) return null;

  let metaEntry: any;
  try {
    metaEntry = JSON.parse(allLines[0]);
  } catch {
    return null;
  }
  if (metaEntry?.type !== "session_meta" || !metaEntry.payload?.id) return null;

  const entries: any[] = [];
  for (const line of allLines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  let lastEntry: any;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i] && typeof entries[i].type === "string") {
      lastEntry = entries[i];
      break;
    }
  }
  let summary = "Codex session active";
  for (let i = entries.length - 1; i >= 0; i--) {
    const message = p.extractEntryText(entries[i]);
    if (message) {
      summary = truncate(message, 120);
      break;
    }
  }

  const lastActive =
    parseTimestamp(lastEntry?.timestamp) ||
    parseTimestamp(metaEntry.payload.timestamp) ||
    fs.statSync(filePath).mtime;
  const sessionStart = parseTimestamp(metaEntry.payload.timestamp) || lastActive;

  return {
    sessionId: metaEntry.payload.id,
    projectPath: metaEntry.payload.cwd || "",
    summary,
    sessionStart,
    lastActive,
    lastPayloadType: lastEntry ? p.normalizedPayloadType(lastEntry) : undefined,
  };
}

const text = (value: string) => [{ type: "text", text: value }];

/** Synthetic transcripts covering the shapes used by the existing Claude fixtures. */
const claudeFixtures: Record<string, unknown[]> = {
  basic: [
    {
      type: "user",
      timestamp: "2026-03-10T10:00:00Z",
      cwd: "/my/project",
      message: { content: "hello" },
    },
    { type: "assistant", timestamp: "2026-03-10T10:01:00Z", message: { content: text("hi") } },
  ],
  interrupted: [
    { type: "assistant", timestamp: "2026-03-10T10:00:00Z" },
    {
      type: "user",
      timestamp: "2026-03-10T10:01:00Z",
      message: { content: text("[Request interrupted by user for tool use]") },
    },
  ],
  interruptedToolResult: [
    {
      type: "user",
      timestamp: "2026-03-10T10:00:00Z",
      message: { content: [{ type: "tool_result", content: "[Request interrupted by user]" }] },
    },
  ],
  metadataTail: [
    { type: "user", timestamp: "2026-03-10T10:00:00Z", message: { content: text("question") } },
    { type: "assistant", timestamp: "2026-03-10T10:01:00Z" },
    { type: "last-prompt", timestamp: "2026-03-10T10:02:00Z" },
    { type: "file-history-snapshot", timestamp: "2026-03-10T10:03:00Z" },
  ],
  snapshotFirst: [
    { type: "file-history-snapshot", snapshot: { timestamp: "2026-03-10T09:59:00Z" } },
    {
      type: "user",
      timestamp: "2026-03-10T10:00:00Z",
      cwd: "/repo",
      message: { content: "start" },
    },
    { type: "assistant", timestamp: "2026-03-10T10:01:00Z" },
  ],
  multipleUsers: [
    {
      type: "user",
      timestamp: "2026-03-10T10:00:00Z",
      message: { content: text("first question") },
    },
    { type: "assistant", timestamp: "2026-03-10T10:01:00Z" },
    {
      type: "user",
      timestamp: "2026-03-10T10:02:00Z",
      message: { content: text("second question") },
    },
    { type: "assistant", timestamp: "2026-03-10T10:03:00Z" },
  ],
  commandsAndSkills: [
    {
      type: "user",
      timestamp: "2026-03-10T10:00:00Z",
      message: {
        content:
          "<command-message>review</command-message><command-name>/review</command-name><command-args>src</command-args>",
      },
    },
    {
      type: "user",
      timestamp: "2026-03-10T10:01:00Z",
      message: {
        content: text("Base directory for this skill: /skills/x\n\nARGUMENTS: do the thing"),
      },
    },
    { type: "user", timestamp: "2026-03-10T10:02:00Z", message: { content: "Tool loaded." } },
    {
      type: "user",
      timestamp: "2026-03-10T10:03:00Z",
      message: { content: "This session is being continued from a previous one" },
    },
  ],
  uiStateTail: [
    { type: "user", timestamp: "2026-05-30T06:17:57.189Z", message: { content: "hello" } },
    {
      type: "attachment",
      timestamp: "2026-05-30T06:17:57.200Z",
      attachment: { type: "task_reminder", content: [] },
    },
    { type: "permission-mode", timestamp: "2026-05-30T06:17:57.210Z", permissionMode: "default" },
    { type: "ai-title", timestamp: "2026-05-30T06:17:57.220Z" },
  ],
  progressAndSystem: [
    { type: "user", timestamp: "2026-03-10T10:00:00Z", message: { content: "go" } },
    { type: "progress", timestamp: "2026-03-10T10:00:01Z" },
    { type: "thinking", timestamp: "2026-03-10T10:00:02Z" },
    { type: "system", timestamp: "2026-03-10T10:00:03Z", cwd: "  " },
  ],
  noTimestamps: [{ type: "assistant" }, { type: "user", message: { content: "no time" } }],
  invalidTimestamp: [
    { type: "user", timestamp: "not-a-date", message: { content: "bad time" } },
    { type: "assistant", timestamp: "2026-03-10T10:01:00Z" },
  ],
  cwdChanges: [
    { type: "user", timestamp: "2026-03-10T10:00:00Z", cwd: "/a" },
    { type: "assistant", timestamp: "2026-03-10T10:01:00Z", cwd: "/b" },
  ],
  empty: [],
};

/** Synthetic transcripts covering the shapes used by the existing Codex fixtures. */
const codexFixtures: Record<string, unknown[]> = {
  legacyEvents: [
    {
      type: "session_meta",
      payload: { id: "sess-1", timestamp: "2026-03-18T15:00:00Z", cwd: "/repo" },
    },
    {
      type: "event",
      timestamp: "2026-03-18T15:01:00Z",
      payload: { type: "agent_reasoning", message: "Working on feature" },
    },
  ],
  responseItems: [
    {
      type: "session_meta",
      payload: { id: "sess-2", cwd: "/repo", timestamp: "2026-03-27T10:00:00Z" },
    },
    {
      type: "response_item",
      timestamp: "2026-03-27T10:00:01Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Fix the bug" }],
      },
    },
    {
      type: "event_msg",
      timestamp: "2026-03-27T10:00:02Z",
      payload: { type: "user_message", message: "Fix the bug" },
    },
    {
      type: "response_item",
      timestamp: "2026-03-27T10:00:03Z",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Done. ".repeat(40) }],
      },
    },
    { type: "event_msg", timestamp: "2026-03-27T10:00:04Z", payload: { type: "token_count" } },
  ],
  itemCompleted: [
    { type: "session_meta", payload: { id: "sess-3", cwd: "/repo" } },
    {
      type: "event_msg",
      timestamp: "2026-03-27T10:00:01Z",
      payload: { type: "item_completed", item: { type: "UserMessage", content: "hello" } },
    },
    {
      type: "event_msg",
      timestamp: "2026-03-27T10:00:02Z",
      payload: {
        type: "item_completed",
        item: { type: "AgentMessage", content: [{ type: "text", text: "answer" }] },
      },
    },
    { type: "event_msg", payload: { type: "item_completed", item: { type: "Reasoning" } } },
  ],
  turnAborted: [
    { type: "session_meta", payload: { id: "sess-4", timestamp: "2026-03-18T15:00:00Z" } },
    {
      type: "event_msg",
      timestamp: "2026-03-18T15:01:00Z",
      payload: { type: "task_complete", message: "finished" },
    },
    { type: "event_msg", timestamp: "2026-03-18T15:02:00Z", payload: { type: "turn_aborted" } },
  ],
  untypedTail: [
    { type: "session_meta", payload: { id: "sess-5", timestamp: "2026-03-18T15:00:00Z" } },
    {
      type: "event",
      timestamp: "2026-03-18T15:01:00Z",
      payload: { type: "agent_message", message: "hi" },
    },
    { payload: { message: "untyped trailing line" } },
  ],
  metaOnlyNoTimestamp: [{ type: "session_meta", payload: { id: "sess-6" } }],
  notSessionMeta: [{ type: "event", payload: {} }],
  metaWithoutId: [{ type: "session_meta", payload: { cwd: "/repo" } }],
  empty: [],
};

const kiroText = (value: string) => [{ kind: "text", data: value }];
const kiroFixtures: Record<string, unknown[]> = {
  promptAndReply: [
    { kind: "Prompt", data: { content: kiroText("first"), meta: { timestamp: 1781098057 } } },
    {
      kind: "AssistantMessage",
      timestamp: "2026-06-10T13:28:00Z",
      data: { content: kiroText("ok") },
    },
    { kind: "Prompt", data: { content: kiroText("second"), meta: { timestamp: 1781098200 } } },
  ],
  toolUseLast: [
    { kind: "Prompt", data: { content: kiroText("read it"), meta: { timestamp: 1781098057 } } },
    {
      kind: "AssistantMessage",
      data: { content: [{ kind: "toolUse", data: { name: "fs_read", input: { path: "a" } } }] },
    },
    { kind: "ToolResults", data: { content: [{ kind: "toolResult", data: { result: "x" } }] } },
  ],
  untimedWithNonObjects: [
    { kind: "Prompt", data: { content: kiroText("no clock") } },
    null,
    [1, 2],
    "a string",
    { kind: "AssistantMessage", data: { content: kiroText("reply") } },
  ],
};

const agyFixtures: Record<string, unknown[]> = {
  requestAndReply: [
    {
      type: "USER_INPUT",
      created_at: "2026-09-28T10:00:00Z",
      content: "<USER_REQUEST>\nfirst\n</USER_REQUEST>",
    },
    { type: "RUN_COMMAND", created_at: "2026-09-28T10:00:05Z", content: "ls" },
    { type: "PLANNER_RESPONSE", created_at: "2026-09-28T10:00:09Z", content: "done" },
    { type: "USER_INPUT", created_at: "2026-09-28T10:01:00Z", content: [{ text: "second" }] },
  ],
  outOfOrderTimestamps: [
    { type: "USER_INPUT", created_at: "2026-09-28T10:05:00Z", content: "late" },
    { type: "PLANNER_RESPONSE", created_at: "2026-09-28T10:01:00Z", content: "early" },
  ],
  untimedWithNonObjects: [
    { type: "USER_INPUT", content: "   " },
    null,
    { type: "USER_INPUT", content: "<USER_REQUEST></USER_REQUEST>" },
    "a string",
    { type: "PLANNER_RESPONSE", content: "reply" },
  ],
};

type Fixture = { name: string; lines: string[]; trailingNewline: boolean };

function variants(fixtures: Record<string, unknown[]>): Fixture[] {
  const out: Fixture[] = [];
  for (const [name, entries] of Object.entries(fixtures)) {
    const lines = entries.map((entry) => JSON.stringify(entry));
    out.push({ name, lines, trailingNewline: true });
    out.push({ name: `${name} (no trailing newline)`, lines, trailingNewline: false });
    if (lines.length > 1) {
      const noisy = [...lines];
      noisy.splice(1, 0, "{not json", "", "   ");
      out.push({ name: `${name} (malformed + blank lines)`, lines: noisy, trailingNewline: true });
    }
  }
  return out;
}

function render(fixture: Fixture): Buffer {
  return Buffer.from(fixture.lines.join("\n") + (fixture.trailingNewline ? "\n" : ""));
}

/** Byte offsets to split an append at: every line boundary plus mid-line offsets. */
function splitPoints(buffer: Buffer): number[] {
  const points = new Set<number>([0, buffer.length]);
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x0a) {
      points.add(i);
      points.add(i + 1);
    }
  }
  for (let i = 1; i < 8; i++) points.add(Math.floor((buffer.length * i) / 8));
  return [...points].sort((a, b) => a - b);
}

describe("incremental session summaries match the full-file parse", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "summary-equivalence-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each(variants(claudeFixtures))("Claude: $name", (fixture) => {
    const buffer = render(fixture);
    const filePath = path.join(tmpDir, "11111111-2222-3333-4444-555555555555.jsonl");

    fs.writeFileSync(filePath, buffer);
    const oracle = legacyClaudeReadSession(new ClaudeSessionParser(), filePath, "");
    expect(new ClaudeSessionParser().readSession(filePath, "")).toEqual(oracle);

    for (const split of splitPoints(buffer)) {
      const parser = new ClaudeSessionParser();
      fs.writeFileSync(filePath, buffer.subarray(0, split));
      parser.readSessionIncremental(filePath, "");
      fs.appendFileSync(filePath, buffer.subarray(split));
      expect(parser.readSessionIncremental(filePath, ""), `split at ${split}`).toEqual(oracle);
      expect(parser.readSessionIncremental(filePath, "")).toEqual(oracle);
    }
  });

  it.each(variants(codexFixtures))("Codex: $name", (fixture) => {
    const buffer = render(fixture);
    const filePath = path.join(tmpDir, "rollout.jsonl");

    fs.writeFileSync(filePath, buffer);
    const oracle = legacyCodexReadSession(new CodexSessionParser(), filePath);
    expect(new CodexSessionParser().readSession(filePath)).toEqual(oracle);

    for (const split of splitPoints(buffer)) {
      const parser = new CodexSessionParser();
      fs.writeFileSync(filePath, buffer.subarray(0, split));
      parser.readSessionIncremental(filePath);
      fs.appendFileSync(filePath, buffer.subarray(split));
      const expected = legacyCodexReadSession(parser, filePath);
      expect(parser.readSessionIncremental(filePath), `split at ${split}`).toEqual(expected);
      expect(parser.readSessionIncremental(filePath)).toEqual(expected);
    }
  });

  it.each(variants(kiroFixtures))("Kiro: $name", (fixture) => {
    const buffer = render(fixture);
    const paths = {
      sessionId: "kiro-session",
      transcriptPath: path.join(tmpDir, "kiro-session.jsonl"),
      metadataPath: path.join(tmpDir, "kiro-session.json"),
    };

    for (const split of splitPoints(buffer)) {
      const parser = new KiroSessionParser();
      fs.writeFileSync(paths.transcriptPath, buffer.subarray(0, split));
      parser.readSessionIncremental(paths, "/repo");
      fs.appendFileSync(paths.transcriptPath, buffer.subarray(split));
      const expected = new KiroSessionParser().readSession(paths, "/repo");
      expect(parser.readSessionIncremental(paths, "/repo"), `split at ${split}`).toEqual(expected);
      expect(parser.readSessionIncremental(paths, "/repo")).toEqual(expected);
    }
  });

  it.each(variants(agyFixtures))("Antigravity: $name", (fixture) => {
    const buffer = render(fixture);
    const filePath = path.join(tmpDir, "transcript.jsonl");
    const read = (parser: AntigravitySessionParser, incremental: boolean) =>
      incremental
        ? parser.readSessionIncremental("conv", filePath, "/repo")
        : parser.readSession("conv", filePath, "/repo");

    for (const split of splitPoints(buffer)) {
      const parser = new AntigravitySessionParser();
      fs.writeFileSync(filePath, buffer.subarray(0, split));
      read(parser, true);
      fs.appendFileSync(filePath, buffer.subarray(split));
      const expected = read(new AntigravitySessionParser(), false);
      expect(read(parser, true), `split at ${split}`).toEqual(expected);
      expect(read(parser, true)).toEqual(expected);
    }
  });
});

/**
 * Bounded cold start: `[fixture, neutral padding, fixture]` is larger than the
 * head + tail windows, each window covers one full copy of the fixture, and
 * the padding never changes a summary field. The bounded summary (which skips
 * the middle) must therefore equal the full-file parse.
 */
describe("bounded cold-start summaries match the full-file parse", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounded-equivalence-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function mirrored(fixture: Fixture, padLine: string) {
    const window = Buffer.byteLength(fixture.lines.join("\n") + "\n") + 16;
    const padCount = Math.ceil((2 * window) / padLine.length) + 4;
    const padding = Array.from({ length: padCount }, () => padLine);
    const buffer = render({ ...fixture, lines: [...fixture.lines, ...padding, ...fixture.lines] });
    expect(buffer.length).toBeGreaterThan(2 * window);
    return { buffer, bounds: { headBytes: window, tailBytes: window } };
  }

  it.each(variants(claudeFixtures))("Claude: $name", (fixture) => {
    const { buffer, bounds } = mirrored(fixture, JSON.stringify({ type: "attachment" }));
    const filePath = path.join(tmpDir, "11111111-2222-3333-4444-555555555555.jsonl");
    fs.writeFileSync(filePath, buffer);

    const parser = new ClaudeSessionParser({ summaryBounds: bounds });
    const oracle = legacyClaudeReadSession(parser, filePath, "");

    expect(parser.readSessionIncremental(filePath, "")).toEqual(oracle);
    expect((parser as any).sessionCache.read(filePath).skippedBytes).toBeGreaterThan(0);
  });

  it.each(variants(codexFixtures))("Codex: $name", (fixture) => {
    const { buffer, bounds } = mirrored(fixture, JSON.stringify({ payload: {} }));
    const filePath = path.join(tmpDir, "rollout.jsonl");
    fs.writeFileSync(filePath, buffer);

    const parser = new CodexSessionParser({ summaryBounds: bounds });
    const oracle = legacyCodexReadSession(parser, filePath);

    expect(parser.readSessionIncremental(filePath)).toEqual(oracle);
    expect((parser as any).sessionCache.read(filePath).skippedBytes).toBeGreaterThan(0);
  });

  it.each(variants(kiroFixtures))("Kiro: $name", (fixture) => {
    const { buffer, bounds } = mirrored(fixture, JSON.stringify({ kind: "Checkpoint" }));
    const paths = {
      sessionId: "kiro-session",
      transcriptPath: path.join(tmpDir, "kiro-session.jsonl"),
      metadataPath: path.join(tmpDir, "kiro-session.json"),
    };
    fs.writeFileSync(paths.transcriptPath, buffer);

    const parser = new KiroSessionParser({ summaryBounds: bounds });

    expect(parser.readSessionIncremental(paths, "/repo")).toEqual(
      new KiroSessionParser().readSession(paths, "/repo"),
    );
    expect((parser as any).sessionCache.read(paths.transcriptPath).skippedBytes).toBeGreaterThan(0);
  });

  it.each(variants(agyFixtures))("Antigravity: $name", (fixture) => {
    const { buffer, bounds } = mirrored(fixture, JSON.stringify({ type: "CHECKPOINT" }));
    const filePath = path.join(tmpDir, "transcript.jsonl");
    fs.writeFileSync(filePath, buffer);

    const parser = new AntigravitySessionParser({ summaryBounds: bounds });

    expect(parser.readSessionIncremental("conv", filePath, "/repo")).toEqual(
      new AntigravitySessionParser().readSession("conv", filePath, "/repo"),
    );
    expect((parser as any).sessionCache.read(filePath).skippedBytes).toBeGreaterThan(0);
  });
});

/**
 * Documented fallbacks when an entry lies only in the skipped middle of a
 * bounded cold start: the field stays undefined (or its existing default); it
 * is never filled from a later entry and never by a full scan.
 */
describe("bounded cold start: cap-reached fallbacks", () => {
  const bounds = { headBytes: 256, tailBytes: 256 };
  const filler = (n: number, entry: unknown) =>
    Array.from({ length: n }, () => JSON.stringify(entry));
  const claudeFile = "11111111-2222-3333-4444-555555555555.jsonl";
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounded-fallback-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(name: string, entries: unknown[]): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    return filePath;
  }

  it("Claude: a first user message beyond the head cap stays undefined", () => {
    const pad = filler(20, { type: "attachment", note: "x".repeat(40) }).map((l) => JSON.parse(l));
    const filePath = write(claudeFile, [
      { type: "file-history-snapshot", snapshot: { timestamp: "2026-03-10T09:00:00Z" } },
      ...pad,
      { type: "user", timestamp: "2026-03-10T10:00:00Z", message: { content: "first" } },
      ...pad,
      { type: "user", timestamp: "2026-03-10T11:00:00Z", message: { content: "latest" } },
      { type: "assistant", timestamp: "2026-03-10T11:01:00Z", cwd: "/repo" },
    ]);

    const session = new ClaudeSessionParser({ summaryBounds: bounds }).readSessionIncremental(
      filePath,
      "",
    );

    expect(new ClaudeSessionParser().readSession(filePath, "")?.firstUserMessage).toBe("first");
    expect(session).toMatchObject({
      firstUserMessage: undefined,
      lastUserMessage: "latest",
      sessionStart: new Date("2026-03-10T09:00:00Z"),
      lastActive: new Date("2026-03-10T11:01:00Z"),
      lastEntryType: "assistant",
      lastCwd: "/repo",
    });
  });

  it("Claude: latest fields before the tail window stay undefined", () => {
    const pad = filler(40, { type: "attachment", note: "x".repeat(40) }).map((l) => JSON.parse(l));
    const filePath = write(claudeFile, [
      {
        type: "user",
        timestamp: "2026-03-10T10:00:00Z",
        cwd: "/repo",
        message: { content: "only" },
      },
      ...pad,
    ]);

    const session = new ClaudeSessionParser({ summaryBounds: bounds }).readSessionIncremental(
      filePath,
      "",
    );

    // The head still supplies the session start and the first user message
    expect(session).toMatchObject({
      firstUserMessage: "only",
      lastUserMessage: undefined,
      lastEntryType: undefined,
      lastCwd: undefined,
      isInterrupted: false,
      sessionStart: new Date("2026-03-10T10:00:00Z"),
    });
  });

  it("Codex: keeps session_meta from the head and defaults fields missing from the tail", () => {
    const pad = filler(40, { payload: { note: "x".repeat(40) } }).map((l) => JSON.parse(l));
    const filePath = write("rollout.jsonl", [
      {
        type: "session_meta",
        payload: { id: "sess-1", cwd: "/repo", timestamp: "2026-03-18T15:00:00Z" },
      },
      {
        type: "event_msg",
        timestamp: "2026-03-18T15:01:00Z",
        payload: { type: "agent_message", message: "early" },
      },
      ...pad,
    ]);

    const session = new CodexSessionParser({ summaryBounds: bounds }).readSessionIncremental(
      filePath,
    );

    expect(session).toMatchObject({
      sessionId: "sess-1",
      projectPath: "/repo",
      summary: "Codex session active",
      lastPayloadType: undefined,
      sessionStart: new Date("2026-03-18T15:00:00Z"),
      lastActive: new Date("2026-03-18T15:00:00Z"),
    });
  });

  it("Codex: a session_meta line longer than the head cap yields no session", () => {
    const pad = filler(40, {
      type: "event_msg",
      payload: { type: "agent_message", message: "hi" },
    });
    const filePath = write("rollout.jsonl", [
      { type: "session_meta", payload: { id: "sess-1", base: "x".repeat(400) } },
      ...pad.map((l) => JSON.parse(l)),
    ]);

    expect(
      new CodexSessionParser({ summaryBounds: bounds }).readSessionIncremental(filePath),
    ).toBeNull();
  });
});
