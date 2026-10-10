/**
 * Tests for harnesses/muse/MuseSessionLocator.ts — runtime-file matching,
 * dated-archive discovery, and session lookup by id.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { MuseSessionLocator } from "../../../harnesses/muse/MuseSessionLocator.js";

const SID = "01a12618-d918-7b63-91c8-4e896326eb1a";
const OTHER_SID = "2288dbd2-d703-444d-afce-59e40a8ad8b1";

function frame(inner: unknown): string {
  return JSON.stringify(inner);
}

function intent(text: string, recordedAtUs: number): unknown {
  return {
    schema_version: 1,
    stream: { kind: "session", id: SID },
    sequence: 2,
    recorded_at: recordedAtUs,
    record_type: "event",
    payload_type: "runtime.user_intent.accepted",
    payload: { refill_blocks: [{ kind: "text", text }] },
  };
}

function metadata(workspaceRoot: string, recordedAtUs: number): unknown {
  return {
    schema_version: 1,
    stream: { kind: "session", id: SID },
    sequence: 1,
    recorded_at: recordedAtUs,
    record_type: "event",
    payload_type: "runtime.session.metadata",
    payload: { kind: "metadata", record: { workspace_root: workspaceRoot } },
  };
}

function proc(pid: number, cwd: string, startTime: Date): ProcessInfo {
  return {
    pid,
    command: `/Users/tester/.local/bin/muse-bin-1.4.4-R5419.1`,
    cwd,
    tty: "ttys001",
    startTime,
  };
}

describe("MuseSessionLocator", () => {
  let home: string;
  let locator: MuseSessionLocator;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "muse-locator-test-"));
    locator = new MuseSessionLocator({ homeDir: home });
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  function writeTranscript(sessionId: string, dayDir: string, lines: string[]): string {
    const dir = path.join(home, ".local", "share", "muse", "sessions", dayDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "session.jsonl");
    fs.writeFileSync(filePath, lines.join("\n"));
    return filePath;
  }

  function writeRuntimeFile(sessionId: string, pid: number): string {
    const dir = path.join(home, ".local", "share", "muse", "runtime", "muse", "sessions");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${sessionId}.jsonl`.replace(".jsonl", ".json"));
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        schema_version: 1,
        session_id: sessionId,
        process_generation_hint: `pid=${pid}`,
      }),
    );
    return filePath;
  }

  it("matches a live process to its transcript via the runtime file", () => {
    const now = Date.now();
    const filePath = writeTranscript(SID, "2026/10/10", [
      frame(metadata("/Users/tester/proj", now * 1000)),
      frame(intent("hello", now * 1000)),
    ]);
    writeRuntimeFile(SID, 16174);
    // Align file birthtime with process start for the staleness guard.
    const start = new Date(fs.statSync(filePath).birthtimeMs);

    const { direct } = locator.matchRunningProcesses([proc(16174, "/Users/tester/proj", start)]);
    expect(direct).toHaveLength(1);
    expect(direct[0].process.pid).toBe(16174);
    expect(direct[0].sessionFile.filePath).toBe(filePath);
    expect(direct[0].sessionFile.sessionId).toBe(SID);
  });

  it("rejects runtime matches when the pid was recycled", () => {
    writeTranscript(SID, "2026/10/10", [frame(intent("hello", 1791640525332173))]);
    writeRuntimeFile(SID, 16174);

    // Process started an hour after the session file was born: recycled pid.
    const { direct, fallback } = locator.matchRunningProcesses([
      proc(16174, "/Users/tester/proj", new Date(Date.now() + 3600_000)),
    ]);
    expect(direct).toHaveLength(0);
    expect(fallback.map((p) => p.pid)).toContain(16174);
  });

  it("ignores malformed runtime files (processes fall through to legacy)", () => {
    writeTranscript(SID, "2026/10/10", [frame(intent("hello", 1791640525332173))]);
    const dir = path.join(home, ".local", "share", "muse", "runtime", "muse", "sessions");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${SID}.json`), "not json");
    fs.writeFileSync(
      path.join(dir, "other.json"),
      JSON.stringify({ session_id: "other", process_generation_hint: "nonsense" }),
    );

    // Non-muse processes never reach the locator: the adapter pre-filters via canHandle.
    const { direct, fallback } = locator.matchRunningProcesses([
      proc(16174, "/Users/tester/proj", new Date()),
    ]);
    expect(direct).toHaveLength(0);
    expect(fallback.map((p) => p.pid)).toEqual([16174]);
  });

  it("discovers historical sessions across dated dirs, skipping noise", () => {
    writeTranscript(SID, "2026/10/10", [frame(intent("hello", 1791640525332173))]);
    writeTranscript(OTHER_SID, "2026/10/09", [frame(intent("world", 1791640525332173))]);
    // Noise: subagent-style nested dir without session.jsonl, stray files.
    const noise = path.join(
      home,
      ".local",
      "share",
      "muse",
      "sessions",
      "2026/10/10",
      "not-a-uuid",
    );
    fs.mkdirSync(noise, { recursive: true });
    fs.writeFileSync(path.join(noise, "notes.txt"), "hi");

    const found = locator.discoverHistoricalSessionFiles();
    expect(found.map((f) => f.filePath).sort()).toEqual(
      [
        path.join(
          home,
          ".local",
          "share",
          "muse",
          "sessions",
          "2026/10/09",
          OTHER_SID,
          "session.jsonl",
        ),
        path.join(home, ".local", "share", "muse", "sessions", "2026/10/10", SID, "session.jsonl"),
      ].sort(),
    );
  });

  it("finds a session file by id without enumerating everything", () => {
    const filePath = writeTranscript(SID, "2026/10/10", [frame(intent("hello", 1791640525332173))]);
    const found = locator.findHistoricalSessionFilesById(SID);
    expect(found).toEqual([{ filePath, defaultCwd: "" }]);
    expect(locator.findHistoricalSessionFilesById("nope")).toEqual([]);
    expect(locator.findHistoricalSessionFilesById("../evil")).toEqual([]);
  });
});
