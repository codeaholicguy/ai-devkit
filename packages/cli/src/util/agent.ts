import path from "path";
import type { AgentType } from "@ai-devkit/agent-manager";

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  claude: "Claude Code",
  codex: "Codex",
  copilot: "Copilot",
  gemini_cli: "Gemini CLI",
  grok_cli: "Grok CLI",
  kiro: "Kiro",
  antigravity_cli: "Antigravity CLI",
  opencode: "OpenCode",
  pi: "Pi",
  devin: "Devin",
  other: "Other",
};

export function agentTypeLabel(type: AgentType): string {
  return AGENT_TYPE_LABELS[type] ?? type;
}

/** Compact lowercase labels for dense UI rows (agent list, status lines). */
export const AGENT_TYPE_LABELS_COMPACT: Record<AgentType, string> = {
  claude: "claude",
  codex: "codex",
  copilot: "copilot",
  gemini_cli: "gemini",
  grok_cli: "grok",
  kiro: "kiro",
  antigravity_cli: "antigravity",
  opencode: "opencode",
  pi: "pi",
  devin: "devin",
  other: "other",
};

export function agentTypeLabelCompact(type: string): string {
  return (AGENT_TYPE_LABELS_COMPACT as Record<string, string>)[type] ?? type;
}

/** Agent (and agent-group) names: lowercase alphanumeric + hyphens, 2-64 chars, no leading/trailing hyphen. */
export const AGENT_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

export function generateAgentName(cwd: string): string {
  const folder =
    path
      .basename(cwd)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "agent";
  return `${folder}-${Date.now().toString(36)}`;
}
