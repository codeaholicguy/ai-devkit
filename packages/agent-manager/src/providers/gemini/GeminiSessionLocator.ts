import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import type { SessionFile } from "../../utils/session.js";
import { isDirectory, safeReaddir } from "../../utils/session.js";

export interface GeminiSessionDiscovery {
  sessions: SessionFile[];
  contentCache: Map<string, string>;
}

export interface GeminiSessionLocatorOptions {
  geminiTmpDir?: string;
}

interface GeminiSessionMetadata {
  sessionId?: string;
  projectHash?: string;
}

const SESSION_FILE_PREFIX = "session-";
const CHATS_DIR_NAME = "chats";

export class GeminiSessionLocator {
  private readonly geminiTmpDir: string;

  constructor(options: GeminiSessionLocatorOptions = {}) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.geminiTmpDir = options.geminiTmpDir ?? path.join(homeDir, ".gemini", "tmp");
  }

  /**
   * Discover session files for the given processes.
   *
   * Gemini CLI writes sessions to ~/.gemini/tmp/<shortId>/chats/session-*.json
   * where <shortId> is opaque (managed by a project registry). We scan every
   * shortId directory and filter by matching session.projectHash against
   * sha256(process.cwd) to bind each session to a candidate process CWD.
   */
  discoverSessions(processes: ProcessInfo[]): GeminiSessionDiscovery {
    const empty = { sessions: [] as SessionFile[], contentCache: new Map<string, string>() };
    if (!fs.existsSync(this.geminiTmpDir)) return empty;

    const cwdHashMap = this.buildCwdHashMap(processes);
    if (cwdHashMap.size === 0) return empty;

    const contentCache = new Map<string, string>();
    const sessions: SessionFile[] = [];

    let shortIdEntries: string[];
    try {
      shortIdEntries = fs.readdirSync(this.geminiTmpDir);
    } catch {
      return empty;
    }

    for (const shortId of shortIdEntries) {
      const chatsDir = path.join(this.geminiTmpDir, shortId, CHATS_DIR_NAME);
      if (!isDirectory(chatsDir)) continue;

      for (const fileName of safeReaddir(chatsDir)) {
        if (!this.isSessionFile(fileName)) continue;

        const session = this.readCandidateSession(chatsDir, fileName, cwdHashMap);
        if (!session) continue;

        contentCache.set(session.filePath, session.content);
        sessions.push(session.sessionFile);
      }
    }

    return { sessions, contentCache };
  }

  discoverHistoricalSessionFiles(): string[] {
    if (!isDirectory(this.geminiTmpDir)) return [];

    const files: string[] = [];
    for (const shortId of safeReaddir(this.geminiTmpDir)) {
      const chatsDir = path.join(this.geminiTmpDir, shortId, CHATS_DIR_NAME);
      if (!isDirectory(chatsDir)) continue;

      for (const fileName of safeReaddir(chatsDir)) {
        if (this.isSessionFile(fileName)) {
          files.push(path.join(chatsDir, fileName));
        }
      }
    }

    return files;
  }

  private readCandidateSession(
    chatsDir: string,
    fileName: string,
    cwdHashMap: Map<string, string>,
  ): { filePath: string; content: string; sessionFile: SessionFile } | null {
    const filePath = path.join(chatsDir, fileName);

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }

    const parsed = this.parseSessionMetadata(content);
    if (!parsed?.projectHash) return null;

    const resolvedCwd = cwdHashMap.get(parsed.projectHash);
    if (!resolvedCwd) return null;

    let birthtimeMs = 0;
    try {
      birthtimeMs = fs.statSync(filePath).birthtimeMs;
    } catch {
      return null;
    }

    return {
      filePath,
      content,
      sessionFile: {
        sessionId: parsed.sessionId || fileName.replace(/\.json$/, ""),
        filePath,
        projectDir: chatsDir,
        birthtimeMs,
        resolvedCwd,
      },
    };
  }

  private buildCwdHashMap(processes: ProcessInfo[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const proc of processes) {
      if (!proc.cwd) continue;

      // Gemini CLI resolves its project root by walking up from the
      // startup directory looking for a `.git` boundary marker. A
      // session's projectHash therefore tracks that ancestor rather
      // than the process' actual CWD. Enumerate every ancestor as a
      // candidate so subdirectory invocations still line up with the
      // session the Gemini process wrote.
      for (const candidate of this.candidateProjectRoots(proc.cwd)) {
        const hash = this.hashProjectRoot(candidate);
        if (!map.has(hash)) {
          map.set(hash, proc.cwd);
        }
      }
    }
    return map;
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

  private isSessionFile(fileName: string): boolean {
    return fileName.startsWith(SESSION_FILE_PREFIX) && fileName.endsWith(".json");
  }

  private parseSessionMetadata(content: string): GeminiSessionMetadata | null {
    try {
      return JSON.parse(content) as GeminiSessionMetadata;
    } catch {
      return null;
    }
  }
}
