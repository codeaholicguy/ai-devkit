import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AGENT_TYPES } from "../../adapters/AgentAdapter.js";
import { createBuiltinAdapters } from "../../harnesses/index.js";
import { AgentRegistry } from "../../utils/AgentRegistry.js";

describe("createBuiltinAdapters", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builtin-adapters-"));
    // Several adapters default to AgentRegistry.default(), which opens ~/.ai-devkit/agents.db.
    vi.spyOn(AgentRegistry, "default").mockReturnValue(
      new AgentRegistry(path.join(tmpDir, "agents.json")),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns exactly one adapter per built-in agent type", () => {
    const adapters = createBuiltinAdapters();
    try {
      expect(adapters.map((adapter) => adapter.type).sort()).toEqual([...AGENT_TYPES].sort());
    } finally {
      for (const adapter of adapters) (adapter as { close?: () => void }).close?.();
    }
  });
});
