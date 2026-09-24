import { describe, expect, it } from "vitest";

import { AgentStatus, type ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { GrokAgentMapper } from "../../../providers/grok/GrokAgentMapper.js";
import type { GrokSession } from "../../../providers/grok/GrokSessionParser.js";

function makeProcess(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
  return { pid: 123, command: "grok", cwd: "/repo/my-app", tty: "ttys001", ...overrides };
}

function makeSession(overrides: Partial<GrokSession> = {}): GrokSession {
  return {
    sessionId: "session-1",
    projectPath: "/repo/my-app",
    sessionFilePath: "/home/.grok/sessions/%2Frepo%2Fmy-app/session-1/chat_history.jsonl",
    sessionStart: new Date(),
    lastActive: new Date(),
    lastUserMessage: "Review this change",
    lastRole: "assistant",
    ...overrides,
  };
}

describe("GrokAgentMapper", () => {
  const mapper = new GrokAgentMapper();

  it("maps a session to a grok_cli agent pointing at chat_history.jsonl", () => {
    const agent = mapper.mapSessionToAgent({
      session: makeSession(),
      processInfo: makeProcess(),
    });

    expect(agent).toMatchObject({
      name: "my-app-123",
      type: "grok_cli",
      status: AgentStatus.WAITING,
      summary: "Review this change",
      pid: 123,
      projectPath: "/repo/my-app",
      sessionId: "session-1",
      sessionFilePath: "/home/.grok/sessions/%2Frepo%2Fmy-app/session-1/chat_history.jsonl",
    });
  });

  it("maps a process-only agent as RUNNING with a pid session id", () => {
    const agent = mapper.mapProcessOnlyAgent(makeProcess(), "/repo/resolved");

    expect(agent).toMatchObject({
      type: "grok_cli",
      status: AgentStatus.RUNNING,
      summary: "Grok CLI process running",
      projectPath: "/repo/resolved",
      sessionId: "pid-123",
    });
    expect(agent.sessionFilePath).toBeUndefined();
  });
});
