import type { McpServerDefinition } from "../../../types.js";
import { ClaudeCodeMcpGenerator } from "../../install/mcp/ClaudeCodeMcpGenerator.js";
import { CodexMcpGenerator } from "../../install/mcp/CodexMcpGenerator.js";
import { CursorMcpGenerator } from "../../install/mcp/CursorMcpGenerator.js";
import { GeminiMcpGenerator } from "../../install/mcp/GeminiMcpGenerator.js";
import { OpenCodeMcpGenerator } from "../../install/mcp/OpenCodeMcpGenerator.js";
import type { BaseMcpGenerator } from "../../install/mcp/BaseMcpGenerator.js";
import type { McpMergePlan } from "../../install/mcp/types.js";
import { grokGlobalMcpWriter } from "./grok-writer.js";
import { MEMORY_MCP_SERVER } from "./spec.js";
import type {
  GlobalMcpWriter,
  MemoryMcpApplyResult,
  MemoryMcpInspectResult,
  MemoryMcpServerSpec,
} from "./spec.js";

export { MEMORY_MCP_SERVER, MCP_CAPABLE_AGENTS, MCP_UNSUPPORTED_AGENTS } from "./spec.js";
export type {
  GlobalMcpWriter,
  MemoryMcpApplyResult,
  MemoryMcpApplyStatus,
  MemoryMcpInspectResult,
  MemoryMcpInspectState,
  MemoryMcpServerSpec,
} from "./spec.js";

function toDefinition(spec: MemoryMcpServerSpec): McpServerDefinition {
  return { transport: "stdio", command: spec.command, args: [...spec.args] };
}

/** Shared interpretation of a single-server merge plan in our namespace. */
type PlanState = "present" | "missing" | "conflict";

/**
 * Interpret a merge plan for OUR server name only: `missing` (not
 * configured), `conflict` (configured with a custom entry), or `present`
 * (already matches the canonical memory server definition). Single source
 * of truth for both apply (skip vs install) and inspect (wired vs unwired).
 */
function planToState(plan: McpMergePlan): PlanState {
  if (plan.newServers.length > 0) {
    return "missing";
  }
  if (plan.conflictServers.length > 0) {
    return "conflict";
  }
  return "present";
}

/**
 * Adapts a user-scope install/mcp generator to the setup-facing
 * GlobalMcpWriter contract. Reuses toAgentFormat + plan/apply diff-and-merge;
 * drift on OUR server name is always overwritten (our namespace only) and
 * setup never prompts.
 */
function generatorAsWriter(generator: BaseMcpGenerator, configPath: string): GlobalMcpWriter {
  const serversOf = (spec: MemoryMcpServerSpec) => ({ [spec.name]: toDefinition(spec) });

  return {
    agent: generator.agentType,
    configPath,

    async apply(spec: MemoryMcpServerSpec, homeDir: string): Promise<MemoryMcpApplyResult> {
      const servers = serversOf(spec);
      const plan = await generator.plan(servers, homeDir);

      if (planToState(plan) === "present") {
        return { status: "skipped", message: `Already configured in ~/${configPath}.` };
      }

      plan.resolvedConflicts = [...plan.conflictServers];
      await generator.apply(plan, servers, homeDir);
      return { status: "installed", message: `Configured in ~/${configPath}.` };
    },

    async inspect(homeDir: string): Promise<MemoryMcpInspectResult> {
      try {
        const state = planToState(await generator.plan(serversOf(MEMORY_MCP_SERVER), homeDir));
        if (state === "missing") {
          return { state: "unwired" };
        }
        if (state === "conflict") {
          return { state: "unwired", detail: "configured with a custom entry" };
        }
        return { state: "wired" };
      } catch (error) {
        return { state: "error", detail: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

const WRITERS: Record<string, GlobalMcpWriter> = {
  claude: generatorAsWriter(new ClaudeCodeMcpGenerator("user"), ".claude.json"),
  codex: generatorAsWriter(new CodexMcpGenerator("user"), ".codex/config.toml"),
  gemini: generatorAsWriter(new GeminiMcpGenerator("user"), ".gemini/settings.json"),
  cursor: generatorAsWriter(new CursorMcpGenerator("user"), ".cursor/mcp.json"),
  opencode: generatorAsWriter(new OpenCodeMcpGenerator("user"), ".config/opencode/opencode.json"),
  grok: grokGlobalMcpWriter,
};

export function getGlobalMcpWriter(agent: string): GlobalMcpWriter | undefined {
  return WRITERS[agent];
}
