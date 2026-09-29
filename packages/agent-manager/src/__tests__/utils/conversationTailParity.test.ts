/**
 * Parity between `getConversation(path, { tail })` (backward/incremental
 * JSONL read) and the last N messages of a full parse, for every JSONL-based
 * adapter. Fixtures are synthetic and built from the entry shapes used in each
 * adapter's own tests (including verbose-only records, noise, malformed lines
 * and mirrored Codex events), repeated until the file spans more than two 64 KiB
 * chunks.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationMessage, ConversationOptions } from "../../adapters/AgentAdapter.js";
import { AntigravityCliAdapter } from "../../harnesses/antigravity/AntigravityCliAdapter.js";
import { KiroAdapter } from "../../harnesses/kiro/KiroAdapter.js";
import { ClaudeSessionParser } from "../../harnesses/claude/ClaudeSessionParser.js";
import { CodexSessionParser } from "../../harnesses/codex/CodexSessionParser.js";
import { CopilotSessionParser } from "../../harnesses/copilot/CopilotSessionParser.js";
import { GrokSessionParser } from "../../harnesses/grok/GrokSessionParser.js";
import { PiSessionParser } from "../../harnesses/pi/PiSessionParser.js";

type GetConversation = (p: string, o?: ConversationOptions) => ConversationMessage[];

interface AdapterCase {
  name: string;
  fileName: string;
  create: () => GetConversation;
  /** Lines (already serialized, may include malformed ones) for turn `i`. */
  turn: (i: number) => string[];
}

const j = (value: unknown): string => JSON.stringify(value);
const pad = (i: number): string => (i % 5 === 0 ? ` ${"lorem ipsum ".repeat(500)}` : "");
const ts = (i: number, s = 0): string =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, i * 10 + s)).toISOString();

const cases: AdapterCase[] = [
  {
    name: "claude",
    fileName: "claude.jsonl",
    create: () => {
      const parser = new ClaudeSessionParser();
      return (p, o) => parser.getConversation(p, o);
    },
    turn: (i) => [
      j({ type: "file-history-snapshot", snapshot: { timestamp: ts(i) } }),
      j({ type: "user", timestamp: ts(i, 1), message: { content: `question ${i}${pad(i)}` } }),
      j({
        type: "assistant",
        timestamp: ts(i, 2),
        message: {
          content: [
            { type: "text", text: `answer ${i} ✓` },
            { type: "tool_use", name: "Read", input: { file_path: `/f${i}.ts` } },
          ],
        },
      }),
      j({
        type: "user",
        timestamp: ts(i, 3),
        message: {
          content: [{ type: "tool_result", content: `result ${i}\nmore`, is_error: i % 4 === 0 }],
        },
      }),
      j({
        type: "user",
        timestamp: ts(i, 4),
        message: { content: "<system-reminder>hidden</system-reminder>" },
      }),
      j({ type: "progress", timestamp: ts(i, 5) }),
      i % 5 === 0 ? '{"type":"user","message":' : "",
      j({ type: "system", timestamp: ts(i, 6), message: { content: `system ${i}` } }),
    ],
  },
  {
    name: "codex",
    fileName: "codex.jsonl",
    create: () => {
      const parser = new CodexSessionParser();
      return (p, o) => parser.getConversation(p, o);
    },
    turn: (i) => {
      const turnId = `turn-${i}`;
      const userResponse = j({
        type: "response_item",
        timestamp: ts(i, 1),
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: `fix bug ${i}${pad(i)}` }],
          internal_chat_message_metadata_passthrough: { turn_id: turnId },
        },
      });
      const userEvent = j({
        type: "event_msg",
        timestamp: ts(i, 1),
        payload: {
          type: "item_completed",
          turn_id: turnId,
          item: { type: "UserMessage", content: [{ type: "text", text: `fix bug ${i}${pad(i)}` }] },
        },
      });
      const agentEvent = j({
        type: "event_msg",
        timestamp: ts(i, 5),
        payload: {
          type: "item_completed",
          turn_id: turnId,
          item: { type: "AgentMessage", content: [{ type: "Text", text: `found issue ${i}` }] },
        },
      });
      const agentResponse = j({
        type: "response_item",
        timestamp: ts(i, 6),
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: `found issue ${i}` }],
          internal_chat_message_metadata_passthrough: { turn_id: turnId },
        },
      });
      return [
        ...(i === 0 ? [j({ type: "session_meta", payload: { id: "s", cwd: "/repo" } })] : []),
        // Alternate which half of a mirrored pair is written first.
        ...(i % 2 ? [userEvent, userResponse] : [userResponse, userEvent]),
        j({
          type: "event_msg",
          timestamp: ts(i, 2),
          payload: { type: "agent_reasoning", message: `thinking ${i}` },
        }),
        j({
          type: "response_item",
          timestamp: ts(i, 3),
          payload: { type: "function_call", name: "shell" },
        }),
        j({ type: "event_msg", timestamp: ts(i, 4), payload: { type: "token_count" } }),
        ...(i % 2 ? [agentResponse, agentEvent] : [agentEvent, agentResponse]),
        j({
          type: "event_msg",
          timestamp: ts(i, 7),
          payload: { type: "agent_message", message: `legacy ${i}` },
        }),
        i % 3 === 0
          ? j({
              type: "event_msg",
              timestamp: ts(i, 8),
              payload: { type: "task_complete", message: `done ${i}` },
            })
          : "",
      ];
    },
  },
  {
    name: "copilot",
    fileName: "events.jsonl",
    create: () => {
      const parser = new CopilotSessionParser();
      return (p, o) => parser.getConversation(p, o);
    },
    turn: (i) => [
      i === 0
        ? j({ type: "session.start", data: { sessionId: "s", context: { cwd: "/repo" } } })
        : "",
      j({ type: "user.message", timestamp: ts(i, 1), data: { content: `hello ${i}${pad(i)}` } }),
      j({ type: "session.warning", timestamp: ts(i, 2), data: { message: `warn ${i}` } }),
      j({
        type: "tool.execution_complete",
        timestamp: ts(i, 3),
        data: { result: { content: `tool ${i}` } },
      }),
      j({ type: "assistant.message", timestamp: ts(i, 4), data: {} }),
      j({ type: "assistant.message", timestamp: ts(i, 5), data: { content: `hi ${i}` } }),
      "   ",
    ],
  },
  {
    name: "grok",
    fileName: "chat_history.jsonl",
    create: () => {
      const parser = new GrokSessionParser();
      return (p, o) => parser.getConversation(p, o);
    },
    turn: (i) => [
      j({ type: "system", content: `system prompt ${i}` }),
      j({ type: "user", content: "<user_info>ctx</user_info>" }),
      j({
        type: "user",
        content: [{ type: "text", text: `<user_query>ask ${i}${pad(i)}</user_query>` }],
      }),
      j({ type: "assistant", content: [{ type: "text", text: `reply ${i}` }] }),
      j({ type: "assistant", content: "" }),
    ],
  },
  {
    name: "pi",
    fileName: "pi.jsonl",
    create: () => {
      const parser = new PiSessionParser();
      return (p, o) => parser.getConversation(p, o);
    },
    turn: (i) => [
      i === 0 ? j({ type: "session", id: "s", cwd: "/repo", timestamp: ts(0) }) : "",
      j({ type: "model_change", id: `m${i}`, timestamp: ts(i), modelId: "x" }),
      j({
        type: "message",
        timestamp: ts(i, 1),
        message: { role: "user", content: [{ type: "text", text: `hello ${i}${pad(i)}` }] },
      }) + "\r",
      j({ type: "message", timestamp: ts(i, 2), message: { role: "system", content: `sys ${i}` } }),
      j({
        type: "message",
        timestamp: ts(i, 3),
        message: { role: "assistant", content: [{ type: "text", text: `Hello ${i}` }] },
      }),
      "[1,2,3]",
    ],
  },
  {
    name: "kiro",
    fileName: "kiro.jsonl",
    create: () => {
      const adapter = new KiroAdapter();
      return (p, o) => adapter.getConversation(p, o);
    },
    turn: (i) => [
      j({
        version: "v1",
        kind: "Prompt",
        data: {
          content: [{ kind: "text", data: `do ${i}${pad(i)}` }],
          meta: { timestamp: 1_700_000_000 + i },
        },
      }),
      j({
        version: "v1",
        kind: "AssistantMessage",
        data: {
          content: [
            {
              kind: "toolUse",
              data: { toolUseId: `t${i}`, name: "shell", input: { command: `ls ${i}` } },
            },
          ],
        },
      }),
      j({
        version: "v1",
        kind: "ToolResults",
        data: {
          content: [
            {
              kind: "toolResult",
              data: { toolUseId: `t${i}`, status: "success", result: `out ${i}` },
            },
          ],
        },
      }),
      j({
        version: "v1",
        kind: "AssistantMessage",
        data: { content: [{ kind: "text", data: `done ${i}` }] },
      }),
    ],
  },
  {
    name: "antigravity",
    fileName: "transcript.jsonl",
    create: () => {
      const adapter = new AntigravityCliAdapter();
      return (p, o) => adapter.getConversation(p, o);
    },
    turn: (i) => [
      j({
        source: "USER_EXPLICIT",
        type: "USER_INPUT",
        created_at: ts(i, 1),
        content: `<USER_REQUEST>\nrequest ${i}${pad(i)}\n</USER_REQUEST>\n<ADDITIONAL_CONTEXT>x</ADDITIONAL_CONTEXT>`,
      }),
      j({ source: "MODEL", type: "RUN_COMMAND", created_at: ts(i, 2), content: `ls ${i}` }),
      j({ source: "SYSTEM", type: "CHECKPOINT", created_at: ts(i, 3), content: `checkpoint ${i}` }),
      j({
        source: "MODEL",
        type: "PLANNER_RESPONSE",
        created_at: ts(i, 4),
        content: `planned ${i}`,
      }),
      j({ source: "USER_EXPLICIT", type: "USER_INPUT", created_at: ts(i, 5), content: "   " }),
    ],
  },
];

function build(c: AdapterCase, from: number, to: number): string {
  const lines: string[] = [];
  for (let i = from; i < to; i++) lines.push(...c.turn(i));
  return lines.join("\n") + "\n";
}

const TAILS = [1, 2, 3, 7, 20, 64];

describe.each(cases)("getConversation tail parity: $name", (c) => {
  let tmpDir: string;
  let file: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `tail-parity-${c.name}-`));
    file = path.join(tmpDir, c.fileName);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const expectParity = (getConversation: GetConversation, verbose: boolean): void => {
    const full = getConversation(file, { verbose });
    for (const tail of [...TAILS, full.length, full.length + 5]) {
      const expected = full.slice(-tail);
      expect(getConversation(file, { verbose, tail })).toEqual(expected);
    }
  };

  it("matches the last N of a full parse across chunk boundaries (verbose and not)", () => {
    fs.writeFileSync(file, build(c, 0, 120));
    expect(fs.statSync(file).size).toBeGreaterThan(2 * 64 * 1024);

    const getConversation = c.create();
    expect(getConversation(file).length).toBeGreaterThan(64);
    expectParity(getConversation, false);
    expectParity(getConversation, true);
  });

  it("stays equal to a full parse across appends, truncation and rotation", () => {
    const getConversation = c.create();
    fs.writeFileSync(file, build(c, 0, 80));
    expectParity(getConversation, false);

    for (let round = 0; round < 3; round++) {
      fs.appendFileSync(file, build(c, 80 + round * 3, 83 + round * 3));
      expectParity(getConversation, false);
      expectParity(getConversation, true);
    }

    // Append a turn split mid-line, as a writer flushing partially would.
    const next = build(c, 200, 201);
    const cut = Math.floor(next.length / 2);
    fs.appendFileSync(file, next.slice(0, cut));
    expectParity(getConversation, false);
    fs.appendFileSync(file, next.slice(cut));
    expectParity(getConversation, false);

    // Truncate in place to a shorter transcript.
    fs.writeFileSync(file, build(c, 300, 304));
    expectParity(getConversation, false);

    // Rotate: replace with a larger file at a new inode.
    const staging = path.join(tmpDir, "staging.jsonl");
    fs.writeFileSync(staging, build(c, 400, 460));
    fs.renameSync(staging, file);
    expectParity(getConversation, false);
    expectParity(getConversation, true);
  });

  it("returns an empty list for a missing transcript", () => {
    expect(c.create()(path.join(tmpDir, "missing", c.fileName), { tail: 20 })).toEqual([]);
  });
});
