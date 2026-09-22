import type { AgentInfo, AgentType } from "../../adapters/AgentAdapter.js";
import { HerdrCliClient, type HerdrCommandRunner } from "./HerdrCliClient.js";
import type { HerdrRuntimeRef } from "./HerdrRuntimeRef.js";

export interface HerdrAgentPane {
  agent: string;
  agentSessionId?: string;
  cwd?: string;
  paneId: string;
  workspaceId?: string;
  tabId?: string;
  foregroundPids?: number[];
  shellPid?: number;
}

export async function fetchHerdrAgentPanes(runner?: HerdrCommandRunner): Promise<HerdrAgentPane[]> {
  const client = new HerdrCliClient(runner);
  const response = await client.runJson(["pane", "list"]);
  return enrichHerdrAgentPanes(client, extractHerdrAgentPanes(response));
}

export function extractHerdrAgentPanes(value: unknown): HerdrAgentPane[] {
  const snapshot = getObject(value, ["result", "snapshot"]);
  const rawPanes = getArray(value, ["result", "panes"]) ?? snapshot?.agents;
  if (!Array.isArray(rawPanes)) return [];

  const panes: HerdrAgentPane[] = [];
  for (const rawPane of rawPanes) {
    if (!rawPane || typeof rawPane !== "object" || Array.isArray(rawPane)) continue;
    const pane = rawPane as Record<string, unknown>;
    const agent = nonEmptyString(pane.agent);
    const paneId = nonEmptyString(pane.pane_id);
    if (!agent || !paneId) continue;

    const session = getObject(pane, ["agent_session"]);
    const agentSessionId = nonEmptyString(session?.value);
    const cwd = nonEmptyString(pane.cwd);
    const workspaceId = nonEmptyString(pane.workspace_id);
    const tabId = nonEmptyString(pane.tab_id);

    panes.push({
      agent,
      paneId,
      ...(agentSessionId ? { agentSessionId } : {}),
      ...(cwd ? { cwd } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(tabId ? { tabId } : {}),
    });
  }

  return panes;
}

export function findMatchingHerdrPane(
  agent: Pick<AgentInfo, "type" | "projectPath" | "sessionId" | "pid">,
  panes: readonly HerdrAgentPane[],
): HerdrAgentPane | null {
  if (agent.sessionId) {
    const sessionMatches = panes.filter((pane) => pane.agentSessionId === agent.sessionId);
    if (sessionMatches.length === 1) return sessionMatches[0]!;
    if (sessionMatches.length > 1) return null;
  }

  const foregroundPidMatches = panes.filter((pane) => pane.foregroundPids?.includes(agent.pid));
  if (foregroundPidMatches.length === 1) return foregroundPidMatches[0]!;
  if (foregroundPidMatches.length > 1) return null;

  const shellPidMatches = panes.filter((pane) => pane.shellPid === agent.pid);
  if (shellPidMatches.length === 1) return shellPidMatches[0]!;
  if (shellPidMatches.length > 1) return null;

  const cwdMatches = panes.filter(
    (pane) => pane.cwd === agent.projectPath && herdrAgentMatchesType(pane.agent, agent.type),
  );
  return cwdMatches.length === 1 ? cwdMatches[0]! : null;
}

export function herdrPaneToRuntimeRef(pane: HerdrAgentPane, agentName: string): HerdrRuntimeRef {
  return {
    session: "default",
    paneId: pane.paneId,
    agentName,
    ...(pane.workspaceId ? { workspaceId: pane.workspaceId } : {}),
    ...(pane.tabId ? { tabId: pane.tabId } : {}),
  };
}

function herdrAgentMatchesType(herdrAgent: string, agentType: AgentType): boolean {
  const normalized = herdrAgent.toLowerCase();
  const candidates: Record<AgentType, readonly string[]> = {
    claude: ["claude"],
    codex: ["codex"],
    copilot: ["copilot"],
    gemini_cli: ["gemini", "gemini_cli"],
    grok_cli: ["grok", "grok_cli"],
    kiro: ["kiro", "kiro_cli", "kiro-cli"],
    opencode: ["opencode"],
    pi: ["pi"],
    other: ["other"],
  };
  return candidates[agentType]?.includes(normalized) ?? false;
}

async function enrichHerdrAgentPanes(
  client: HerdrCliClient,
  panes: HerdrAgentPane[],
): Promise<HerdrAgentPane[]> {
  return Promise.all(
    panes.map(async (pane) => {
      try {
        const response = await client.runJson(["pane", "process-info", "--pane", pane.paneId]);
        return {
          ...pane,
          ...extractPaneProcessIds(response),
        };
      } catch {
        return pane;
      }
    }),
  );
}

function extractPaneProcessIds(
  value: unknown,
): Pick<HerdrAgentPane, "foregroundPids" | "shellPid"> {
  const processInfo = getObject(value, ["result", "process_info"]);
  if (!processInfo) return {};

  const foregroundProcesses = processInfo.foreground_processes;
  const foregroundPids: number[] = [];
  if (Array.isArray(foregroundProcesses)) {
    for (const foregroundProcess of foregroundProcesses) {
      if (
        !foregroundProcess ||
        typeof foregroundProcess !== "object" ||
        Array.isArray(foregroundProcess)
      )
        continue;
      const pid = positiveIntegerOrNull((foregroundProcess as { pid?: unknown }).pid);
      if (pid !== null) foregroundPids.push(pid);
    }
  }
  const shellPid = positiveIntegerOrNull(processInfo.shell_pid);

  return {
    ...(foregroundPids.length > 0 ? { foregroundPids } : {}),
    ...(shellPid !== null ? { shellPid } : {}),
  };
}

function getArray(value: unknown, path: string[]): unknown[] | null {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return Array.isArray(current) ? current : null;
}

function getObject(value: unknown, path: string[]): Record<string, unknown> | null {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current && typeof current === "object" && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
