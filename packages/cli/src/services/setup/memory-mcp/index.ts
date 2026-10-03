import { homedir } from "os";
import type { McpServerDefinition, EnvironmentCode } from "../../../types.js";
import {
  ClaudeCodeMcpGenerator,
  CodexMcpGenerator,
  CursorMcpGenerator,
  GeminiMcpGenerator,
  OpenCodeMcpGenerator,
} from "../../install/mcp/generators.js";
import type { BaseMcpGenerator } from "../../install/mcp/BaseMcpGenerator.js";
import { grokGlobalMcpWriter } from "./grok-writer.js";
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

      if (plan.newServers.length === 0 && plan.conflictServers.length === 0) {
        return { status: "skipped", message: `Already configured in ~/${configPath}.` };
      }

      plan.resolvedConflicts = [...plan.conflictServers];
      await generator.apply(plan, servers, homeDir);
      return { status: "installed", message: `Configured in ~/${configPath}.` };
    },

    async inspect(homeDir: string): Promise<MemoryMcpInspectResult> {
      try {
        const plan = await generator.plan(serversOf(SPEC), homeDir);
        if (plan.newServers.length > 0) {
          return { state: "unwired" };
        }
        if (plan.conflictServers.length > 0) {
          return { state: "unwired", detail: "configured with a custom entry" };
        }
        return { state: "wired" };
      } catch (error) {
        return { state: "error", detail: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

import { MEMORY_MCP_SERVER as SPEC } from "./spec.js";

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

export type MemoryMcpEnvironment = EnvironmentCode | "grok";
