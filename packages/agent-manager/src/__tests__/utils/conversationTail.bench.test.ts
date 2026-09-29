/**
 * Large-transcript measurement for `getConversation({ tail })` (issue #260).
 *
 * Skipped by default. Run with:
 *   AI_DEVKIT_TAIL_BENCH=1 npx vitest run src/__tests__/utils/conversationTail.bench.test.ts
 *
 * Generates a synthetic ~400 MB transcript per adapter under os.tmpdir(),
 * counts bytes read through `fs`, and checks the acceptance limits: the first
 * tail read reads <= 2 MB in <= 50 ms, and a poll after appending K bytes
 * reads <= K + 64 KiB. The file is deleted afterwards.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ClaudeSessionParser } from "../../harnesses/claude/ClaudeSessionParser.js";
import { CodexSessionParser } from "../../harnesses/codex/CodexSessionParser.js";

const readBytes = vi.hoisted(() => ({ total: 0 }));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const readSync = ((...args: Parameters<typeof actual.readSync>) => {
    const n = (actual.readSync as (...a: unknown[]) => number)(...args);
    readBytes.total += n;
    return n;
  }) as typeof actual.readSync;
  const readFileSync = ((...args: Parameters<typeof actual.readFileSync>) => {
    const out = (actual.readFileSync as (...a: unknown[]) => string | Buffer)(...args);
    readBytes.total += typeof out === "string" ? Buffer.byteLength(out) : out.length;
    return out;
  }) as typeof actual.readFileSync;
  return { ...actual, readSync, readFileSync, default: { ...actual, readSync, readFileSync } };
});

const TARGET_BYTES = 400 * 1024 * 1024;
const TAIL = 20;
const MB = 1024 * 1024;

function writeLargeFile(file: string, header: string[], turn: (i: number) => string[]): void {
  const fd = fs.openSync(file, "w");
  try {
    fs.writeSync(fd, header.map((l) => l + "\n").join(""));
    let written = 0;
    let i = 0;
    while (written < TARGET_BYTES) {
      const parts: string[] = [];
      for (let k = 0; k < 500; k++, i++) {
        for (const line of turn(i)) parts.push(line, "\n");
      }
      const block = parts.join("");
      fs.writeSync(fd, block);
      written += Buffer.byteLength(block);
    }
  } finally {
    fs.closeSync(fd);
  }
}

const filler = "x".repeat(2000);

const adapters = [
  {
    name: "codex",
    create: () => new CodexSessionParser(),
    header: [JSON.stringify({ type: "session_meta", payload: { id: "bench", cwd: "/repo" } })],
    turn: (i: number) => {
      const turnId = `t${i}`;
      return [
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-01-01T00:00:00Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `question ${i}` }],
            internal_chat_message_metadata_passthrough: { turn_id: turnId },
          },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "item_completed",
            turn_id: turnId,
            item: { type: "UserMessage", content: [{ type: "text", text: `question ${i}` }] },
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: { type: "function_call_output", output: filler },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "agent_message", message: `answer ${i}` },
        }),
      ];
    },
    appendTurn: (i: number) =>
      JSON.stringify({
        type: "event_msg",
        payload: { type: "agent_message", message: `appended ${i}` },
      }),
  },
  {
    name: "claude",
    create: () => new ClaudeSessionParser(),
    header: [JSON.stringify({ type: "file-history-snapshot", snapshot: {} })],
    turn: (i: number) => [
      JSON.stringify({ type: "user", message: { content: `question ${i}` } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] },
      }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "tool_result", content: filler }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: `answer ${i}` }] },
      }),
    ],
    appendTurn: (i: number) =>
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: `appended ${i}` }] },
      }),
  },
];

describe.skipIf(!process.env.AI_DEVKIT_TAIL_BENCH)(
  "getConversation tail on a 400 MB transcript",
  () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tail-bench-"));
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it.each(adapters)(
      "$name: first call and incremental polls stay within the byte/time budget",
      (adapter) => {
        const file = path.join(tmpDir, `${adapter.name}.jsonl`);
        writeLargeFile(file, adapter.header, adapter.turn);
        const size = fs.statSync(file).size;
        expect(size).toBeGreaterThanOrEqual(TARGET_BYTES);

        const parser = adapter.create();
        readBytes.total = 0;
        const rssBefore = process.memoryUsage().rss;
        const start = performance.now();
        const messages = parser.getConversation(file, { tail: TAIL });
        const firstMs = performance.now() - start;
        const firstRead = readBytes.total;
        const rssDelta = process.memoryUsage().rss - rssBefore;

        expect(messages).toHaveLength(TAIL);
        expect(messages.at(-1)?.content).toMatch(/^answer \d+$/);

        const polls: string[] = [];
        for (let round = 0; round < 3; round++) {
          const appended = adapter.appendTurn(round) + "\n";
          fs.appendFileSync(file, appended);
          readBytes.total = 0;
          const t0 = performance.now();
          const next = parser.getConversation(file, { tail: TAIL });
          const pollMs = performance.now() - t0;
          expect(next.at(-1)?.content).toBe(`appended ${round}`);
          expect(next).toHaveLength(TAIL);
          const k = Buffer.byteLength(appended);
          expect(readBytes.total).toBeLessThanOrEqual(k + 64 * 1024);
          polls.push(`K=${k}B read=${readBytes.total}B ${pollMs.toFixed(2)}ms`);
        }

        console.log(
          `[${adapter.name}] file=${(size / MB).toFixed(1)} MB first call: ` +
            `read=${(firstRead / 1024).toFixed(1)} KiB, ${firstMs.toFixed(2)} ms, ` +
            `rssDelta=${(rssDelta / MB).toFixed(1)} MB; polls: ${polls.join("; ")}`,
        );

        expect(firstRead).toBeLessThanOrEqual(2 * MB);
        expect(firstMs).toBeLessThanOrEqual(50);

        fs.rmSync(file, { force: true });
      },
      120_000,
    );
  },
);
