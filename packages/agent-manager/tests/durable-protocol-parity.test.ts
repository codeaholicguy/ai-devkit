import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { ClaudeStreamParser } from "../src/harnesses/claude/durable/ClaudeStreamParser.js";
import { CodexStreamParser } from "../src/harnesses/codex/durable/CodexStreamParser.js";
import { PiStreamParser } from "../src/harnesses/pi/durable/PiStreamParser.js";
const cases = JSON.parse(
  readFileSync(new URL("./fixtures/durable-protocol.json", import.meta.url), "utf8"),
);
describe("shared Rust/TS print protocol fixtures", () => {
  for (const c of cases)
    it(`${c.provider}: ${c.name}`, async () => {
      const parser =
        c.provider === "claude"
          ? new ClaudeStreamParser(c.sessionId, 1024 * 1024)
          : c.provider === "codex"
            ? new CodexStreamParser(c.sessionId, async () => {}, 1024 * 1024)
            : new PiStreamParser(c.sessionId, 1024 * 1024);
      const run = async () => {
        await parser.accept(c.stream);
        return parser.result({ code: c.exitCode, signal: null });
      };
      if (c.ok) expect((await run()).result).toBe(c.result);
      else await expect(run()).rejects.toThrow();
    });
});
