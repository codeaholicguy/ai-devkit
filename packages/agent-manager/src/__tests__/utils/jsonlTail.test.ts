import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMessage } from "../../adapters/AgentAdapter.js";
import { JsonlTailReader, type JsonlTailSource } from "../../utils/jsonlTail.js";

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
    readBytes.total += Buffer.byteLength(out as string);
    return out;
  }) as typeof actual.readFileSync;
  return { ...actual, readSync, readFileSync, default: { ...actual, readSync, readFileSync } };
});

interface Line {
  role?: ConversationMessage["role"];
  text?: string;
  key?: string;
  mirror?: boolean;
}

/** Line-independent source: every line with role+text is one message. */
const simpleSource: JsonlTailSource<ConversationMessage> = {
  parseLine(line) {
    let entry: Line;
    try {
      entry = JSON.parse(line);
    } catch {
      return null;
    }
    if (!entry.role || !entry.text) return null;
    return { role: entry.role, content: entry.text };
  },
};

function fullParse(content: string): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  for (const line of content.trim().split("\n")) {
    const message = simpleSource.parseLine(line);
    if (message) out.push(message as ConversationMessage);
  }
  return out;
}

/**
 * Source whose output depends on other lines: a "mirror" line is dropped
 * when a non-mirror line with the same key exists anywhere in the window
 * (modeled on Codex's event_msg/response_item de-duplication).
 */
interface KeyedItem {
  key?: string;
  mirror: boolean;
  message: ConversationMessage;
}
const dedupSource: JsonlTailSource<KeyedItem> = {
  parseLine(line) {
    let entry: Line;
    try {
      entry = JSON.parse(line);
    } catch {
      return null;
    }
    if (!entry.role || !entry.text) return null;
    return {
      key: entry.key,
      mirror: entry.mirror === true,
      message: { role: entry.role, content: entry.text },
    };
  },
  finalize(items) {
    const primary = new Set(items.filter((i) => !i.mirror && i.key).map((i) => i.key));
    return items.filter((i) => !(i.mirror && i.key && primary.has(i.key))).map((i) => i.message);
  },
};

function dedupFullParse(content: string): ConversationMessage[] {
  const items: KeyedItem[] = [];
  for (const line of content.trim().split("\n")) {
    const item = dedupSource.parseLine(line);
    if (item) items.push(item);
  }
  return dedupSource.finalize!(items);
}

const last = <T>(arr: T[], n: number): T[] => (arr.length > n ? arr.slice(-n) : arr);

describe("JsonlTailReader", () => {
  let tmpDir: string;
  let file: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsonl-tail-"));
    file = path.join(tmpDir, "session.jsonl");
    readBytes.total = 0;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function mixedContent(count: number): string {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      if (i % 7 === 3) lines.push("not json {");
      if (i % 11 === 5) lines.push("");
      if (i % 5 === 0) lines.push(JSON.stringify({ type: "noise", i }));
      const text = i % 13 === 0 ? `big ${i} ${"x".repeat(300)}` : `msg ${i} ünïcødé ✓ 🚀`;
      lines.push(JSON.stringify({ role: i % 2 ? "assistant" : "user", text }));
    }
    return lines.join("\n") + "\n";
  }

  it("matches the last N of a full parse for every tail and chunk size", () => {
    const content = mixedContent(60);
    fs.writeFileSync(file, content);
    const full = fullParse(content);

    for (const chunkSize of [7, 64, 333, 65536]) {
      for (let tail = 1; tail <= full.length + 2; tail++) {
        const reader = new JsonlTailReader({ chunkSize });
        expect(reader.read(file, tail, simpleSource)).toEqual(last(full, tail));
      }
    }
  });

  it("handles lines longer than the chunk size and multi-byte characters across chunks", () => {
    const lines = [
      JSON.stringify({ role: "user", text: "é".repeat(5000) }),
      JSON.stringify({ role: "assistant", text: "🚀".repeat(3000) }),
      JSON.stringify({ role: "user", text: "short" }),
    ];
    const content = lines.join("\n");
    fs.writeFileSync(file, content);

    const reader = new JsonlTailReader({ chunkSize: 100 });
    expect(reader.read(file, 3, simpleSource)).toEqual(fullParse(content));
  });

  it("returns an empty list for missing and empty files", () => {
    const reader = new JsonlTailReader();
    expect(reader.read(path.join(tmpDir, "missing.jsonl"), 5, simpleSource)).toEqual([]);
    fs.writeFileSync(file, "");
    expect(reader.read(file, 5, simpleSource)).toEqual([]);
  });

  it("reads only a bounded window from the end on the first call", () => {
    const content = mixedContent(20000);
    fs.writeFileSync(file, content);
    const reader = new JsonlTailReader({ chunkSize: 4096 });

    readBytes.total = 0;
    const result = reader.read(file, 20, simpleSource);

    expect(result).toEqual(last(fullParse(content), 20));
    expect(readBytes.total).toBeLessThanOrEqual(4 * 4096);
    expect(content.length).toBeGreaterThan(100 * 4096);
  });

  it("does not read the file again when it is unchanged", () => {
    fs.writeFileSync(file, mixedContent(50));
    const reader = new JsonlTailReader();
    const first = reader.read(file, 10, simpleSource);

    readBytes.total = 0;
    expect(reader.read(file, 10, simpleSource)).toEqual(first);
    expect(readBytes.total).toBe(0);
  });

  it("parses only appended bytes on later polls", () => {
    const chunkSize = 4096;
    let content = mixedContent(5000);
    fs.writeFileSync(file, content);
    const reader = new JsonlTailReader({ chunkSize });
    reader.read(file, 20, simpleSource);

    for (let round = 0; round < 3; round++) {
      const appended = mixedContent(3 + round).replace(/msg /g, `r${round} `);
      fs.appendFileSync(file, appended);
      content += appended;

      readBytes.total = 0;
      const result = reader.read(file, 20, simpleSource);
      expect(result).toEqual(last(fullParse(content), 20));
      expect(readBytes.total).toBeLessThanOrEqual(Buffer.byteLength(appended) + chunkSize);
    }
  });

  it("includes an unterminated final line and re-reads it once completed", () => {
    const head = [
      JSON.stringify({ role: "user", text: "one" }),
      JSON.stringify({ role: "assistant", text: "two" }),
    ].join("\n");
    fs.writeFileSync(file, head + "\n" + '{"role":"user","te');
    const reader = new JsonlTailReader({ chunkSize: 16 });
    expect(reader.read(file, 5, simpleSource)).toEqual(fullParse(head));

    fs.appendFileSync(file, 'xt":"three"}');
    const complete = fs.readFileSync(file, "utf-8");
    expect(reader.read(file, 5, simpleSource)).toEqual(fullParse(complete));
    expect(reader.read(file, 5, simpleSource).at(-1)).toEqual({ role: "user", content: "three" });

    fs.appendFileSync(file, "\n" + JSON.stringify({ role: "assistant", text: "four" }) + "\n");
    expect(reader.read(file, 5, simpleSource)).toEqual(fullParse(fs.readFileSync(file, "utf-8")));
  });

  it("resets when the file shrinks (truncation)", () => {
    fs.writeFileSync(file, mixedContent(40));
    const reader = new JsonlTailReader({ chunkSize: 64 });
    reader.read(file, 5, simpleSource);

    const replacement = [
      JSON.stringify({ role: "user", text: "fresh start" }),
      JSON.stringify({ role: "assistant", text: "ok" }),
    ].join("\n");
    fs.writeFileSync(file, replacement + "\n");
    expect(reader.read(file, 5, simpleSource)).toEqual(fullParse(replacement));
  });

  it("resets when the file is replaced by a new inode (rotation)", () => {
    const original = mixedContent(10);
    fs.writeFileSync(file, original);
    const reader = new JsonlTailReader({ chunkSize: 64 });
    reader.read(file, 5, simpleSource);

    // A larger replacement at a new inode must not be treated as an append.
    const rotated = mixedContent(30).replace(/msg /g, "rotated ");
    const staging = path.join(tmpDir, "staging.jsonl");
    fs.writeFileSync(staging, rotated);
    fs.renameSync(staging, file);

    expect(reader.read(file, 5, simpleSource)).toEqual(last(fullParse(rotated), 5));
  });

  it("keeps cache entries separate per variant and per tail", () => {
    const content = mixedContent(30);
    fs.writeFileSync(file, content);
    const reader = new JsonlTailReader();
    const full = fullParse(content);
    const onlyUsers: JsonlTailSource<ConversationMessage> = {
      parseLine: (line) => {
        const m = simpleSource.parseLine(line);
        return m && (m as ConversationMessage).role === "user" ? m : null;
      },
    };

    expect(reader.read(file, 3, simpleSource, "all")).toEqual(last(full, 3));
    expect(reader.read(file, 3, onlyUsers, "users")).toEqual(
      last(
        full.filter((m) => m.role === "user"),
        3,
      ),
    );
    expect(reader.read(file, 6, simpleSource, "all")).toEqual(last(full, 6));
  });

  it("applies finalize over the window, including lines appended later", () => {
    const lines = [
      { role: "user", text: "hello", key: "k1" },
      { role: "user", text: "hello", key: "k1", mirror: true },
      { role: "assistant", text: "reply", key: "k2", mirror: true },
    ].map((l) => JSON.stringify(l));
    let content = lines.join("\n") + "\n";
    fs.writeFileSync(file, content);
    const reader = new JsonlTailReader({ chunkSize: 16 });

    expect(reader.read(file, 10, dedupSource, "", 4)).toEqual(dedupFullParse(content));

    // The primary for k2 arrives after its mirror; the mirror must disappear.
    const primary = JSON.stringify({ role: "assistant", text: "reply", key: "k2" }) + "\n";
    fs.appendFileSync(file, primary);
    content += primary;
    expect(reader.read(file, 10, dedupSource, "", 4)).toEqual(dedupFullParse(content));
    expect(dedupFullParse(content)).toHaveLength(2);
  });

  it("stays correct for long append sequences while bounding the retained window", () => {
    fs.writeFileSync(file, "");
    const reader = new JsonlTailReader({ chunkSize: 64 });
    let content = "";
    for (let i = 0; i < 200; i++) {
      const chunk =
        JSON.stringify({ role: "user", text: `q${i}`, key: `u${i}` }) +
        "\n" +
        JSON.stringify({ role: "user", text: `q${i}`, key: `u${i}`, mirror: true }) +
        "\n";
      fs.appendFileSync(file, chunk);
      content += chunk;
      expect(reader.read(file, 5, dedupSource, "", 4)).toEqual(last(dedupFullParse(content), 5));
    }
  });

  it("evicts least-recently-used files beyond maxFiles", () => {
    const reader = new JsonlTailReader({ maxFiles: 2 });
    const files = ["a", "b", "c"].map((name) => {
      const p = path.join(tmpDir, `${name}.jsonl`);
      fs.writeFileSync(p, mixedContent(5));
      return p;
    });
    for (const p of files) reader.read(p, 3, simpleSource);

    readBytes.total = 0;
    reader.read(files[2], 3, simpleSource);
    expect(readBytes.total).toBe(0);
    reader.read(files[0], 3, simpleSource);
    expect(readBytes.total).toBeGreaterThan(0);
  });
});
