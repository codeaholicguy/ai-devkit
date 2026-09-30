import { describe, expect, it } from "vitest";
import { DurableAgentBusyError } from "../../durable/DurableAgent.js";

describe("durable-agent errors", () => {
  it("classifies a busy error without exposing prompt data", () => {
    const error = new DurableAgentBusyError("agent-id", "reviewer");

    expect(error).toMatchObject({
      name: "DurableAgentBusyError",
      code: "DURABLE_AGENT_BUSY",
      agentId: "agent-id",
      message: 'Durable agent "reviewer" is busy.',
    });
  });
});
