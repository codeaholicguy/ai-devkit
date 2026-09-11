import { HerdrRuntimeError } from "./HerdrErrors.js";
import type { HerdrRuntimeRef } from "./HerdrRuntimeRef.js";

export function extractWorkspaceStart(value: unknown): { workspaceId?: string; paneId: string } {
  const workspaceId = getString(value, ["result", "workspace", "workspace_id"]);
  const paneId = getString(value, ["result", "root_pane", "pane_id"]);
  if (!paneId) {
    throw new HerdrRuntimeError("Herdr workspace create response did not include root pane id.");
  }
  return {
    ...(workspaceId ? { workspaceId } : {}),
    paneId,
  };
}

export function extractAgentRuntimeRef(
  value: unknown,
  fallback: { paneId: string; name: string; workspaceId?: string },
): HerdrRuntimeRef {
  const agentPaneId = getString(value, ["result", "agent", "pane_id"]) ?? fallback.paneId;
  const agentName = getString(value, ["result", "agent", "name"]) ?? fallback.name;
  const tabId = getString(value, ["result", "agent", "tab_id"]);
  return {
    session: "default",
    ...(fallback.workspaceId ? { workspaceId: fallback.workspaceId } : {}),
    ...(tabId ? { tabId } : {}),
    paneId: agentPaneId,
    agentName,
  };
}

export function extractProcessInfoPid(value: unknown): number | null {
  const processInfo = getObject(value, ["result", "process_info"]);
  if (!processInfo) return null;
  const processes = processInfo.foreground_processes;
  if (!Array.isArray(processes)) return numberOrNull(processInfo.shell_pid);
  for (const processInfo of processes) {
    if (!processInfo || typeof processInfo !== "object") continue;
    const pid = numberOrNull((processInfo as { pid?: unknown }).pid);
    if (pid !== null) return pid;
  }
  return numberOrNull(processInfo.shell_pid);
}

export function herdrErrorFromResponse(value: unknown): HerdrRuntimeError | null {
  const error = getObject(value, ["error"]);
  if (!error) return null;
  const message = nonEmptyString(error.message) ?? "Herdr command failed.";
  const code = nonEmptyString(error.code);
  return new HerdrRuntimeError(message, code ? { code } : {});
}

function getObject(value: unknown, path: string[]): Record<string, unknown> | null {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(part in current))
      return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current && typeof current === "object" && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
}

function getString(value: unknown, path: string[]): string | undefined {
  const parent = getObject(value, path.slice(0, -1));
  return parent ? nonEmptyString(parent[path[path.length - 1]!]) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
