export interface MemoryMcpServerSpec {
  /** Server name/key used in every harness config. */
  name: string;
  command: string;
  args: string[];
}

/**
 * Canonical launch definition for the ai-devkit memory MCP server.
 *
 * `npx -y @ai-devkit/memory` runs the published `ai-devkit-memory` bin at the
 * latest version from the npm cache/registry, so user configs never churn on
 * release and memory works in every harness with zero manual steps.
 */
export const MEMORY_MCP_SERVER: MemoryMcpServerSpec = {
  name: "ai-devkit-memory",
  command: "npx",
  args: ["-y", "@ai-devkit/memory"],
};

/** Agents with a verified user-level MCP config surface. */
export const MCP_CAPABLE_AGENTS = [
  "claude",
  "codex",
  "gemini",
  "cursor",
  "opencode",
  "grok",
] as const;

/** Agents that verifiably have no MCP support, with the honest skip reason. */
export const MCP_UNSUPPORTED_AGENTS: Record<string, string> = {
  pi: "pi has no MCP support by design. Use the 'memory' skill or 'ai-devkit memory' CLI instead.",
};

export type MemoryMcpApplyStatus = "installed" | "skipped";

export interface MemoryMcpApplyResult {
  status: MemoryMcpApplyStatus;
  message: string;
}

export type MemoryMcpInspectState = "wired" | "unwired" | "error";

export interface MemoryMcpInspectResult {
  state: MemoryMcpInspectState;
  detail?: string;
}

export interface GlobalMcpWriter {
  readonly agent: string;
  /** Config path relative to the user's home directory. */
  readonly configPath: string;
  apply(spec: MemoryMcpServerSpec, homeDir: string): Promise<MemoryMcpApplyResult>;
  inspect(homeDir: string): Promise<MemoryMcpInspectResult>;
}
