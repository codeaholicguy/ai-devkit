import { describe, expect, it } from "vitest";
import { AgentStatus } from "../../../adapters/AgentAdapter.js";
import { OpenCodeAgentMapper } from "../../../providers/opencode/OpenCodeAgentMapper.js";

describe("OpenCodeAgentMapper", () => {
  const mapper = new OpenCodeAgentMapper("/tmp/opencode.db");

  it("maps completed assistant sessions as waiting", () => {
    const now = Date.now();

    const agent = mapper.mapSessionToAgent(
      { sessionId: "sess-1", directory: "/repo", timeCreated: now - 60_000 },
      {
        lastRole: "assistant",
        lastTimeUpdated: now - 30_000,
        lastAssistantCompleted: true,
        lastAssistantErrored: false,
        summary: "Ship the feature",
      },
      { pid: 123, command: "opencode", cwd: "/repo" },
    );

    expect(agent).toMatchObject({
      type: "opencode",
      status: AgentStatus.WAITING,
      summary: "Ship the feature",
      pid: 123,
      projectPath: "/repo",
      sessionId: "sess-1",
      sessionFilePath: "/tmp/opencode.db::sess-1",
    });
  });

  it("keeps incomplete assistant sessions running even when they are quiet briefly", () => {
    const now = Date.now();

    const agent = mapper.mapSessionToAgent(
      { sessionId: "sess-2", directory: "/repo", timeCreated: now - 120_000 },
      {
        lastRole: "assistant",
        lastTimeUpdated: now - 120_000,
        lastAssistantCompleted: false,
        lastAssistantErrored: false,
        summary: "",
      },
      { pid: 124, command: "opencode", cwd: "/repo" },
    );

    expect(agent.status).toBe(AgentStatus.RUNNING);
    expect(agent.summary).toBe("OpenCode session active");
  });

  it("marks stale sessions idle", () => {
    const staleTime = Date.now() - 10 * 60 * 1000;

    const agent = mapper.mapSessionToAgent(
      { sessionId: "sess-3", directory: "/old", timeCreated: staleTime },
      {
        lastRole: "assistant",
        lastTimeUpdated: staleTime,
        lastAssistantCompleted: true,
        lastAssistantErrored: false,
        summary: "",
      },
      { pid: 125, command: "opencode", cwd: "/old" },
    );

    expect(agent.status).toBe(AgentStatus.IDLE);
  });

  it("maps unmatched processes as running process-only agents", () => {
    const agent = mapper.mapProcessOnlyAgent({ pid: 500, command: "opencode", cwd: "/repo" });

    expect(agent).toMatchObject({
      type: "opencode",
      status: AgentStatus.RUNNING,
      summary: "OpenCode process running",
      pid: 500,
      projectPath: "/repo",
      sessionId: "pid-500",
    });
  });
});
