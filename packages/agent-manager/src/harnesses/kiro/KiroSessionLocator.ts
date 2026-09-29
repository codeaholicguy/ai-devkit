import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import {
  isDirectory,
  isSafePathSegment,
  safeReadFile,
  safeReaddir,
  safeStat,
} from "../../utils/session.js";
import { homeDir } from "../shared.js";
import { asRecord, type KiroSessionPaths } from "./KiroSessionParser.js";

/** A live Kiro process and the session whose lock it holds. */
export interface KiroProcessMatch {
  process: ProcessInfo;
  session: KiroSessionPaths;
}

export interface KiroSessionLocatorOptions {
  /** Overrides ~/.kiro/sessions/cli. */
  sessionsDir?: string;
}

interface KiroLock {
  sessionId: string;
  pid: number;
}

export class KiroSessionLocator {
  private readonly sessionsDir: string;

  constructor(options: KiroSessionLocatorOptions = {}) {
    this.sessionsDir = options.sessionsDir ?? path.join(homeDir(), ".kiro", "sessions", "cli");
  }

  /**
   * Pair `<session-id>.lock` files with running Kiro processes.
   *
   * @param snapshot every process collected for Kiro's process names, used to
   *   walk up from the lock's PID (often a `kiro-cli-chat acp` helper)
   * @param kiroProcesses the top-level Kiro processes that become agents
   * @param isKiro whether a process is a top-level Kiro process
   */
  matchRunningProcesses(
    snapshot: readonly ProcessInfo[],
    kiroProcesses: readonly ProcessInfo[],
    isKiro: (process: ProcessInfo) => boolean,
  ): KiroProcessMatch[] {
    const byPid = new Map(snapshot.map((proc) => [proc.pid, proc]));
    const matches: KiroProcessMatch[] = [];

    for (const lock of this.discoverActiveLocks()) {
      const proc =
        this.findKiroAncestor(lock.pid, byPid, isKiro) ??
        this.matchSoleProcessOnTty(byPid.get(lock.pid)?.tty, kiroProcesses);
      if (proc) matches.push({ process: proc, session: this.sessionPaths(lock.sessionId) });
    }
    return matches;
  }

  /** Every session with a transcript under the sessions dir. */
  listSessions(): KiroSessionPaths[] {
    if (!isDirectory(this.sessionsDir)) return [];

    return safeReaddir(this.sessionsDir)
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => this.sessionPaths(entry.slice(0, -".jsonl".length)));
  }

  /** The session stored as `<sessionId>.jsonl`, if it exists. */
  findSession(sessionId: string): KiroSessionPaths | null {
    if (!isSafePathSegment(sessionId)) return null;
    const paths = this.sessionPaths(sessionId);
    return safeStat(paths.transcriptPath)?.isFile() ? paths : null;
  }

  private sessionPaths(sessionId: string): KiroSessionPaths {
    return {
      sessionId,
      transcriptPath: path.join(this.sessionsDir, `${sessionId}.jsonl`),
      metadataPath: path.join(this.sessionsDir, `${sessionId}.json`),
    };
  }

  private discoverActiveLocks(): KiroLock[] {
    if (!isDirectory(this.sessionsDir)) return [];

    const locks: KiroLock[] = [];
    for (const entry of safeReaddir(this.sessionsDir)) {
      if (!entry.endsWith(".lock")) continue;

      const content = safeReadFile(path.join(this.sessionsDir, entry));
      if (content === undefined) continue;

      let pid: number | null;
      try {
        pid = toPid(asRecord(JSON.parse(content))?.pid);
      } catch {
        continue;
      }
      if (pid !== null) locks.push({ sessionId: entry.slice(0, -".lock".length), pid });
    }
    return locks;
  }

  /** The outermost Kiro process on the lock PID's parent chain, if collected. */
  private findKiroAncestor(
    lockPid: number,
    byPid: Map<number, ProcessInfo>,
    isKiro: (process: ProcessInfo) => boolean,
  ): ProcessInfo | null {
    let current = byPid.get(lockPid);
    const seen = new Set<number>();
    let resolved: ProcessInfo | null = null;

    while (current && !seen.has(current.pid)) {
      seen.add(current.pid);
      if (isKiro(current)) resolved = current;
      current = current.ppid === undefined ? undefined : byPid.get(current.ppid);
    }
    return resolved;
  }

  /**
   * Fallback when the chain is broken (an uncollected intermediate process):
   * attach to the only Kiro process on the lock holder's terminal.
   */
  private matchSoleProcessOnTty(
    tty: string | undefined,
    kiroProcesses: readonly ProcessInfo[],
  ): ProcessInfo | null {
    if (!tty || tty === "??" || tty === "?") return null;
    const matches = kiroProcesses.filter((proc) => proc.tty === tty);
    return matches.length === 1 ? matches[0] : null;
  }
}

function toPid(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
