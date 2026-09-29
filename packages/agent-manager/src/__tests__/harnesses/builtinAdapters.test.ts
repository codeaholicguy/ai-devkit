import { AGENT_TYPES } from "../../adapters/AgentAdapter.js";
import { createBuiltinAdapters } from "../../harnesses/index.js";

describe("createBuiltinAdapters", () => {
  it("returns exactly one adapter per built-in agent type", () => {
    const adapters = createBuiltinAdapters();
    try {
      expect(adapters.map((adapter) => adapter.type).sort()).toEqual([...AGENT_TYPES].sort());
    } finally {
      for (const adapter of adapters) (adapter as { close?: () => void }).close?.();
    }
  });
});
