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
