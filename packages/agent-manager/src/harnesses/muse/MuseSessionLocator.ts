import * as fs from "fs";
import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { matchProcessesToSessions, type MatchResult } from "../../utils/matching.js";
import {
  isDirectory,
  isSafePathSegment,
  safeReaddir,
  safeStat,
  type SessionFile,
} from "../../utils/session.js";
import { homeDir } from "../shared.js";

/** Entry in `~/.local/share/muse/runtime/muse/sessions/<session-id>.json`. */
export interface MuseRuntimeEntry {
  sessionId: string;
  pid: number;
}

/** A live Muse process paired with its transcript through the runtime file. */
export interface MuseDirectMatch {
  process: ProcessInfo;
  sessionFile: SessionFile;
}

export interface MuseProcessSessionMatches {
  direct: MuseDirectMatch[];
  legacyMatches: MatchResult[];
  /** Muse processes no strategy could pair (become process-only agents). */
  fallback: ProcessInfo[];
}

export interface MuseSessionLocatorOptions {
  homeDir?: string;
  runtimeDir?: string;
  archiveDir?: string;
}

/** Session ids are UUID-shaped; anything else is never a session dir. */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maximum |process start − transcript birth| before a pid match is recycled. */
const PID_STALENESS_MS = 60000;

function parsePidHint(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^pid=(\d+)$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

function parseRuntimeEntry(filePath: string): MuseRuntimeEntry | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const entry = parsed as { session_id?: unknown; process_generation_hint?: unknown };
  const sessionId = typeof entry.session_id === "string" ? entry.session_id : null;
  const pid = parsePidHint(entry.process_generation_hint);
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId) || pid === null) return null;
  return { sessionId, pid };
}

/** Head-read a transcript for its recorded workspace root (bounded, cheap). */
function readWorkspaceRootHead(filePath: string, maxBytes = 8192): string | null {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return null;
  }
  try {
    const stat = fs.fstatSync(fd);
    const buf = Buffer.alloc(Math.min(maxBytes, stat.size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.toString("utf-8");
    for (const line of text.split("\n")) {
      if (!line.includes("runtime.session.metadata")) continue;
      try {
        const outer = JSON.parse(line) as {
          record_json?: string;
          payload?: { record?: { workspace_root?: unknown } };
        };
        const inner =
          typeof outer.record_json === "string"
            ? (JSON.parse(outer.record_json) as typeof outer)
            : outer;
        const root = inner.payload?.record?.workspace_root;
        if (typeof root === "string" && root) return root;
      } catch {
        /* keep scanning */
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* best effort */
    }
  }
}

export class MuseSessionLocator {
  private readonly home: string;
  private readonly runtimeDir: string;
  private readonly archiveDir: string;

  constructor(options: MuseSessionLocatorOptions = {}) {
    this.home = options.homeDir ?? homeDir();
    const store = path.join(this.home, ".local", "share", "muse");
    this.runtimeDir = options.runtimeDir ?? path.join(store, "runtime", "muse", "sessions");
    this.archiveDir = options.archiveDir ?? path.join(store, "sessions");
  }

  /**
   * Pair live Muse processes with transcripts.
   *
   * Two staged strategies, each handing unmatched processes onward:
   * 1. Runtime-file matching via `runtime/muse/sessions/<id>.json`
   *    (authoritative; guarded against recycled pids).
   * 2. Legacy cwd+birthtime heuristic over recent transcripts.
   */
  matchRunningProcesses(processes: ProcessInfo[]): MuseProcessSessionMatches {
    // Callers pass muse processes only (the adapter pre-filters via canHandle).
    const { direct, fallback: noDirect } = this.tryRuntimeFileMatching(processes);
    const legacySessions = this.discoverLiveSessions(noDirect);
    const legacyMatches =
      noDirect.length > 0 && legacySessions.length > 0
        ? matchProcessesToSessions(noDirect, legacySessions)
        : [];
    const matchedPids = new Set([
      ...direct.map((d) => d.process.pid),
      ...legacyMatches.map((m) => m.process.pid),
    ]);
    return {
      direct,
      legacyMatches,
      fallback: noDirect.filter((p) => !matchedPids.has(p.pid)),
    };
  }

  private tryRuntimeFileMatching(processes: ProcessInfo[]): {
    direct: MuseDirectMatch[];
    fallback: ProcessInfo[];
  } {
    const byPid = new Map<number, ProcessInfo>();
    for (const proc of processes) {
      if (!byPid.has(proc.pid)) byPid.set(proc.pid, proc);
    }
    const direct: MuseDirectMatch[] = [];
    const usedPids = new Set<number>();
    if (!isDirectory(this.runtimeDir)) return { direct, fallback: processes };

    for (const name of safeReaddir(this.runtimeDir)) {
      if (!name.endsWith(".json")) continue;
      const entry = parseRuntimeEntry(path.join(this.runtimeDir, name));
      if (!entry) continue;
      const proc = byPid.get(entry.pid);
      if (!proc || usedPids.has(proc.pid)) continue;
      const transcript = this.findTranscriptById(entry.sessionId);
      if (!transcript) continue;
      // Guard against pid recycling: the live process must have started
      // around the transcript's creation.
      const birth = safeStat(transcript)?.birthtimeMs;
      const start = proc.startTime?.getTime();
      if (birth === undefined || start === undefined) continue;
      if (Math.abs(start - birth) > PID_STALENESS_MS) continue;
      usedPids.add(proc.pid);
      direct.push({
        process: proc,
        sessionFile: {
          sessionId: entry.sessionId,
          filePath: transcript,
          projectDir: path.dirname(transcript),
          birthtimeMs: birth,
          resolvedCwd: proc.cwd ?? "",
        },
      });
    }
    return { direct, fallback: processes.filter((p) => !usedPids.has(p.pid)) };
  }

  /** Recent transcripts for legacy cwd+birthtime matching (today-first, bounded). */
  discoverLiveSessions(processes: ProcessInfo[]): SessionFile[] {
    const cwds = new Set(processes.map((p) => p.cwd).filter((cwd): cwd is string => !!cwd));
    if (cwds.size === 0 || !isDirectory(this.archiveDir)) return [];
    const dayDirs = this.listDayDirs().slice(-2);
    const sessionFiles: SessionFile[] = [];
    for (const dayDir of dayDirs) {
      for (const name of safeReaddir(dayDir)) {
        if (!SESSION_ID_PATTERN.test(name)) continue;
        const filePath = path.join(dayDir, name, "session.jsonl");
        const stat = safeStat(filePath);
        if (!stat?.isFile() || !Number.isFinite(stat.birthtimeMs) || stat.birthtimeMs <= 0) {
          continue;
        }
        const workspaceRoot = readWorkspaceRootHead(filePath);
        if (!workspaceRoot || !cwds.has(workspaceRoot)) continue;
        sessionFiles.push({
          sessionId: name,
          filePath,
          projectDir: path.dirname(filePath),
          birthtimeMs: stat.birthtimeMs,
          resolvedCwd: workspaceRoot,
        });
      }
    }
    return sessionFiles;
  }

  /**
   * Every archived transcript: walks `sessions/yyyy/mm/dd/<uuid>/session.jsonl`.
   * Only directories matching the session-id pattern that contain a transcript
   * are returned; `subagent/`, logs, and databases never match.
   */
  discoverHistoricalSessionFiles(): Array<{ filePath: string; defaultCwd: string }> {
    const out: Array<{ filePath: string; defaultCwd: string }> = [];
    for (const filePath of this.walkTranscripts()) {
      out.push({ filePath, defaultCwd: "" });
    }
    return out;
  }

  findHistoricalSessionFilesById(
    sessionId: string,
  ): Array<{ filePath: string; defaultCwd: string }> {
    if (!isSafePathSegment(sessionId) || !SESSION_ID_PATTERN.test(sessionId)) return [];
    const filePath = this.findTranscriptById(sessionId);
    return filePath ? [{ filePath, defaultCwd: "" }] : [];
  }

  /** Exact transcript lookup by session id across dated dirs. */
  findTranscriptById(sessionId: string): string | null {
    if (!isSafePathSegment(sessionId) || !SESSION_ID_PATTERN.test(sessionId)) return null;
    for (const dayDir of this.listDayDirs()) {
      const filePath = path.join(dayDir, sessionId, "session.jsonl");
      if (safeStat(filePath)?.isFile()) return filePath;
    }
    return null;
  }

  private walkTranscripts(): string[] {
    const out: string[] = [];
    for (const dayDir of this.listDayDirs()) {
      for (const name of safeReaddir(dayDir)) {
        if (!SESSION_ID_PATTERN.test(name)) continue;
        const filePath = path.join(dayDir, name, "session.jsonl");
        if (safeStat(filePath)?.isFile()) out.push(filePath);
      }
    }
    return out;
  }

  /** Dated directories `sessions/yyyy/mm/dd`, each level guarded by a pattern. */
  private listDayDirs(): string[] {
    const out: string[] = [];
    if (!isDirectory(this.archiveDir)) return out;
    for (const yyyy of safeReaddir(this.archiveDir)) {
      if (!/^\d{4}$/.test(yyyy)) continue;
      const yDir = path.join(this.archiveDir, yyyy);
      if (!isDirectory(yDir)) continue;
      for (const mm of safeReaddir(yDir)) {
        if (!/^\d{2}$/.test(mm)) continue;
        const mDir = path.join(yDir, mm);
        if (!isDirectory(mDir)) continue;
        for (const dd of safeReaddir(mDir)) {
          if (!/^\d{2}$/.test(dd)) continue;
          const dDir = path.join(mDir, dd);
          if (isDirectory(dDir)) out.push(dDir);
        }
      }
    }
    return out;
  }
}
