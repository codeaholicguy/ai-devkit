/**
 * Tests for harnesses/muse/MuseSessionParser.ts — framed transcript parsing.
 *
 * Muse session.jsonl lines are frames: either a direct inner record, a
 * `record_json` string, or a `retained_frame` wrapper whose children carry
 * `record_json` strings. Inner records dispatch on `payload_type`.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentStatus } from "../../../adapters/AgentAdapter.js";
import { MuseSessionParser } from "../../../harnesses/muse/MuseSessionParser.js";

const SID = "01a12618-d918-7b63-91c8-4e896326eb1a";

function frame(inner: unknown): string {
  return JSON.stringify(inner);
}

function wrapped(inner: unknown): string {
  return JSON.stringify({ record_json: JSON.stringify(inner) });
}

function retained(inner: unknown): string {
  return JSON.stringify({
    retained_frame: "session_permission_transaction",
    frame_schema_version: 1,
    children: [{ child_index: 0, record_json: JSON.stringify(inner) }],
  });
}

function intent(text: string, sequence: number, recordedAtUs: number): unknown {
  return {
    schema_version: 1,
    stream: { kind: "session", id: SID },
    sequence,
    recorded_at: recordedAtUs,
    record_type: "event",
    payload_type: "runtime.user_intent.accepted",
    payload: {
      intent_id: `intent-${sequence}`,
      refill_blocks: [{ kind: "text", text }],
    },
  };
}

function assistantMessage(text: string, sequence: number, recordedAtUs: number): unknown {
  return {
    schema_version: 1,
    stream: { kind: "session", id: SID },
    sequence,
    recorded_at: recordedAtUs,
    record_type: "event",
    payload_type: "runtime.session",
    payload: {
      kind: "run",
      run_id: "run-1",
      event: { kind: "assistant_message_committed", text },
    },
  };
}

function metadata(recordedAtUs: number): unknown {
  return {
    schema_version: 1,
    stream: { kind: "session", id: SID },
    sequence: 1,
    recorded_at: recordedAtUs,
    record_type: "event",
    payload_type: "runtime.session.metadata",
    payload: {
      kind: "metadata",
      record: { workspace_root: "/Users/tester/proj", model_id: "muse-spark-1.3" },
    },
  };
}

function nameChanged(name: string, sequence: number, recordedAtUs: number): unknown {
  return {
    schema_version: 1,
    stream: { kind: "session", id: SID },
    sequence,
    recorded_at: recordedAtUs,
    record_type: "event",
    payload_type: "session.name.changed",
    payload: { session_id: SID, previous_name: null, new_name: name },
  };
}

describe("MuseSessionParser", () => {
  let parser: MuseSessionParser;
  const tempDirs: string[] = [];

  beforeEach(() => {
    parser = new MuseSessionParser();
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
    tempDirs.length = 0;
  });

  function writeTranscript(lines: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muse-parser-test-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "session.jsonl");
    fs.writeFileSync(filePath, lines.join("\n"));
    return filePath;
  }

  it("returns null for missing or empty files", () => {
    expect(parser.readSession("/nonexistent/session.jsonl", "/proj")).toBeNull();
    expect(parser.readSession(writeTranscript([]), "/proj")).toBeNull();
  });

  it("skips unparseable lines and wrapper frames without records", () => {
    const filePath = writeTranscript([
      "not json at all",
      JSON.stringify({ retained_frame: "x", children: [] }),
      frame(intent("hello", 2, 1791640525332173)),
    ]);
    const session = parser.readSession(filePath, "/proj");
    expect(session?.lastUserMessage).toBe("hello");
  });

  it("unwraps record_json strings and retained children", () => {
    const filePath = writeTranscript([
      wrapped(intent("first", 2, 1791640525332173)),
      retained(intent("second", 3, 1791640525332174)),
    ]);
    const session = parser.readSession(filePath, "/proj");
    expect(session?.firstUserMessage).toBe("first");
    expect(session?.lastUserMessage).toBe("second");
  });

  it("reads workspace root, model, and display name", () => {
    const filePath = writeTranscript([
      frame(metadata(1791640525332173)),
      frame(intent("hi", 2, 1791640525332174)),
      frame(nameChanged("flowing-monoceros", 3, 1791640525332175)),
    ]);
    // Empty project path lets the recorded workspace root win (archive sessions).
    const session = parser.readSession(filePath, "");
    expect(session?.projectPath).toBe("/Users/tester/proj");
    expect(session?.modelId).toBe("muse-spark-1.3");
    expect(session?.displayName).toBe("flowing-monoceros");
    // First user message is found even when it is not on the first line.
    expect(session?.firstUserMessage).toBe("hi");
  });

  it("normalizes microsecond timestamps to millisecond dates", () => {
    const filePath = writeTranscript([frame(intent("hi", 2, 1791640525332173))]);
    const session = parser.readSession(filePath, "/proj");
    expect(session?.lastActive).toEqual(new Date(1791640525332));
  });

  it("maps last user intent to RUNNING and committed reply to WAITING", () => {
    const running = parser.readSession(
      writeTranscript([
        frame(intent("q", 2, 1791640525332173)),
        frame(assistantMessage("a", 3, 1791640525332174)),
        frame(intent("q2", 4, 1791640525332175)),
      ]),
      "/proj",
    );
    expect(parser.determineStatus(running!)).toBe(AgentStatus.RUNNING);

    const waiting = parser.readSession(
      writeTranscript([
        frame(intent("q", 2, 1791640525332173)),
        frame(assistantMessage("a", 3, 1791640525332174)),
      ]),
      "/proj",
    );
    expect(parser.determineStatus(waiting!)).toBe(AgentStatus.WAITING);
  });

  it("maps approval waits and terminal runs to WAITING and IDLE", () => {
    const waiting = parser.readSession(
      writeTranscript([
        frame({
          schema_version: 1,
          stream: { kind: "session", id: SID },
          sequence: 2,
          recorded_at: 1791640525332173,
          record_type: "event",
          payload_type: "runtime.session",
          payload: {
            kind: "run",
            run_id: "run-1",
            event: { kind: "approval_wait.effect.started", tool_name: "edit" },
          },
        }),
      ]),
      "/proj",
    );
    expect(parser.determineStatus(waiting!)).toBe(AgentStatus.WAITING);

    const idle = parser.readSession(
      writeTranscript([
        frame({
          schema_version: 1,
          stream: { kind: "session", id: SID },
          sequence: 2,
          recorded_at: 1791640525332173,
          record_type: "event",
          payload_type: "runtime.session",
          payload: { kind: "run", run_id: "run-1", event: { kind: "terminal" } },
        }),
      ]),
      "/proj",
    );
    expect(parser.determineStatus(idle!)).toBe(AgentStatus.IDLE);
  });

  it("returns UNKNOWN when no conversation signal exists", () => {
    const session = parser.readSession(
      writeTranscript([frame(metadata(1791640525332173))]),
      "/proj",
    );
    expect(parser.determineStatus(session!)).toBe(AgentStatus.UNKNOWN);
  });

  it("getConversation returns ordered messages and honors tail", () => {
    const filePath = writeTranscript([
      frame(metadata(1791640525332173)),
      frame(intent("first question", 2, 1791640525332174)),
      frame(assistantMessage("first answer", 3, 1791640525332175)),
      frame(intent("second question", 4, 1791640525332176)),
    ]);
    const full = parser.getConversation(filePath);
    expect(full.map((m) => [m.role, m.content])).toEqual([
      ["user", "first question"],
      ["assistant", "first answer"],
      ["user", "second question"],
    ]);
    const tail = parser.getConversation(filePath, { tail: 1 });
    expect(tail).toEqual([
      { role: "user", content: "second question", timestamp: expect.anything() },
    ]);
  });

  it("returns [] for a missing transcript and tool calls in verbose mode", () => {
    expect(parser.getConversation("/nonexistent/session.jsonl")).toEqual([]);
    const filePath = writeTranscript([
      frame({
        schema_version: 1,
        stream: { kind: "session", id: SID },
        sequence: 2,
        recorded_at: 1791640525332173,
        record_type: "event",
        payload_type: "runtime.session",
        payload: {
          kind: "run",
          run_id: "run-1",
          event: {
            kind: "assistant_tool_calls_committed",
            tool_calls: [{ tool_name: "read_file" }, { tool_name: "search" }],
          },
        },
      }),
    ]);
    expect(parser.getConversation(filePath)).toEqual([]);
    expect(parser.getConversation(filePath, { verbose: true })).toEqual([
      {
        role: "assistant",
        content: "tool calls: read_file, search",
        timestamp: expect.anything(),
      },
    ]);
  });
});
