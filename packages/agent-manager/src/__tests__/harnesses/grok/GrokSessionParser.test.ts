/**
 * Tests for GrokSessionParser's summary path.
 *
 * `legacyReadSession` is a verbatim copy of the pre-incremental algorithm
 * (full read + ConversationMessage[] build), kept here as an oracle so the
 * reducer-based summary is checked field-for-field against it.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { ConversationMessage } from "../../../adapters/AgentAdapter.js";
import { GrokSessionParser } from "../../../harnesses/grok/GrokSessionParser.js";

function legacyScan(chatPath: string) {
  let content: string | undefined;
  try {
    content = fs.readFileSync(chatPath, "utf-8");
  } catch {
    content = undefined;
  }
  if (content === undefined) return {} as Record<string, string | undefined>;

  const extractText = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      return value
        .map((block) =>
          block && typeof block === "object" && typeof (block as any).text === "string"
            ? (block as any).text
            : "",
        )
        .join("");
    }
    return "";
  };

  const messages: ConversationMessage[] = [];
  let lastRole: ConversationMessage["role"] | undefined;
  for (const line of content.trim().split("\n")) {
    if (!line.trim()) continue;
    let record: any;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const text = extractText(record.content);
    if (record.type === "user") {
      const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
      if (!match) continue;
      messages.push({ role: "user", content: match[1].trim() });
      lastRole = "user";
    } else if (record.type === "assistant") {
      if (!text) continue;
      messages.push({ role: "assistant", content: text });
      lastRole = "assistant";
    }
  }
  const userTurns = messages.filter((m) => m.role === "user");
  return {
    firstUserMessage: userTurns[0]?.content,
    lastUserMessage: userTurns[userTurns.length - 1]?.content,
    lastRole,
  };
}

function legacyReadSession(sessionDir: string, defaultCwd: string) {
  const chatPath = path.join(sessionDir, "chat_history.jsonl");
  const chatStat = fs.statSync(chatPath);
  const scan = legacyScan(chatPath);
  const dirStat = fs.statSync(sessionDir);
  return {
    sessionId: path.basename(sessionDir),
    projectPath: defaultCwd,
    sessionFilePath: chatPath,
    sessionStart: dirStat?.birthtime || chatStat.mtime,
    lastActive: chatStat.mtime,
    firstUserMessage: scan.firstUserMessage,
    lastUserMessage: scan.lastUserMessage,
    lastRole: scan.lastRole,
  };
}

const userRecord = (text: string) => ({
  type: "user",
  content: [{ type: "text", text: `<user_query>\n${text}\n</user_query>` }],
});
const contextRecord = (text: string) => ({ type: "user", content: [{ type: "text", text }] });
const assistantRecord = (text: string) => ({
  type: "assistant",
  content: [{ type: "text", text }],
});
const systemRecord = (text: string) => ({ type: "system", content: text });
const lines = (records: object[]) => records.map((r) => JSON.stringify(r)).join("\n");

/** Raw chat_history.jsonl bodies covering the existing Grok fixtures plus edge cases. */
const FIXTURES: Record<string, string> = {
  "single prompt": lines([userRecord("fix the bug")]),
  "user then assistant": lines([userRecord("go"), assistantRecord("done")]),
  "summary is the last prompt": lines([
    userRecord("refactor the parser"),
    assistantRecord("on it"),
  ]),
  "context injection skipped": lines([
    contextRecord("<user_info>OS: macos</user_info>"),
    userRecord("do the thing"),
  ]),
  "context injection after assistant keeps assistant role": lines([
    userRecord("first"),
    assistantRecord("reply"),
    contextRecord("<system-reminder>ping</system-reminder>"),
  ]),
  "system records ignored": lines([systemRecord("You are Grok"), userRecord("go")]),
  "malformed trailing line": `${lines([userRecord("hi")])}\n{bad json`,
  "multiple prompts, first and last differ": lines([
    systemRecord("sys"),
    contextRecord("<user_info>x</user_info>"),
    userRecord("  first prompt  "),
    assistantRecord("a1"),
    userRecord("second prompt"),
    assistantRecord(""),
    { type: "user", content: "<user_query>third as string</user_query>" },
    { type: "assistant", content: [{ type: "text", text: "part " }, { text: "two" }, 42, null] },
  ]),
  "empty assistant text does not change role": lines([userRecord("q"), assistantRecord("")]),
  "trailing newline and blank lines": `\n\n${lines([userRecord("a"), assistantRecord("b")])}\n\n`,
  "CRLF line endings": [userRecord("crlf"), assistantRecord("ok")]
    .map((r) => JSON.stringify(r))
    .join("\r\n"),
  "non-object JSON values": `42\n"str"\n[1,2]\n${lines([userRecord("after scalars")])}`,
  "unknown record types": lines([{ type: "tool", content: "x" }, userRecord("z"), { foo: 1 }]),
  "empty file": "",
  "only context injections": lines([contextRecord("<user_info>a</user_info>")]),
};

describe("GrokSessionParser summary", () => {
  let tmpDir: string;
  let parser: GrokSessionParser;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grok-parser-test-"));
    parser = new GrokSessionParser();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeChat(name: string, body: string): string {
    const sessionDir = path.join(tmpDir, name.replace(/[^a-z0-9]+/gi, "-"));
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "chat_history.jsonl"), body);
    return sessionDir;
  }

  describe.each(Object.entries(FIXTURES))("fixture: %s", (name, body) => {
    it("readSession matches the legacy full-parse output", () => {
      const dir = writeChat(name, body);
      expect(parser.readSession(dir, "/cwd")).toEqual(legacyReadSession(dir, "/cwd"));
    });

    it("readSessionIncremental matches the legacy full-parse output", () => {
      const dir = writeChat(name, body);
      expect(parser.readSessionIncremental(dir, "/cwd")).toEqual(legacyReadSession(dir, "/cwd"));
      // cached second read is identical too
      expect(parser.readSessionIncremental(dir, "/cwd")).toEqual(legacyReadSession(dir, "/cwd"));
    });
  });

  it("incremental result tracks appends and matches a full parse", () => {
    const dir = writeChat("append", `${lines([userRecord("one"), assistantRecord("r1")])}\n`);
    parser.readSessionIncremental(dir, "/cwd");

    const chatPath = path.join(dir, "chat_history.jsonl");
    fs.appendFileSync(chatPath, `${lines([contextRecord("<user_info/>"), userRecord("two")])}`);
    expect(parser.readSessionIncremental(dir, "/cwd")).toEqual(legacyReadSession(dir, "/cwd"));

    // completes the previously unterminated line, then adds an assistant turn
    fs.appendFileSync(chatPath, `\n${lines([assistantRecord("r2")])}\n`);
    expect(parser.readSessionIncremental(dir, "/cwd")).toEqual(legacyReadSession(dir, "/cwd"));
  });

  it("returns null when chat_history.jsonl is missing", () => {
    const dir = path.join(tmpDir, "no-chat");
    fs.mkdirSync(dir);
    expect(parser.readSession(dir, "/cwd")).toBeNull();
    expect(parser.readSessionIncremental(dir, "/cwd")).toBeNull();
  });

  it("summary paths never build a conversation message array", () => {
    const body = lines(
      Array.from({ length: 500 }, (_, i) =>
        i % 2 === 0 ? userRecord(`prompt ${i}`) : assistantRecord(`reply ${i}`),
      ),
    );
    const dir = writeChat("many", body);
    const buildSpy = vi.spyOn(parser as any, "parseChatHistory");

    const full = parser.readSession(dir, "/cwd");
    const incremental = parser.readSessionIncremental(dir, "/cwd");

    expect(buildSpy).not.toHaveBeenCalled();
    expect(full?.lastUserMessage).toBe("prompt 498");
    expect(incremental).toEqual(full);

    // the cached state is a fixed-shape record of scalars, not a list of turns
    const state = (parser as any).sessionCache.read(path.join(dir, "chat_history.jsonl")).state;
    expect(Object.keys(state).length).toBeLessThanOrEqual(3);
    for (const value of Object.values(state)) {
      expect(value === undefined || typeof value === "string").toBe(true);
    }
  });

  it("getConversation still returns the full message list", () => {
    const dir = writeChat("conv", FIXTURES["multiple prompts, first and last differ"]);
    expect(parser.getConversation(dir)).toEqual([
      { role: "user", content: "first prompt" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "second prompt" },
      { role: "user", content: "third as string" },
      { role: "assistant", content: "part two" },
    ]);
    expect(parser.getConversation(dir, { verbose: true })[0]).toEqual({
      role: "system",
      content: "sys",
    });
  });
});
