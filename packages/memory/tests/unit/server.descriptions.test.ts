import { describe, expect, it } from "vitest";
import { TOOLS } from "../../src/server.js";

const SEARCH = TOOLS.find((tool) => tool.name === "memory_searchKnowledge")!;
const STORE = TOOLS.find((tool) => tool.name === "memory_storeKnowledge")!;
const UPDATE = TOOLS.find((tool) => tool.name === "memory_updateKnowledge")!;

describe("memory MCP tool descriptions (always-loaded prompt surface)", () => {
  it("keeps the three tool names and schemas stable", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "memory_storeKnowledge",
      "memory_updateKnowledge",
      "memory_searchKnowledge",
    ]);
    expect(Object.keys(SEARCH.inputSchema.properties)).toEqual([
      "query",
      "contextTags",
      "scope",
      "limit",
      "explain",
    ]);
  });

  it("instructs the agent to search BEFORE non-trivial tasks, with an example", () => {
    expect(SEARCH.description).toMatch(/BEFORE starting any non-trivial task/i);
    expect(SEARCH.description).toMatch(/e\.g\.|example|such as/i);
    expect(SEARCH.description!.length).toBeGreaterThan(80);
  });

  it("instructs the agent to store verified reusable knowledge after meaningful work", () => {
    expect(STORE.description).toMatch(
      /after completing|when you (have )?(just )?(verified|learned|solved)/i,
    );
    expect(STORE.description).toMatch(/reusable/i);
  });

  it("instructs the agent to update instead of duplicating when knowledge is wrong", () => {
    expect(UPDATE.description).toMatch(/instead of (storing|creating) (a )?(duplicate|new)/i);
  });
});
