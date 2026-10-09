/**
 * Helpers shared by the harness adapters. Each harness keeps its own session
 * matching and parsing; these cover the parts that are the same everywhere.
 */

import type {
  AgentAdapter,
  AgentDetectionContext,
  AgentInfo,
  AgentType,
  ProcessInfo,
} from "../adapters/AgentAdapter.js";
import { AgentStatus } from "../adapters/AgentAdapter.js";
import { generateAgentName } from "../utils/matching.js";
import {
  captureProcessSnapshot,
  executableBasename,
  filterByProcessNames,
} from "../utils/process.js";

/** A session untouched for longer than this is IDLE. */
export const IDLE_THRESHOLD_MINUTES = 5;

/** Maximum length of a session summary derived from a user prompt. */
export const SUMMARY_MAX_LENGTH = 120;

export interface HarnessProcesses {
  /** Every process whose executable is one of the adapter's `processNames`. */
  relevant: ProcessInfo[];
  /** The subset `canHandle` accepts (deduplicated by PID): the agents. */
  processes: ProcessInfo[];
}

/**
 * The adapter's processes from the manager's shared snapshot, or from its own
 * capture when called standalone. `relevant` also keeps helper processes
 * (e.g. a harness's child runtime) that detection may need to walk through.
 */
export async function findHarnessProcesses(
  adapter: Pick<AgentAdapter, "canHandle"> & { readonly processNames: readonly string[] },
  context?: AgentDetectionContext,
): Promise<HarnessProcesses> {
  const snapshot =
    context?.processes ??
    (await captureProcessSnapshot(adapter.processNames, {
      isCandidate: (process) => adapter.canHandle(process),
    }));
  const relevant = filterByProcessNames(snapshot, adapter.processNames);

  const byPid = new Map<number, ProcessInfo>();
  for (const process of relevant) {
    if (!byPid.has(process.pid) && adapter.canHandle(process)) byPid.set(process.pid, process);
  }
  return { relevant, processes: Array.from(byPid.values()) };
}

/** Whether argv[0]'s basename is `name` or `name.exe`. */
export function matchesExecutable(command: string, name: string): boolean {
  const base = executableBasename(command);
  return base === name || base === `${name}.exe`;
}

/**
 * The placeholder agent for a running process with no matched session:
 * RUNNING, with a `pid-<pid>` session id.
 */
export function processOnlyAgent(
  type: AgentType,
  processInfo: ProcessInfo,
  { summary, cwd = processInfo.cwd ?? "" }: { summary: string; cwd?: string },
): AgentInfo {
  return {
    name: generateAgentName(cwd, processInfo.pid),
    type,
    status: AgentStatus.RUNNING,
    summary,
    pid: processInfo.pid,
    projectPath: cwd,
    sessionId: `pid-${processInfo.pid}`,
    lastActive: new Date(),
  };
}

export function isIdle(lastActive: Date, now = Date.now()): boolean {
  return (now - lastActive.getTime()) / 60000 > IDLE_THRESHOLD_MINUTES;
}

export function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || "";
}

/** ISO strings, or epoch numbers in seconds or milliseconds; null when invalid. */
export function parseTimestamp(value: unknown): Date | null {
  if (typeof value === "number") {
    const date = new Date(value < 1_000_000_000_000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

/** Flatten a string, or an array of `{ text }` blocks, to plain text. */
export function flattenTextBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string"
        ? (block as { text: string }).text
        : "",
    )
    .join("");
}
