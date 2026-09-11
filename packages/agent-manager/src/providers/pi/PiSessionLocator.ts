import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { matchProcessesToSessions, type MatchResult } from "../../utils/matching.js";
import { isDirectory, safeReaddir, safeStat, type SessionFile } from "../../utils/session.js";
import { PiSessionParser } from "./PiSessionParser.js";

export interface PiSessionLocatorOptions {
  sessionsDir?: string;
}

export interface PiProcessSessionMatches {
  legacyMatches: MatchResult[];
  fallback: ProcessInfo[];
}

export class PiSessionLocator {
  private readonly sessionsDir: string;

  constructor(
    options: PiSessionLocatorOptions = {},
    private readonly parser: PiSessionParser = new PiSessionParser(),
  ) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.sessionsDir = options.sessionsDir ?? path.join(homeDir, ".pi", "agent", "sessions");
  }

  matchRunningProcesses(processes: ProcessInfo[]): PiProcessSessionMatches {
    if (processes.length === 0) return { legacyMatches: [], fallback: [] };

    const sessions = this.discoverLiveSessions(processes);
    if (sessions.length === 0) return { legacyMatches: [], fallback: processes };

    return {
      legacyMatches: matchProcessesToSessions(processes, sessions),
      fallback: processes,
    };
  }

  discoverLiveSessions(processes: ProcessInfo[] = []): SessionFile[] {
    if (!isDirectory(this.sessionsDir)) return [];

    const cwdByProjectDir = this.buildProjectDirCwdMap(processes);
    const sessions: SessionFile[] = [];
    for (const filePath of this.discoverHistoricalSessionFiles()) {
      const stat = safeStat(filePath);
      if (!stat) continue;

      const session = this.parser.readSession(filePath);
      const sessionId = session?.sessionId || this.parser.sessionIdFromFile(filePath);
      const projectDir = path.dirname(filePath);
      sessions.push({
        sessionId,
        filePath,
        projectDir,
        birthtimeMs: stat.birthtimeMs || stat.mtimeMs,
        resolvedCwd: session?.projectPath || cwdByProjectDir.get(path.basename(projectDir)) || "",
      });
    }

    return sessions;
  }

  discoverHistoricalSessionFiles(): string[] {
    return this.collectJsonlFiles(this.sessionsDir);
  }

  private buildProjectDirCwdMap(processes: ProcessInfo[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const proc of processes) {
      if (!proc.cwd) continue;
      map.set(this.encodeProjectDir(proc.cwd), proc.cwd);
    }
    return map;
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
