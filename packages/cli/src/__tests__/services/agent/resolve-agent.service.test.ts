import { AgentStatus, type AgentInfo } from "@ai-devkit/agent-manager";
import {
  assertDurableNameUnambiguous,
  reportAgentResolution,
  resolveAgentByName,
  type AgentResolutionReporter,
} from "../../../services/agent/resolve-agent.service.js";

function makeAgent(name: string): AgentInfo {
  return {
    name,
    type: "codex",
    status: AgentStatus.RUNNING,
  } as AgentInfo;
}

function makeManager(agents: AgentInfo[], resolved: AgentInfo | AgentInfo[] | null) {
  return {
    listAgents: async () => agents,
    resolveAgent: (_id: string, _agents: AgentInfo[]) => resolved,
  };
}

function makeReporter() {
  const calls: { channel: string; text: string }[] = [];
  const reporter: AgentResolutionReporter = {
    error: (text) => calls.push({ channel: "error", text }),
    info: (text) => calls.push({ channel: "info", text }),
    text: (text) => calls.push({ channel: "text", text }),
  };
  return { reporter, calls };
}

describe("resolveAgentByName", () => {
  it("returns empty when no agents are running", async () => {
    const result = await resolveAgentByName(makeManager([], null), "foo");
    expect(result).toEqual({ kind: "empty", agents: [] });
  });

  it("returns not-found when nothing matches", async () => {
    const agents = [makeAgent("a"), makeAgent("b")];
    const result = await resolveAgentByName(makeManager(agents, null), "zzz");
    expect(result).toEqual({ kind: "not-found", agents });
  });

  it("returns ambiguous when several agents match", async () => {
    const agents = [makeAgent("api-1"), makeAgent("api-2")];
    const result = await resolveAgentByName(makeManager(agents, agents), "api");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.matches).toEqual(agents);
  });

  it("returns resolved for a single match", async () => {
    const agent = makeAgent("api-1");
    const result = await resolveAgentByName(makeManager([agent], agent), "api-1");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.agent).toBe(agent);
  });
});

describe("reportAgentResolution", () => {
  it("reports empty as an error", async () => {
    const { reporter, calls } = makeReporter();
    reportAgentResolution(await resolveAgentByName(makeManager([], null), "x"), "x", reporter);
    expect(calls).toEqual([{ channel: "error", text: "No running agents found." }]);
  });

  it("reports not-found with the candidate list", async () => {
    const agents = [makeAgent("a"), makeAgent("b")];
    const { reporter, calls } = makeReporter();
    reportAgentResolution(
      await resolveAgentByName(makeManager(agents, null), "zzz"),
      "zzz",
      reporter,
    );
    expect(calls).toEqual([
      { channel: "error", text: 'No agent found matching "zzz".' },
      { channel: "info", text: "Available agents:" },
      { channel: "text", text: "  - a" },
      { channel: "text", text: "  - b" },
    ]);
  });

  it("reports ambiguous matches with a formatter", async () => {
    const agents = [makeAgent("api-1"), makeAgent("api-2")];
    const { reporter, calls } = makeReporter();
    reportAgentResolution(
      await resolveAgentByName(makeManager(agents, agents), "api"),
      "api",
      reporter,
      (agent) => `${agent.name} (Running)`,
    );
    expect(calls).toEqual([
      { channel: "error", text: 'Multiple agents match "api":' },
      { channel: "text", text: "  - api-1 (Running)" },
      { channel: "text", text: "  - api-2 (Running)" },
      { channel: "info", text: "Please use a more specific name." },
    ]);
  });

  it("stays silent for resolved results", async () => {
    const agent = makeAgent("a");
    const { reporter, calls } = makeReporter();
    reportAgentResolution(
      await resolveAgentByName(makeManager([agent], agent), "a"),
      "a",
      reporter,
    );
    expect(calls).toEqual([]);
  });
});

describe("assertDurableNameUnambiguous", () => {
  it("allows an exact durable id match even when a live agent shares the name", () => {
    expect(() =>
      assertDurableNameUnambiguous("durable-id", "durable-id", [makeAgent("durable-id")]),
    ).not.toThrow();
  });

  it("throws when a partial id matches a durable entry and a live agent name", () => {
    expect(() =>
      assertDurableNameUnambiguous("partial", "durable-id", [makeAgent("partial")]),
    ).toThrow(/ambiguous across interactive and durable modes/);
  });

  it("passes when no live agent collides", () => {
    expect(() =>
      assertDurableNameUnambiguous("partial", "durable-id", [makeAgent("other")]),
    ).not.toThrow();
  });
});
