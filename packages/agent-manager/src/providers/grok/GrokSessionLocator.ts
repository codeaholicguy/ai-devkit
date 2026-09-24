import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import {
  isDirectory,
  isSafePathSegment,
  safeReadFile,
  safeReaddir,
  safeStat,
} from "../../utils/session.js";
import { CHAT_HISTORY_FILE } from "./GrokSessionParser.js";

const ACTIVE_SESSIONS_FILE = "active_sessions.json";
const CWD_FILE = ".cwd";

/** One entry of ~/.grok/active_sessions.json. */
interface ActiveSessionEntry {
  pid?: number;
  cwd?: string;
  opened_at?: number | string;
}

/** A live Grok process paired with its resolved cwd and (if any) session dir. */
export interface GrokProcessMatch {
  process: ProcessInfo;
  cwd: string;
  sessionDir: string | null;
}

/** A historical session dir plus the cwd decoded from its group dir. */
export interface GrokSessionDir {
  sessionDir: string;
  defaultCwd: string;
}

export interface GrokSessionLocatorOptions {
  /** Overrides the ~/.grok base directory (defaults to GROK_HOME or ~/.grok). */
  baseDir?: string;
}

export class GrokSessionLocator {
  private readonly baseDir: string;
  private readonly sessionsDir: string;

  constructor(options: GrokSessionLocatorOptions = {}) {
    // GROK_HOME overrides the ~/.grok base directory; sessions live under
    // <base>/sessions/ and the active-session registry at
    // <base>/active_sessions.json.
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.baseDir = options.baseDir ?? (process.env.GROK_HOME || path.join(homeDir, ".grok"));
    this.sessionsDir = path.join(this.baseDir, "sessions");
  }

  /**
   * Pair live Grok processes with their session dirs.
   *
   * active_sessions.json is the authoritative pid -> cwd map for live
   * sessions; the lsof-derived process cwd is only a fallback. The most
   * recently active session under that cwd's group dir is picked.
   */
  matchRunningProcesses(processes: ProcessInfo[]): GrokProcessMatch[] {
    const pidToCwd = this.readActiveSessions();
    return processes.map((proc) => {
      const cwd = pidToCwd.get(proc.pid) || proc.cwd || "";
      return { process: proc, cwd, sessionDir: cwd ? this.latestSessionDir(cwd) : null };
    });
  }

  /** Every session dir under ~/.grok/sessions/, across all project groups. */
  discoverHistoricalSessionDirs(): GrokSessionDir[] {
    const results: GrokSessionDir[] = [];
    for (const { groupDir, defaultCwd } of this.listGroups()) {
      for (const sessionDir of this.listSessionDirs(groupDir)) {
        results.push({ sessionDir, defaultCwd });
      }
    }
    return results;
  }

  /** Session dirs named exactly `sessionId`, across all project groups. */
  findHistoricalSessionDirsById(sessionId: string): GrokSessionDir[] {
    if (!isSafePathSegment(sessionId)) return [];

    const results: GrokSessionDir[] = [];
    for (const { groupDir, defaultCwd } of this.listGroups()) {
      const sessionDir = path.join(groupDir, sessionId);
      if (isDirectory(sessionDir)) {
        results.push({ sessionDir, defaultCwd });
      }
    }
    return results;
  }

  /**
   * Read ~/.grok/active_sessions.json into a pid -> cwd map. Grok writes one
   * { pid, cwd, opened_at } entry per running session and removes it on exit,
   * so this is the reliable way to learn a live process's working directory.
   */
  private readActiveSessions(): Map<number, string> {
    const map = new Map<number, string>();
    const content = safeReadFile(path.join(this.baseDir, ACTIVE_SESSIONS_FILE));
    if (content === undefined) return map;

    let entries: unknown;
    try {
      entries = JSON.parse(content);
    } catch {
      return map;
    }
    if (!Array.isArray(entries)) return map;

    for (const entry of entries as ActiveSessionEntry[]) {
      if (typeof entry?.pid === "number" && typeof entry?.cwd === "string" && entry.cwd) {
        map.set(entry.pid, entry.cwd);
      }
    }
    return map;
  }

  /**
   * Return the most recently active session subdirectory for a cwd, i.e. the
   * ~/.grok/sessions/<encodeURIComponent(cwd)>/<id>/ whose chat_history.jsonl
   * was written last. Returns null when the group dir or any transcript is
   * missing.
   */
  private latestSessionDir(cwd: string): string | null {
    const groupDir = path.join(this.sessionsDir, encodeURIComponent(cwd));
    if (!isDirectory(groupDir)) return null;

    let best: { dir: string; mtimeMs: number } | null = null;
    for (const sessionDir of this.listSessionDirs(groupDir)) {
      const stat = safeStat(path.join(sessionDir, CHAT_HISTORY_FILE));
      if (!stat) continue;
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { dir: sessionDir, mtimeMs: stat.mtimeMs };
      }
    }
    return best?.dir ?? null;
  }

  private listGroups(): Array<{ groupDir: string; defaultCwd: string }> {
    if (!isDirectory(this.sessionsDir)) return [];

    const groups: Array<{ groupDir: string; defaultCwd: string }> = [];
    for (const groupName of safeReaddir(this.sessionsDir)) {
      const groupDir = path.join(this.sessionsDir, groupName);
      if (!isDirectory(groupDir)) continue;
      groups.push({ groupDir, defaultCwd: this.decodeGroupCwd(groupName, groupDir) });
    }
    return groups;
  }

  /**
   * Full paths of the session subdirectories directly under a group dir,
   * skipping any non-directory entries (e.g. prompt_history.jsonl).
   */
  private listSessionDirs(groupDir: string): string[] {
    return safeReaddir(groupDir)
      .map((sessionId) => path.join(groupDir, sessionId))
      .filter((sessionDir) => isDirectory(sessionDir));
  }

  /**
   * Resolve the working directory a session group dir was created for.
   *
   * The common case is `decodeURIComponent(<group-name>)`. For paths whose
   * encoded form exceeds the filesystem limit Grok uses a slug+hash and records
   * the original path in a `.cwd` file inside the group — prefer that when
   * present.
   */
  private decodeGroupCwd(groupName: string, groupDir: string): string {
    const fromFile = safeReadFile(path.join(groupDir, CWD_FILE));
    if (fromFile !== undefined && fromFile.trim()) return fromFile.trim();
    try {
      return decodeURIComponent(groupName);
    } catch {
      return "";
    }
  }
}
