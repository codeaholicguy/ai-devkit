import { describe, expect, it } from "vitest";
import { AgentStatus, type ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { DevinAgentMapper } from "../../../harnesses/devin/DevinAgentMapper.js";
import type { DevinSession } from "../../../harnesses/devin/DevinSessionLocator.js";

const DB_PATH = "/data/devin/cli/sessions.db";

function session(overrides: Partial<DevinSession> = {}): DevinSession {
  return {
    sessionId: "brawny-shirt",
    directory: "/repo",
    title: null,
    timeCreated: Date.now() - 60_000,
    lastActivityAt: Date.now() - 30_000,
    ...overrides,
  };
}

function proc(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
  return { pid: 42, command: "devin", cwd: "/repo", tty: "ttys001", ...overrides };
}

describe("DevinAgentMapper", () => {
  const mapper = new DevinAgentMapper(DB_PATH);

  it("maps a session to a waiting agent when the frontier node is assistant", () => {
    const agent = mapper.mapSessionToAgent(
      session(),
      { lastRole: "assistant", lastTimeUpdated: Date.now() - 1000, summary: "fix tests" },
      proc(),
    );

    expect(agent).toMatchObject({
      type: "devin",
      status: AgentStatus.WAITING,
      pid: 42,
      projectPath: "/repo",
      sessionId: "brawny-shirt",
      summary: "fix tests",
      sessionFilePath: `${DB_PATH}::brawny-shirt`,
    });
  });

  it("maps running status for user/tool frontier nodes", () => {
    for (const lastRole of ["user", "tool", null]) {
      const agent = mapper.mapSessionToAgent(
        session(),
        { lastRole, lastTimeUpdated: Date.now() - 1000, summary: "" },
        proc(),
      );
      expect(agent.status).toBe(AgentStatus.RUNNING);
    }
  });

  it("marks stale sessions idle", () => {
    const agent = mapper.mapSessionToAgent(
      session(),
      {
        lastRole: "assistant",
        lastTimeUpdated: Date.now() - 10 * 60 * 1000,
        summary: "",
      },
      proc(),
    );
    expect(agent.status).toBe(AgentStatus.IDLE);
  });

  it("falls back to session title then directory for summary and project path", () => {
    const agent = mapper.mapSessionToAgent(
      session({ title: "Hello Greeting Session" }),
      { lastRole: "assistant", lastTimeUpdated: 0, summary: "" },
      proc({ cwd: "/elsewhere" }),
    );
    expect(agent.summary).toBe("Hello Greeting Session");
    expect(agent.projectPath).toBe("/repo");
  });

  it("maps a process-only agent", () => {
    const agent = mapper.mapProcessOnlyAgent(proc({ pid: 7 }));
    expect(agent).toMatchObject({
      type: "devin",
      status: AgentStatus.RUNNING,
      pid: 7,
      sessionId: "pid-7",
      summary: "Devin process running",
    });
  });
});
