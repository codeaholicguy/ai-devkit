import * as fs from "fs";
import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { matchProcessesToSessions, type MatchResult } from "../../utils/matching.js";
import {
  batchGetSessionFileBirthtimes,
  isDirectory,
  safeReaddir,
  safeStat,
  type SessionFile,
} from "../../utils/session.js";
import { CodexSessionParser, type CodexEventEntry } from "./CodexSessionParser.js";
import { homeDir } from "../shared.js";

export interface CodexDirectMatch {
  process: ProcessInfo;
  sessionFile: SessionFile;
}

export interface CodexProcessSessionMatches {
  direct: CodexDirectMatch[];
  legacyMatches: MatchResult[];
  fallback: ProcessInfo[];
}

export interface CodexDiscoveredSessions {
  sessions: SessionFile[];
}

export interface CodexSessionLocatorOptions {
  sessionsDir?: string;
  /** Clock used for negative-cache re-checks. Defaults to `Date.now`. */
  now?: () => number;
}

const PROCESS_START_DAY_WINDOW_DAYS = 1;
/** Upper bound of bytes read from a session file to find its `session_meta` line. */
export const SESSION_META_HEAD_MAX_BYTES = 64 * 1024;
const SESSION_META_HEAD_CHUNK_BYTES = 16 * 1024;
/** Unmatched processes are re-scanned at least this often, even when their date dirs are unchanged. */
export const UNMATCHED_PROCESS_RECHECK_MS = 30_000;

interface SessionMetaHead {
  id?: string;
  cwd: string;
  timestampMs: number | null;
}

interface SessionMetaCacheEntry {
  dev: number;
  ino: number;
  /** Bytes of the file head the metadata was parsed from. */
  headBytes: number;
  /** True once the head can no longer change (newline seen or byte limit reached). */
  headFinal: boolean;
  meta: SessionMetaHead | null;
}

interface UnmatchedProcessEntry {
  checkedAtMs: number;
  dateDirSignature: string;
}

interface FileHead {
  text: string;
  /** Bytes consumed by the first line (including its newline), or all bytes read. */
  bytes: number;
  /** A newline terminated the first line. */
  complete: boolean;
  /** The byte limit was reached before a newline. */
  truncated: boolean;
}

export class CodexSessionLocator {
  private readonly sessionsDir: string;
  private readonly now: () => number;
  /** `session_meta` is written once at the head of an append-only file, so it is cached by path + inode. */
  private readonly sessionMetaCache = new Map<string, SessionMetaCacheEntry>();
  /** `(pid, startTime)` of processes that matched no session, keyed to their date-dir mtimes. */
  private readonly unmatchedProcesses = new Map<string, UnmatchedProcessEntry>();

  constructor(
    options: CodexSessionLocatorOptions = {},
    private readonly parser: CodexSessionParser = new CodexSessionParser(),
  ) {
    this.sessionsDir = options.sessionsDir ?? path.join(homeDir(), ".codex", "sessions");
    this.now = options.now ?? Date.now;
  }

  matchRunningProcesses(processes: ProcessInfo[]): CodexProcessSessionMatches {
    const { direct, fallback } = this.tryResumeMatching(processes);
    const nowMs = this.now();
    const signatures = new Map(
      fallback.map((proc) => [proc, this.getDateDirSignature(proc)] as const),
    );
    const candidates = fallback.filter(
      (proc) => !this.isKnownUnmatched(proc, signatures.get(proc) ?? "", nowMs),
    );

    const { sessions } = this.discoverLiveSessions(candidates);
    const legacyMatches =
      candidates.length > 0 && sessions.length > 0
        ? matchProcessesToSessions(candidates, sessions)
        : [];

    this.updateUnmatchedProcesses(fallback, candidates, legacyMatches, signatures, nowMs);

    return { direct, legacyMatches, fallback };
  }

  tryResumeMatching(processes: ProcessInfo[]): {
    direct: CodexDirectMatch[];
    fallback: ProcessInfo[];
  } {
    const direct: CodexDirectMatch[] = [];
    const fallback: ProcessInfo[] = [];

    for (const proc of processes) {
      const sessionId = this.extractResumeSessionId(proc.command);
      if (!sessionId) {
        fallback.push(proc);
        continue;
      }

      const sessionFile = this.findSessionFileById(sessionId);
      if (!sessionFile) {
        fallback.push(proc);
        continue;
      }

      direct.push({ process: proc, sessionFile });
    }

    return { direct, fallback };
  }

  discoverLiveSessions(processes: ProcessInfo[]): CodexDiscoveredSessions {
    const empty = { sessions: [] };
    if (processes.length === 0) return empty;
    if (!fs.existsSync(this.sessionsDir)) return empty;

    const dateDirs = this.getDateDirs(processes);
    if (dateDirs.length === 0) return empty;

    return this.discoverSessionFilesInDateDirs(dateDirs);
  }

  discoverSessionFilesInDateDirs(dateDirs: string[]): CodexDiscoveredSessions {
    const files = batchGetSessionFileBirthtimes(dateDirs);
    this.pruneSessionMetaCache(dateDirs, files);

    for (const file of files) {
      const meta = this.readSessionMeta(file.filePath);
      if (!meta) continue;

      file.resolvedCwd = meta.cwd;
      if (meta.timestampMs !== null) {
        file.birthtimeMs = meta.timestampMs;
      }
    }

    return { sessions: files };
  }

  discoverHistoricalSessionFiles(): string[] {
    return this.collectAllSessionFiles();
  }

  findSessionFileById(sessionId: string): SessionFile | null {
    for (const filePath of this.getCandidateSessionFiles(sessionId)) {
      if (!path.basename(filePath).includes(sessionId)) continue;

      const meta = this.readSessionMeta(filePath);
      if (!meta || meta.id !== sessionId) continue;

      const stat = safeStat(filePath);
      if (!stat) continue;

      return {
        sessionId,
        filePath,
        projectDir: path.dirname(filePath),
        birthtimeMs: meta.timestampMs ?? stat.birthtimeMs,
        resolvedCwd: meta.cwd,
      };
    }

    return null;
  }

  collectAllSessionFiles(): string[] {
    const out: string[] = [];

    for (const yearEntry of safeReaddir(this.sessionsDir)) {
      const yearDir = path.join(this.sessionsDir, yearEntry);
      if (!isDirectory(yearDir)) continue;

      for (const monthEntry of safeReaddir(yearDir)) {
        const monthDir = path.join(yearDir, monthEntry);
        if (!isDirectory(monthDir)) continue;

        for (const dayEntry of safeReaddir(monthDir)) {
          const dayDir = path.join(monthDir, dayEntry);
          if (!isDirectory(dayDir)) continue;

          for (const fileEntry of safeReaddir(dayDir)) {
            if (!fileEntry.endsWith(".jsonl")) continue;
            out.push(path.join(dayDir, fileEntry));
          }
        }
      }
    }

    return out;
  }

  private extractResumeSessionId(command: string): string | null {
    const match = command.match(/(?:^|\s)resume\s+([0-9a-f-]{36})(?:\s|$)/i);
    return match?.[1] ?? null;
  }

  private getCandidateSessionFiles(sessionId: string): string[] {
    const sessionDate = this.tryParseUuidV7Date(sessionId);
    if (!sessionDate) return this.collectAllSessionFiles();

    return this.collectSessionFilesInDateDirs(
      this.getDateDirsAroundDate(sessionDate, PROCESS_START_DAY_WINDOW_DAYS),
    );
  }

  /**
   * Read `session_meta` from at most {@link SESSION_META_HEAD_MAX_BYTES} of the
   * file head. Cached per path while the inode is unchanged and the file has
   * not shrunk below the parsed head, so growing session files are not re-read.
   */
  private readSessionMeta(filePath: string): SessionMetaHead | null {
    const stat = safeStat(filePath);
    if (!stat) return null;

    const cached = this.sessionMetaCache.get(filePath);
    if (cached && this.isSessionMetaCacheValid(cached, stat)) return cached.meta;

    const head = readFileHead(filePath, SESSION_META_HEAD_MAX_BYTES);
    if (!head) {
      this.sessionMetaCache.delete(filePath);
      return null;
    }

    const meta = this.parseSessionMetaHead(head);
    this.sessionMetaCache.set(filePath, {
      dev: stat.dev,
      ino: stat.ino,
      headBytes: head.bytes,
      headFinal: head.complete || head.truncated,
      meta,
    });
    return meta;
  }

  private isSessionMetaCacheValid(entry: SessionMetaCacheEntry, stat: fs.Stats): boolean {
    if (entry.dev !== stat.dev || entry.ino !== stat.ino) return false;
    return entry.headFinal ? stat.size >= entry.headBytes : stat.size === entry.headBytes;
  }

  private parseSessionMetaHead(head: FileHead): SessionMetaHead | null {
    const line = head.text.trim();
    if (!line) return null;

    try {
      const parsed = JSON.parse(line) as CodexEventEntry;
      if (parsed.type !== "session_meta") return null;
      return {
        id: parsed.payload?.id,
        cwd: parsed.payload?.cwd || "",
        timestampMs: this.parser.parseMetaTimestampMs(parsed.payload?.timestamp),
      };
    } catch {
      return head.truncated ? this.parseTruncatedSessionMeta(line) : null;
    }
  }

  /**
   * Best-effort extraction for a `session_meta` line longer than the head limit
   * (e.g. large embedded instructions). `id`, `timestamp` and `cwd` precede the
   * bulky payload fields, so they are read from the payload prefix.
   */
  private parseTruncatedSessionMeta(line: string): SessionMetaHead | null {
    if (!/"type"\s*:\s*"session_meta"/.test(line)) return null;

    const payloadStart = line.search(/"payload"\s*:\s*\{/);
    if (payloadStart < 0) return null;
    const payload = line.slice(payloadStart);

    return {
      id: extractJsonStringField(payload, "id"),
      cwd: extractJsonStringField(payload, "cwd") || "",
      timestampMs: this.parser.parseMetaTimestampMs(extractJsonStringField(payload, "timestamp")),
    };
  }

  private pruneSessionMetaCache(dateDirs: string[], files: SessionFile[]): void {
    const scannedDirs = new Set(dateDirs);
    const present = new Set(files.map((file) => file.filePath));
    for (const filePath of this.sessionMetaCache.keys()) {
      if (scannedDirs.has(path.dirname(filePath)) && !present.has(filePath)) {
        this.sessionMetaCache.delete(filePath);
      }
    }
  }

  private isKnownUnmatched(proc: ProcessInfo, dateDirSignature: string, nowMs: number): boolean {
    const entry = this.unmatchedProcesses.get(this.toProcessKey(proc));
    if (!entry) return false;
    if (nowMs - entry.checkedAtMs >= UNMATCHED_PROCESS_RECHECK_MS) return false;
    return entry.dateDirSignature === dateDirSignature;
  }

  private updateUnmatchedProcesses(
    fallback: ProcessInfo[],
    scanned: ProcessInfo[],
    legacyMatches: MatchResult[],
    signatures: Map<ProcessInfo, string>,
    nowMs: number,
  ): void {
    const liveKeys = new Set(fallback.map((proc) => this.toProcessKey(proc)));
    for (const key of this.unmatchedProcesses.keys()) {
      if (!liveKeys.has(key)) this.unmatchedProcesses.delete(key);
    }

    const matchedPids = new Set(legacyMatches.map((match) => match.process.pid));
    for (const proc of scanned) {
      const key = this.toProcessKey(proc);
      if (matchedPids.has(proc.pid)) {
        this.unmatchedProcesses.delete(key);
      } else {
        this.unmatchedProcesses.set(key, {
          checkedAtMs: nowMs,
          dateDirSignature: signatures.get(proc) ?? "",
        });
      }
    }
  }

  private toProcessKey(proc: ProcessInfo): string {
    return `${proc.pid}:${proc.startTime?.getTime() ?? "unknown"}`;
  }

  /** Day-window directories with their mtimes; changes when session files are added or removed. */
  private getDateDirSignature(proc: ProcessInfo): string {
    return this.getProcessDayKeys(proc)
      .map((dayKey) => {
        const stat = safeStat(path.join(this.sessionsDir, dayKey));
        return `${dayKey}=${stat?.isDirectory() ? stat.mtimeMs : "-"}`;
      })
      .join("|");
  }

  private getProcessDayKeys(proc: ProcessInfo): string[] {
    const startTime = proc.startTime || new Date();
    const dayKeys: string[] = [];

    for (
      let offset = -PROCESS_START_DAY_WINDOW_DAYS;
      offset <= PROCESS_START_DAY_WINDOW_DAYS;
      offset++
    ) {
      const day = new Date(startTime.getTime());
      day.setDate(day.getDate() + offset);
      dayKeys.push(this.toSessionDayKey(day));
    }

    return dayKeys;
  }

  private getDateDirs(processes: ProcessInfo[]): string[] {
    const dayKeys = new Set<string>();

    for (const proc of processes) {
      for (const dayKey of this.getProcessDayKeys(proc)) {
        dayKeys.add(dayKey);
      }
    }

    const dirs: string[] = [];
    for (const dayKey of dayKeys) {
      const dayDir = path.join(this.sessionsDir, dayKey);
      try {
        if (fs.statSync(dayDir).isDirectory()) {
          dirs.push(dayDir);
        }
      } catch {
        continue;
      }
    }

    return dirs;
  }

  private getDateDirsAroundDate(date: Date, windowDays: number): string[] {
    const dirs: string[] = [];

    for (let offset = -windowDays; offset <= windowDays; offset++) {
      const day = new Date(date.getTime());
      day.setDate(day.getDate() + offset);
      const dayDir = path.join(this.sessionsDir, this.toSessionDayKey(day));
      if (isDirectory(dayDir)) {
        dirs.push(dayDir);
      }
    }

    return dirs;
  }

  private toSessionDayKey(date: Date): string {
    const yyyy = String(date.getFullYear()).padStart(4, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return path.join(yyyy, mm, dd);
  }

  private tryParseUuidV7Date(sessionId: string): Date | null {
    const match = sessionId.match(
      /^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    if (!match) return null;

    const timestampMs = Number.parseInt(`${match[1]}${match[2]}`, 16);
    if (!Number.isSafeInteger(timestampMs) || timestampMs <= 0) return null;

    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private collectSessionFilesInDateDirs(dateDirs: string[]): string[] {
    const out: string[] = [];

    for (const dayDir of dateDirs) {
      for (const fileEntry of safeReaddir(dayDir)) {
        if (!fileEntry.endsWith(".jsonl")) continue;
        out.push(path.join(dayDir, fileEntry));
      }
    }

    return out;
  }
}

/**
 * Read the first line of a file, consuming at most `maxBytes`.
 * Returns `null` when the file cannot be opened or read.
 */
function readFileHead(filePath: string, maxBytes: number): FileHead | null {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return null;
  }

  try {
    const buffer = Buffer.alloc(maxBytes);
    let total = 0;

    while (total < maxBytes) {
      const length = Math.min(SESSION_META_HEAD_CHUNK_BYTES, maxBytes - total);
      const read = fs.readSync(fd, buffer, total, length, total);
      if (read <= 0) break;

      const newlineIndex = buffer.indexOf(0x0a, total);
      total += read;
      if (newlineIndex >= 0 && newlineIndex < total) {
        return {
          text: buffer.toString("utf-8", 0, newlineIndex),
          bytes: newlineIndex + 1,
          complete: true,
          truncated: false,
        };
      }
    }

    return {
      text: buffer.toString("utf-8", 0, total),
      bytes: total,
      complete: false,
      truncated: total >= maxBytes,
    };
  } catch {
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // Ignore close errors
    }
  }
}

/** Extract the first `"field": "<json string>"` value from a JSON fragment. */
function extractJsonStringField(fragment: string, field: string): string | undefined {
  const match = fragment.match(new RegExp(`"${field}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`));
  if (!match) return undefined;

  try {
    const value = JSON.parse(match[1]) as unknown;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}
