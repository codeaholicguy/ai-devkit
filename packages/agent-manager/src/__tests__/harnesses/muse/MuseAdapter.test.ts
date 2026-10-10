/**
 * Tests for harnesses/muse/MuseAdapter.ts — detection through the real
 * locator/parser/mapper against a fake Muse home (no mocks).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentStatus } from "../../../adapters/AgentAdapter.js";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { MuseAdapter } from "../../../harnesses/muse/MuseAdapter.js";

const SID = "01a12618-d918-7b63-91c8-4e896326eb1a";
const PROJECT = "codeaholicguy/Code/ai-devkit";

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

describe("MuseAdapter", () => {
  let home: string;
  let adapter: MuseAdapter;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "muse-adapter-test-"));
    adapter = new MuseAdapter({ homeDir: home });
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  function writeTranscript(lines: string[]): string {
    const dir = path.join(home, ".local", "share", "muse", "sessions", "2026/10/10", SID);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "session.jsonl");
    fs.writeFileSync(filePath, lines.join("\n"));
    return filePath;
  }

  function writeRuntimeFile(pid: number): void {
    const dir = path.join(home, ".local", "share", "muse", "runtime", "muse", "sessions");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${SID}.json`),
      JSON.stringify({ schema_version: 1, session_id: SID, process_generation_hint: `pid=${pid}` }),
    );
  }

  function proc(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
    return {
      pid: 16174,
      command: "/Users/tester/.local/bin/muse-bin-1.4.4-R5419.1",
      cwd: `/Users/tester/${PROJECT}`,
      tty: "ttys001",
      startTime: new Date(),
      ...overrides,
    };
  }

  it("handles versioned launcher commands and rejects others", () => {
    expect(adapter.canHandle(proc())).toBe(true);
    expect(adapter.canHandle(proc({ command: "/usr/local/bin/muse" }))).toBe(true);
    expect(adapter.canHandle(proc({ command: "/usr/local/bin/claude" }))).toBe(false);
    expect(adapter.canHandle(proc({ command: "/usr/bin/museums" }))).toBe(false);
  });

  it("detects a live session through the runtime file", async () => {
    const filePath = writeTranscript([
      frame({
        schema_version: 1,
        stream: { kind: "session", id: SID },
        sequence: 1,
        recorded_at: 1791640525332173,
        record_type: "event",
        payload_type: "runtime.session.metadata",
        payload: {
          kind: "metadata",
          record: { workspace_root: `/Users/tester/${PROJECT}` },
        },
      }),
      frame(intent("hello", 1791640525332174)),
    ]);
    writeRuntimeFile(16174);
    const start = new Date(fs.statSync(filePath).birthtimeMs);

    const agents = await adapter.detectAgents({ processes: [proc({ startTime: start })] });
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "muse",
      pid: 16174,
      sessionId: SID,
      projectPath: `/Users/tester/${PROJECT}`,
      summary: "hello",
    });
    expect(agents[0].sessionFilePath).toBe(filePath);
  });

  it("matches a process by cwd and birthtime without a runtime file", async () => {
    const filePath = writeTranscript([
      frame({
        schema_version: 1,
        stream: { kind: "session", id: SID },
        sequence: 1,
        recorded_at: 1791640525332173,
        record_type: "event",
        payload_type: "runtime.session.metadata",
        payload: {
          kind: "metadata",
          record: { workspace_root: `/Users/tester/${PROJECT}` },
        },
      }),
      frame(intent("legacy hello", 1791640525332174)),
    ]);
    const start = new Date(fs.statSync(filePath).birthtimeMs);

    const agents = await adapter.detectAgents({
      processes: [proc({ pid: 7777, startTime: start })],
    });
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "muse",
      pid: 7777,
      sessionId: SID,
      summary: "legacy hello",
    });
  });

  it("skips transcripts with no conversation signal in history", async () => {
    writeTranscript([
      frame({
        schema_version: 1,
        stream: { kind: "session", id: SID },
        sequence: 1,
        recorded_at: 1791640525332173,
        record_type: "event",
        payload_type: "runtime.session.metadata",
        payload: { kind: "metadata", record: { workspace_root: "/Users/tester/empty" } },
      }),
    ]);
    expect(await adapter.listSessions()).toEqual([]);
  });

  it("reports an unmatched process as a running placeholder", async () => {
    const agents = await adapter.detectAgents({ processes: [proc({ pid: 4242 })] });
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "muse",
      status: AgentStatus.RUNNING,
      sessionId: "pid-4242",
    });
  });

  it("lists historical sessions with strict cwd filtering", async () => {
    writeTranscript([
      frame({
        schema_version: 1,
        stream: { kind: "session", id: SID },
        sequence: 1,
        recorded_at: 1791640525332173,
        record_type: "event",
        payload_type: "runtime.session.metadata",
        payload: {
          kind: "metadata",
          record: { workspace_root: `/Users/tester/${PROJECT}` },
        },
      }),
      frame(intent("hello", 1791640525332174)),
    ]);

    const all = await adapter.listSessions();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      type: "muse",
      sessionId: SID,
      cwd: `/Users/tester/${PROJECT}`,
      firstUserMessage: "hello",
    });

    expect(await adapter.listSessions({ cwd: "/elsewhere" })).toEqual([]);
    const found = await adapter.findSessionsById(SID);
    expect(found.map((s) => s.sessionId)).toEqual([SID]);
    expect(await adapter.findSessionsById("00000000-0000-0000-0000-000000000000")).toEqual([]);
  });
});
