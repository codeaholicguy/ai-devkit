import type * as fs from "fs";
import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { matchProcessesToSessions, type MatchResult } from "../../utils/matching.js";
import { MATCH_TOLERANCE_MS } from "../../utils/matchingConstants.js";
import {
  isDirectory,
  isSafePathSegment,
  listJsonl,
  safeReaddir,
  safeStat,
  type SessionFile,
} from "../../utils/session.js";
import {
  PI_SESSION_HEAD_MAX_BYTES,
  PiSessionParser,
  type PiSessionHead,
} from "./PiSessionParser.js";
import { homeDir } from "../shared.js";

export interface PiSessionLocatorOptions {
  sessionsDir?: string;
}

export interface PiProcessSessionMatches {
  legacyMatches: MatchResult[];
  fallback: ProcessInfo[];
}

/** Pi session file names start with their creation time: `2026-06-10T08-58-20-754Z_<id>.jsonl`. */
const FILE_NAME_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/;

interface ProjectDirScan {
  dirMtimeMs: number;
  processes: ProcessInfo[];
}

interface CachedHead {
  dev: number;
  ino: number;
  size: number;
  head: PiSessionHead;
  seen: number;
}

/** A project dir whose last scan matched none of the processes that scanned it. */
interface NoMatchEntry {
  dirMtimeMs: number;
  processKeys: Set<string>;
}

/**
 * Finds Pi session files for running processes that the registry and the
 * sessions.json tracker could not resolve.
 *
 * Live discovery is scoped so its cost follows live agents, not Pi history:
 * - only the project dir Pi derives from each process cwd is listed;
 * - only files created within MATCH_TOLERANCE_MS (the matcher's tolerance) of a
 *   process start are opened,
 *   and only their head (<= 64 KiB) is read for session id and cwd;
 * - heads are cached per file (dev/ino/size) across calls on one instance;
 * - a project dir whose scan matched none of its processes is skipped until
 *   its mtime changes (a session file was added or removed) or a process it
 *   has not seen needs it.
 *
 * Reuse one instance across refreshes to benefit from the caches.
 */
export class PiSessionLocator {
  private readonly sessionsDir: string;
  private readonly heads = new Map<string, CachedHead>();
  private readonly noMatchDirs = new Map<string, NoMatchEntry>();
  private generation = 0;

  constructor(
    options: PiSessionLocatorOptions = {},
    private readonly parser: PiSessionParser = new PiSessionParser(),
  ) {
    this.sessionsDir = options.sessionsDir ?? path.join(homeDir(), ".pi", "agent", "sessions");
  }

  matchRunningProcesses(processes: ProcessInfo[]): PiProcessSessionMatches {
    this.generation++;
    try {
      if (processes.length === 0) return { legacyMatches: [], fallback: [] };

      const scans = this.groupByProjectDir(processes, true);
      const sessions = this.discoverSessionsInDirs(scans);
      if (sessions.length === 0) {
        this.rememberUnmatchedDirs(scans, []);
        return { legacyMatches: [], fallback: processes };
      }

      const legacyMatches = matchProcessesToSessions(processes, sessions);
      this.rememberUnmatchedDirs(scans, legacyMatches);
      return { legacyMatches, fallback: processes };
    } finally {
      this.pruneHeads();
    }
  }

  /**
   * Session files that could match `processes`: files in each process's
   * project dir created within the start-time window, with session id and
   * cwd taken from a bounded head read.
   */
  discoverLiveSessions(processes: ProcessInfo[] = []): SessionFile[] {
    return this.discoverSessionsInDirs(this.groupByProjectDir(processes, false));
  }

  discoverHistoricalSessionFiles(): string[] {
    return this.collectJsonlFiles(this.sessionsDir);
  }

  findHistoricalSessionFilesById(sessionId: string): string[] {
    if (!isSafePathSegment(sessionId)) return [];

    return this.collectJsonlFiles(this.sessionsDir).filter((filePath) => {
      const basename = path.basename(filePath, ".jsonl");
      return basename === sessionId || basename.endsWith(`_${sessionId}`);
    });
  }

  /**
   * Group matchable processes (cwd and start time set) by the project dir Pi
   * stores their sessions in. With `skipUnchanged`, dirs whose previous scan
   * matched nothing and that have not changed since are left out.
   */
  private groupByProjectDir(
    processes: ProcessInfo[],
    skipUnchanged: boolean,
  ): Map<string, ProjectDirScan> {
    const scans = new Map<string, ProjectDirScan>();
    if (!isDirectory(this.sessionsDir)) return scans;

    for (const proc of processes) {
      if (!proc.cwd || !proc.startTime) continue;
      const projectDir = path.join(this.sessionsDir, this.encodeProjectDir(proc.cwd));
      const scan = scans.get(projectDir);
      if (scan) {
        scan.processes.push(proc);
        continue;
      }
      const stat = safeStat(projectDir);
      if (stat?.isDirectory()) {
        scans.set(projectDir, { dirMtimeMs: stat.mtimeMs, processes: [proc] });
      }
    }

    if (!skipUnchanged) return scans;

    for (const projectDir of this.noMatchDirs.keys()) {
      if (!scans.has(projectDir)) this.noMatchDirs.delete(projectDir);
    }
    for (const [projectDir, scan] of scans) {
      const noMatch = this.noMatchDirs.get(projectDir);
      // An unmatched process never held a session, so dropping one cannot free
      // a session for another; only a dir change or an unseen process can.
      const unchanged =
        noMatch !== undefined &&
        noMatch.dirMtimeMs === scan.dirMtimeMs &&
        scan.processes.every((proc) => noMatch.processKeys.has(processKey(proc)));
      if (unchanged) {
        scans.delete(projectDir);
      } else {
        this.noMatchDirs.delete(projectDir);
      }
    }
    return scans;
  }

  private discoverSessionsInDirs(scans: Map<string, ProjectDirScan>): SessionFile[] {
    const sessions: SessionFile[] = [];
    for (const [projectDir, scan] of scans) {
      const cwd = scan.processes[0]?.cwd ?? "";
      const startTimes = scan.processes.map((proc) => proc.startTime?.getTime() ?? 0);

      for (const fileName of listJsonl(projectDir)) {
        const filePath = path.join(projectDir, fileName);
        const stat = safeStat(filePath);
        if (!stat?.isFile()) continue;

        const birthtimeMs = stat.birthtimeMs || stat.mtimeMs;
        const createdMs = this.fileNameTimestamp(fileName);
        const inWindow = startTimes.some(
          (startMs) =>
            Math.abs(startMs - birthtimeMs) <= MATCH_TOLERANCE_MS ||
            (createdMs !== undefined && Math.abs(startMs - createdMs) <= MATCH_TOLERANCE_MS),
        );
        if (!inWindow) continue;

        const head = this.readHead(filePath, stat);
        sessions.push({
          sessionId: head?.sessionId || this.parser.sessionIdFromFile(filePath),
          filePath,
          projectDir,
          birthtimeMs,
          resolvedCwd: head?.projectPath || cwd,
        });
      }
    }
    return sessions;
  }

  /** Head metadata for `filePath`, re-read only when appended bytes could change it. */
  private readHead(filePath: string, stat: fs.Stats): PiSessionHead | null {
    const cached = this.heads.get(filePath);
    const reusable =
      cached !== undefined &&
      cached.dev === stat.dev &&
      cached.ino === stat.ino &&
      (cached.size === stat.size || (stat.size > cached.size && this.isHeadSettled(cached.head)));
    if (reusable) {
      cached.seen = this.generation;
      return cached.head;
    }

    const head = this.parser.readSessionHead(filePath);
    if (head) {
      this.heads.set(filePath, {
        dev: stat.dev,
        ino: stat.ino,
        size: stat.size,
        head,
        seen: this.generation,
      });
    } else {
      this.heads.delete(filePath);
    }
    return head;
  }

  /** Appending to a file cannot change a head that found both fields or hit the byte cap. */
  private isHeadSettled(head: PiSessionHead): boolean {
    return (
      (Boolean(head.sessionId) && Boolean(head.projectPath)) ||
      head.bytesRead >= PI_SESSION_HEAD_MAX_BYTES
    );
  }

  private rememberUnmatchedDirs(scans: Map<string, ProjectDirScan>, matches: MatchResult[]): void {
    const matchedPids = new Set(matches.map((match) => match.process.pid));
    for (const [projectDir, scan] of scans) {
      if (scan.processes.some((proc) => matchedPids.has(proc.pid))) continue;
      this.noMatchDirs.set(projectDir, {
        dirMtimeMs: scan.dirMtimeMs,
        processKeys: new Set(scan.processes.map(processKey)),
      });
    }
  }

  private pruneHeads(): void {
    for (const [filePath, entry] of this.heads) {
      if (entry.seen !== this.generation) this.heads.delete(filePath);
    }
  }

  private fileNameTimestamp(fileName: string): number | undefined {
    const match = FILE_NAME_TIMESTAMP.exec(fileName);
    if (!match) return undefined;
    const [, date, hours, minutes, seconds, millis] = match;
    const ms = Date.parse(`${date}T${hours}:${minutes}:${seconds}.${millis}Z`);
    return Number.isNaN(ms) ? undefined : ms;
  }

  private collectJsonlFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of safeReaddir(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = safeStat(fullPath);
      if (!stat) continue;
      if (stat.isDirectory()) {
        files.push(...this.collectJsonlFiles(fullPath));
      } else if (stat.isFile() && entry.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  private encodeProjectDir(cwd: string): string {
    const normalized = path.resolve(cwd);
    return `--${normalized.replace(/^\//, "").replace(/\//g, "-")}--`;
  }
}

function processKey(proc: ProcessInfo): string {
  return `${proc.pid}:${proc.startTime?.getTime() ?? ""}`;
}
