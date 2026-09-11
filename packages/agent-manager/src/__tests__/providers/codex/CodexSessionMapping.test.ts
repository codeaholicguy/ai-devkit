import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { CodexSessionMapping } from "../../../providers/codex/CodexSessionMapping.js";

describe("CodexSessionMapping", () => {
  let tmpDir: string;
  let sessionsDir: string;
  let mappingPath: string;
  let processInfo: ProcessInfo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mapping-"));
    sessionsDir = path.join(tmpDir, ".codex", "sessions");
    mappingPath = path.join(tmpDir, ".codex", "ai-devkit", "sessions.json");
    processInfo = { pid: 5151, command: "codex", cwd: "/repo", tty: "ttys001" };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("matches a process to an existing trusted session file", () => {
    const sessionFile = path.join(sessionsDir, "2026", "06", "26", "session.jsonl");
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
    fs.writeFileSync(sessionFile, "");
    fs.writeFileSync(mappingPath, JSON.stringify({ 5151: sessionFile }));

    expect(createMapping().match([processInfo])).toEqual({
      matches: [{ process: processInfo, filePath: sessionFile }],
      fallback: [],
    });
  });

  it("falls back for malformed mappings, missing files, invalid pids, and untrusted paths", () => {
    fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
    fs.writeFileSync(
      mappingPath,
      JSON.stringify({
        invalid: path.join(sessionsDir, "ignored.jsonl"),
        5151: path.join(tmpDir, "outside.jsonl"),
        9999: path.join(sessionsDir, "missing.jsonl"),
      }),
    );

    expect(createMapping().match([processInfo])).toEqual({
      matches: [],
      fallback: [processInfo],
    });

    fs.writeFileSync(mappingPath, "{not-json");
    expect(createMapping().match([processInfo])).toEqual({
      matches: [],
      fallback: [processInfo],
    });
  });

  function createMapping(): CodexSessionMapping {
    return new CodexSessionMapping({ mappingPath, sessionsDir });
  }
});
