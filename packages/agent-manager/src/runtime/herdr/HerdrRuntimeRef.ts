import { HerdrRuntimeError } from "./HerdrErrors.js";

export interface HerdrRuntimeRef {
  session: string;
  workspaceId?: string;
  tabId?: string;
  paneId: string;
  agentName?: string;
}

export function parseHerdrRuntimeRef(value: unknown): HerdrRuntimeRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HerdrRuntimeError("Herdr runtime ref is missing or invalid.");
  }
  const ref = value as {
    session?: unknown;
    workspaceId?: unknown;
    tabId?: unknown;
    paneId?: unknown;
    agentName?: unknown;
  };
  const session = nonEmptyString(ref.session) ?? "default";
  const workspaceId = nonEmptyString(ref.workspaceId);
  const tabId = nonEmptyString(ref.tabId);
  const paneId = nonEmptyString(ref.paneId);
  const agentName = nonEmptyString(ref.agentName);
  if (!paneId) {
    throw new HerdrRuntimeError("Herdr runtime ref is missing paneId.");
  }
  return {
    session,
    paneId,
    ...(workspaceId ? { workspaceId } : {}),
    ...(tabId ? { tabId } : {}),
    ...(agentName ? { agentName } : {}),
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
