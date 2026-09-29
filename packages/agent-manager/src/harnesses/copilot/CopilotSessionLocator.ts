import * as path from "path";
import { isDirectory, isSafePathSegment, safeReaddir, safeStat } from "../../utils/session.js";
import { homeDir } from "../shared.js";

export interface CopilotLock {
  sessionDir: string;
  sessionId: string;
  pid: number;
}

export interface CopilotSessionDir {
  sessionDir: string;
  sessionId: string;
}

/** A live Copilot process whose `inuse.<pid>.lock` file should be located. */
export interface CopilotLockProcess {
  pid: number;
  startTime?: Date;
}

export interface CopilotSessionLocatorOptions {
  sessionStateDir?: string;
}

interface KnownLock extends CopilotSessionDir {
  startTimeMs: number;
}

/**
 * Tolerance between a reported process start time and its lock directory's
 * mtime: `ps lstart` has 1 s resolution, Linux start times derive from an
 * estimated boot time, and some filesystems store coarse mtimes.
 */
const START_TIME_SLACK_MS = 5 * 60 * 1000;

const LOCK_FILE_PATTERN = /^inuse\.(\d+)\.lock$/;

export class CopilotSessionLocator {
  private readonly sessionStateDir: string;
  /** Lock location per PID, trusted only while that PID's start time is unchanged. */
  private readonly knownLocks = new Map<number, KnownLock>();

  constructor(options: CopilotSessionLocatorOptions = {}) {
    this.sessionStateDir =
      options.sessionStateDir ?? path.join(homeDir(), ".copilot", "session-state");
  }

  listSessionDirs(): CopilotSessionDir[] {
    if (!isDirectory(this.sessionStateDir)) return [];

    const sessionDirs: CopilotSessionDir[] = [];
    for (const sessionId of safeReaddir(this.sessionStateDir)) {
      const sessionDir = path.join(this.sessionStateDir, sessionId);
      if (!isDirectory(sessionDir)) continue;

      sessionDirs.push({ sessionDir, sessionId });
    }

    return sessionDirs;
  }

  findSessionDirById(sessionId: string): CopilotSessionDir | null {
    if (!isSafePathSegment(sessionId)) return null;
    const sessionDir = path.join(this.sessionStateDir, sessionId);
    return isDirectory(sessionDir) ? { sessionDir, sessionId } : null;
  }

  /**
   * Find `inuse.<pid>.lock` files.
   *
   * Without `processes`, every session directory is scanned and all locks are
   * returned. With `processes`, only locks of those PIDs are returned and the
   * search is bounded:
   * - a lock found earlier for the same (pid, startTime) is re-validated with
   *   a single `stat` (a reused PID has a different start time and misses);
   * - otherwise only session directories whose mtime is at or after the
   *   earliest unresolved process start time (minus slack) are listed, since
   *   creating the lock file bumps its directory's mtime;
   * - if an unresolved process has no start time, every directory is listed.
   */
  discoverActiveLocks(processes?: readonly CopilotLockProcess[]): CopilotLock[] {
    if (!processes) {
      return this.scanLocks(undefined, () => true);
    }

    const startTimes = new Map(processes.map((proc) => [proc.pid, proc.startTime?.getTime()]));
    for (const [pid, known] of this.knownLocks) {
      if (startTimes.get(pid) !== known.startTimeMs) {
        this.knownLocks.delete(pid);
      }
    }

    const locks: CopilotLock[] = [];
    const unresolved = new Set<number>();
    for (const pid of startTimes.keys()) {
      const known = this.knownLocks.get(pid);
      if (known && safeStat(path.join(known.sessionDir, lockFileName(pid)))?.isFile()) {
        locks.push({ sessionDir: known.sessionDir, sessionId: known.sessionId, pid });
        continue;
      }
      this.knownLocks.delete(pid);
      unresolved.add(pid);
    }
    if (unresolved.size === 0) return locks;

    const unresolvedStarts = [...unresolved].map((pid) => startTimes.get(pid));
    const minMtimeMs = unresolvedStarts.every((start): start is number => start !== undefined)
      ? Math.min(...unresolvedStarts) - START_TIME_SLACK_MS
      : undefined;

    const found = this.scanLocks(minMtimeMs, (pid) => unresolved.has(pid));

    const lockCounts = new Map<number, number>();
    for (const lock of found) {
      lockCounts.set(lock.pid, (lockCounts.get(lock.pid) ?? 0) + 1);
    }
    for (const lock of found) {
      const startTimeMs = startTimes.get(lock.pid);
      // Only remember unambiguous locks of processes with a known start time
      if (startTimeMs !== undefined && lockCounts.get(lock.pid) === 1) {
        this.knownLocks.set(lock.pid, {
          sessionDir: lock.sessionDir,
          sessionId: lock.sessionId,
          startTimeMs,
        });
      }
    }

    return locks.concat(found);
  }

  /** List lock files in session directories with mtime >= `minMtimeMs` (all when undefined). */
  private scanLocks(
    minMtimeMs: number | undefined,
    includePid: (pid: number) => boolean,
  ): CopilotLock[] {
    const locks: CopilotLock[] = [];
    for (const sessionId of safeReaddir(this.sessionStateDir)) {
      const sessionDir = path.join(this.sessionStateDir, sessionId);
      const stat = safeStat(sessionDir);
      if (!stat?.isDirectory()) continue;
      if (minMtimeMs !== undefined && stat.mtimeMs < minMtimeMs) continue;

      for (const entry of safeReaddir(sessionDir)) {
        const match = entry.match(LOCK_FILE_PATTERN);
        if (!match) continue;

        const pid = Number.parseInt(match[1], 10);
        if (!Number.isFinite(pid) || !includePid(pid)) continue;
        locks.push({ sessionDir, sessionId, pid });
      }
    }

    return locks;
  }
}

function lockFileName(pid: number): string {
  return `inuse.${pid}.lock`;
}
