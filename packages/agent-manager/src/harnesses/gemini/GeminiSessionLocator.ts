import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { MATCH_TOLERANCE_MS } from "../../utils/matchingConstants.js";
import type { SessionFile } from "../../utils/session.js";
import { isDirectory, safeReadFile, safeReaddir, safeStat } from "../../utils/session.js";
import { fileSignature } from "./fileSignature.js";
import { isSessionLogPath } from "./GeminiSessionParser.js";
import { homeDir } from "../shared.js";

export interface GeminiSessionDiscovery {
  sessions: SessionFile[];
}

export interface GeminiSessionLocatorOptions {
  geminiTmpDir?: string;
}

interface GeminiSessionMetadata {
  sessionId?: string;
  projectHash?: string;
}

interface CachedSessionMetadata extends GeminiSessionMetadata {
  signature: string;
}

interface CachedProjectMarker {
  signature: string;
  projectRoot: string;
}

interface CandidateProjects {
  /** sha256(projectRoot) -> process CWD that may own sessions for that root. */
  cwdByHash: Map<string, string>;
  /** Normalized candidate project roots, compared against `.project_root` markers. */
  roots: Set<string>;
}

const SESSION_FILE_PREFIX = "session-";
/** Legacy single-document sessions. */
const SESSION_DOCUMENT_EXTENSION = ".json";
/** Gemini CLI 0.46+ append-only session logs; line 1 is the metadata record. */
const SESSION_LOG_EXTENSION = ".jsonl";
const CHATS_DIR_NAME = "chats";
/** Ownership marker Gemini CLI writes into slug-named project temp dirs. */
const PROJECT_ROOT_MARKER = ".project_root";
/** Legacy Gemini CLI temp dirs are named sha256(projectRoot). */
const LEGACY_HASH_DIR_PATTERN = /^[0-9a-f]{64}$/;
/** Slack for coarse filesystem timestamp granularity. */
const MTIME_SLACK_MS = 2 * 1000;
/**
 * Both formats start with sessionId/projectHash (a legacy document's leading
 * keys, a log's line-1 metadata record); a small head is enough.
 */
const METADATA_HEAD_BYTES = 8 * 1024;

export class GeminiSessionLocator {
  private readonly geminiTmpDir: string;
  private metadataCache = new Map<string, CachedSessionMetadata>();
  private markerCache = new Map<string, CachedProjectMarker>();

  constructor(options: GeminiSessionLocatorOptions = {}) {
    this.geminiTmpDir = options.geminiTmpDir ?? path.join(homeDir(), ".gemini", "tmp");
  }

  /**
   * Discover session files for the given processes.
   *
   * Gemini CLI writes sessions to ~/.gemini/tmp/<shortId>/chats/session-*.jsonl
   * (0.46+; older versions wrote session-*.json) where <shortId> is either sha256(projectRoot) (legacy) or a slug whose
   * owner is recorded in <shortId>/.project_root. Each session's projectHash
   * is matched against sha256 of every candidate project root of a process.
   *
   * To keep each refresh cheap:
   * - project dirs whose name or marker can't belong to a candidate root are
   *   skipped without listing or opening their chats;
   * - chat files last modified before the earliest candidate process start
   *   (minus the matching tolerance) are skipped after a stat;
   * - sessionId/projectHash come from a bounded head read, cached by
   *   inode+size+mtime, so unchanged files are never re-read.
   */
  discoverSessions(processes: ProcessInfo[]): GeminiSessionDiscovery {
    const empty: GeminiSessionDiscovery = { sessions: [] };
    if (!fs.existsSync(this.geminiTmpDir)) return empty;

    const candidates = this.buildCandidateProjects(processes);
    if (candidates.cwdByHash.size === 0) return empty;

    let shortIdEntries: string[];
    try {
      shortIdEntries = fs.readdirSync(this.geminiTmpDir);
    } catch {
      return empty;
    }

    const minMtimeMs = this.earliestMatchableMtime(processes);
    const nextMetadataCache = new Map<string, CachedSessionMetadata>();
    const nextMarkerCache = new Map<string, CachedProjectMarker>();
    const sessions: SessionFile[] = [];

    for (const shortId of shortIdEntries) {
      const projectDir = path.join(this.geminiTmpDir, shortId);
      if (!this.mayBelongToCandidates(projectDir, shortId, candidates, nextMarkerCache)) continue;

      const chatsDir = path.join(projectDir, CHATS_DIR_NAME);
      if (!isDirectory(chatsDir)) continue;

      for (const fileName of this.listSessionFileNames(chatsDir)) {
        const session = this.readCandidateSession(
          chatsDir,
          fileName,
          candidates.cwdByHash,
          minMtimeMs,
          nextMetadataCache,
        );
        if (session) sessions.push(session);
      }
    }

    // Keep metadata only for files still in scope so the caches stay bounded.
    this.metadataCache = nextMetadataCache;
    this.markerCache = nextMarkerCache;
    return { sessions };
  }

  discoverHistoricalSessionFiles(): string[] {
    if (!isDirectory(this.geminiTmpDir)) return [];

    const files: string[] = [];
    for (const shortId of safeReaddir(this.geminiTmpDir)) {
      const chatsDir = path.join(this.geminiTmpDir, shortId, CHATS_DIR_NAME);
      if (!isDirectory(chatsDir)) continue;

      for (const fileName of this.listSessionFileNames(chatsDir)) {
        files.push(path.join(chatsDir, fileName));
      }
    }

    return files;
  }

  private readCandidateSession(
    chatsDir: string,
    fileName: string,
    cwdByHash: Map<string, string>,
    minMtimeMs: number,
    nextMetadataCache: Map<string, CachedSessionMetadata>,
  ): SessionFile | null {
    const filePath = path.join(chatsDir, fileName);

    const stat = safeStat(filePath);
    if (!stat || stat.mtimeMs < minMtimeMs) return null;

    const metadata = this.readSessionMetadata(filePath, stat);
    nextMetadataCache.set(filePath, metadata);
    if (!metadata.projectHash) return null;

    const resolvedCwd = cwdByHash.get(metadata.projectHash);
    if (!resolvedCwd) return null;

    return {
      sessionId: metadata.sessionId || fileName.replace(/\.jsonl?$/, ""),
      filePath,
      projectDir: chatsDir,
      birthtimeMs: stat.birthtimeMs,
      resolvedCwd,
    };
  }

  private readSessionMetadata(filePath: string, stat: fs.Stats): CachedSessionMetadata {
    const signature = fileSignature(stat);
    const cached = this.metadataCache.get(filePath);
    if (cached?.signature === signature) return cached;

    return { signature, ...this.extractSessionMetadata(filePath) };
  }

  /**
   * Read sessionId/projectHash from the first METADATA_HEAD_BYTES. Files that
   * fit in the head are parsed as JSON exactly; larger files are scanned for
   * the leading keys and only fully parsed when the head lacks them.
   */
  private extractSessionMetadata(filePath: string): GeminiSessionMetadata {
    const head = this.readHead(filePath);
    if (head === null) return {};
    if (isSessionLogPath(filePath)) return this.extractLogMetadata(head);
    if (head.complete) return this.pickMetadata(this.parseSessionMetadata(head.text));

    const sessionId = this.matchStringField(head.text, "sessionId");
    const projectHash = this.matchStringField(head.text, "projectHash");
    if (sessionId !== undefined && projectHash !== undefined) {
      return { sessionId, projectHash };
    }

    const content = safeReadFile(filePath);
    if (content === undefined) return {};
    return this.pickMetadata(this.parseSessionMetadata(content));
  }

  /**
   * A `.jsonl` log's metadata is its first line. Never fall back to reading
   * the whole log: it only grows, and a log whose first record is not
   * metadata cannot be attributed from its head anyway.
   */
  private extractLogMetadata(head: { text: string; complete: boolean }): GeminiSessionMetadata {
    const newline = head.text.indexOf("\n");
    if (newline !== -1 || head.complete) {
      const firstLine = newline === -1 ? head.text : head.text.slice(0, newline);
      return this.pickMetadata(this.parseSessionMetadata(firstLine));
    }
    // First line longer than the head: pick the leading keys from its prefix.
    return {
      sessionId: this.matchStringField(head.text, "sessionId"),
      projectHash: this.matchStringField(head.text, "projectHash"),
    };
  }

  private readHead(filePath: string): { text: string; complete: boolean } | null {
    let fd: number | undefined;
    try {
      fd = fs.openSync(filePath, "r");
      // One extra byte tells "exactly METADATA_HEAD_BYTES long" from "longer".
      const buffer = Buffer.alloc(METADATA_HEAD_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const bytesRead = fs.readSync(fd, buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      return {
        text: buffer.toString("utf-8", 0, Math.min(length, METADATA_HEAD_BYTES)),
        complete: length <= METADATA_HEAD_BYTES,
      };
    } catch {
      return null;
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          // Nothing useful to do if closing a read-only descriptor fails.
        }
      }
    }
  }

  private matchStringField(text: string, key: string): string | undefined {
    const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
    if (!match) return undefined;
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return undefined;
    }
  }

  private pickMetadata(parsed: GeminiSessionMetadata | null): GeminiSessionMetadata {
    if (!parsed || typeof parsed !== "object") return {};
    return { sessionId: parsed.sessionId, projectHash: parsed.projectHash };
  }

  /**
   * Decide from the directory name or its `.project_root` marker whether a
   * project temp dir can hold sessions for a candidate root. Dirs with no
   * recognisable ownership are scanned conservatively.
   */
  private mayBelongToCandidates(
    projectDir: string,
    shortId: string,
    candidates: CandidateProjects,
    nextMarkerCache: Map<string, CachedProjectMarker>,
  ): boolean {
    if (LEGACY_HASH_DIR_PATTERN.test(shortId)) return candidates.cwdByHash.has(shortId);

    const projectRoot = this.readProjectMarker(projectDir, nextMarkerCache);
    if (projectRoot === undefined) return true;
    return candidates.roots.has(this.normalizeRoot(projectRoot));
  }

  private readProjectMarker(
    projectDir: string,
    nextMarkerCache: Map<string, CachedProjectMarker>,
  ): string | undefined {
    const markerPath = path.join(projectDir, PROJECT_ROOT_MARKER);
    const stat = safeStat(markerPath);
    if (!stat?.isFile()) return undefined;

    const signature = fileSignature(stat);
    const cached = this.markerCache.get(markerPath);
    const projectRoot =
      cached?.signature === signature ? cached.projectRoot : safeReadFile(markerPath)?.trim();
    if (!projectRoot) return undefined;

    nextMarkerCache.set(markerPath, { signature, projectRoot });
    return projectRoot;
  }

  private earliestMatchableMtime(processes: ProcessInfo[]): number {
    let earliestStartMs = Number.POSITIVE_INFINITY;
    for (const proc of processes) {
      if (!proc.cwd || !proc.startTime) continue;
      const startMs = proc.startTime.getTime();
      if (Number.isFinite(startMs)) earliestStartMs = Math.min(earliestStartMs, startMs);
    }
    // No start times: nothing can be windowed safely, so scan every file.
    if (!Number.isFinite(earliestStartMs)) return Number.NEGATIVE_INFINITY;
    // A file last modified before (earliest start - matcher tolerance) was also
    // born before it, so it can never be matched to any candidate process.
    return earliestStartMs - MATCH_TOLERANCE_MS - MTIME_SLACK_MS;
  }

  private buildCandidateProjects(processes: ProcessInfo[]): CandidateProjects {
    const cwdByHash = new Map<string, string>();
    const roots = new Set<string>();
    for (const proc of processes) {
      if (!proc.cwd) continue;

      // Gemini CLI resolves its project root by walking up from the
      // startup directory looking for a `.git` boundary marker. A
      // session's projectHash therefore tracks that ancestor rather
      // than the process' actual CWD. Enumerate every ancestor as a
      // candidate so subdirectory invocations still line up with the
      // session the Gemini process wrote.
      for (const candidate of this.candidateProjectRoots(proc.cwd)) {
        roots.add(this.normalizeRoot(candidate));
        const hash = this.hashProjectRoot(candidate);
        if (!cwdByHash.has(hash)) {
          cwdByHash.set(hash, proc.cwd);
        }
      }
    }
    return { cwdByHash, roots };
  }

  /** Match Gemini CLI's project registry normalization (lower-cased on Windows). */
  private normalizeRoot(projectRoot: string): string {
    const resolved = path.resolve(projectRoot);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  private candidateProjectRoots(cwd: string): string[] {
    const roots: string[] = [];
    let current = path.resolve(cwd);
    let parent = path.dirname(current);
    while (parent !== current) {
      roots.push(current);
      current = parent;
      parent = path.dirname(current);
    }
    roots.push(current);
    return roots;
  }

  private hashProjectRoot(projectRoot: string): string {
    return crypto.createHash("sha256").update(projectRoot).digest("hex");
  }

  /**
   * Session files in a chats dir, in both formats. Resuming a legacy session
   * makes Gemini CLI continue it in `<name>.jsonl` next to the stale
   * `<name>.json`, so a `.json` with a `.jsonl` sibling is skipped.
   */
  private listSessionFileNames(chatsDir: string): string[] {
    const sessionFiles = safeReaddir(chatsDir).filter((fileName) => this.isSessionFile(fileName));
    const names = new Set(sessionFiles);
    return sessionFiles.filter(
      (fileName) =>
        !fileName.endsWith(SESSION_DOCUMENT_EXTENSION) ||
        !names.has(this.toSessionLogName(fileName)),
    );
  }

  private toSessionLogName(documentFileName: string): string {
    const baseName = documentFileName.slice(0, -SESSION_DOCUMENT_EXTENSION.length);
    return `${baseName}${SESSION_LOG_EXTENSION}`;
  }

  private isSessionFile(fileName: string): boolean {
    return (
      fileName.startsWith(SESSION_FILE_PREFIX) &&
      (fileName.endsWith(SESSION_DOCUMENT_EXTENSION) || fileName.endsWith(SESSION_LOG_EXTENSION))
    );
  }

  private parseSessionMetadata(content: string): GeminiSessionMetadata | null {
    try {
      return JSON.parse(content) as GeminiSessionMetadata;
    } catch {
      return null;
    }
  }
}
