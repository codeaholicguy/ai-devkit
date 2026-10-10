import { AgentStatus } from "../../../adapters/AgentAdapter.js";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import type { SessionFile } from "../../../utils/session.js";
import { MuseAgentMapper } from "../../../harnesses/muse/MuseAgentMapper.js";
import type { MuseSession } from "../../../harnesses/muse/MuseSessionParser.js";

const SID = "01a12618-d918-7b63-91c8-4e896326eb1a";

function session(overrides: Partial<MuseSession> = {}): MuseSession {
  return {
    sessionId: SID,
    projectPath: "/Users/tester/proj",
    sessionStart: new Date("2026-10-10T13:55:25.332Z"),
    lastActive: new Date("2026-10-10T14:00:00.000Z"),
    lastSignal: "assistant",
    lastUserMessage: "what is this repo about",
    firstUserMessage: "what is this repo about",
    ...overrides,
  };
}

function sessionFile(): SessionFile {
  return {
    sessionId: SID,
    filePath: `/home/tester/.local/share/muse/sessions/2026/10/10/${SID}/session.jsonl`,
    projectDir: `/home/tester/.local/share/muse/sessions/2026/10/10/${SID}`,
    birthtimeMs: 1791640525332,
    resolvedCwd: "/Users/tester/proj",
  };
}

function proc(): ProcessInfo {
  return {
    pid: 16174,
    command: "/Users/tester/.local/bin/muse-bin-1.4.4-R5419.1",
    cwd: "/Users/tester/proj",
    tty: "ttys001",
  };
}

describe("MuseAgentMapper", () => {
  const mapper = new MuseAgentMapper();

  it("maps a session to a project-named agent", () => {
    const agent = mapper.mapSessionToAgent({
      session: session(),
      processInfo: proc(),
      sessionFile: sessionFile(),
    });
    expect(agent).toMatchObject({
      name: "proj-16174",
      type: "muse",
      status: AgentStatus.WAITING,
      summary: "what is this repo about",
      pid: 16174,
      projectPath: "/Users/tester/proj",
      sessionId: SID,
    });
    expect(agent.lastActive).toEqual(new Date("2026-10-10T14:00:00.000Z"));
    expect(agent.sessionFilePath).toContain("session.jsonl");
  });

  it("falls back to a started summary and process cwd without workspace root", () => {
    const agent = mapper.mapSessionToAgent({
      session: session({ projectPath: "", lastUserMessage: undefined, lastSignal: undefined }),
      processInfo: proc(),
      sessionFile: { ...sessionFile(), resolvedCwd: "" },
    });
    expect(agent.summary).toBe("Session started");
    expect(agent.projectPath).toBe("/Users/tester/proj");
    expect(agent.status).toBe(AgentStatus.UNKNOWN);
  });

  it("maps an unmatched process to a running placeholder", () => {
    const agent = mapper.mapProcessOnlyAgent(proc());
    expect(agent).toMatchObject({
      type: "muse",
      status: AgentStatus.RUNNING,
      pid: 16174,
      sessionId: "pid-16174",
    });
  });
});
