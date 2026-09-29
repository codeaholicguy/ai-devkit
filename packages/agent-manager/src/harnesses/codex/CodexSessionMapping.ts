import * as fs from "fs";
import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { safeReadFile } from "../../utils/session.js";

export interface CodexSessionMappingOptions {
  mappingPath?: string;
  sessionsDir?: string;
}

export interface CodexSessionMappingMatch {
  process: ProcessInfo;
  filePath: string;
}

export interface CodexSessionMappingResult {
  matches: CodexSessionMappingMatch[];
  fallback: ProcessInfo[];
}

export class CodexSessionMapping {
  private readonly mappingPath: string;
  private readonly sessionsDir: string;

  constructor(options: CodexSessionMappingOptions = {}) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.mappingPath =
      options.mappingPath ?? path.join(homeDir, ".codex", "ai-devkit", "sessions.json");
    this.sessionsDir = options.sessionsDir ?? path.join(homeDir, ".codex", "sessions");
  }

  match(processes: ProcessInfo[]): CodexSessionMappingResult {
    const mapping = this.read();
    if (mapping.size === 0) return { matches: [], fallback: processes };

    const matches: CodexSessionMappingMatch[] = [];
    const fallback: ProcessInfo[] = [];

    for (const processInfo of processes) {
      const filePath = mapping.get(processInfo.pid);
      if (!filePath || !this.isTrustedSessionPath(filePath) || !fs.existsSync(filePath)) {
        fallback.push(processInfo);
        continue;
      }

      matches.push({ process: processInfo, filePath });
    }

    return { matches, fallback };
  }

  private read(): Map<number, string> {
    const content = safeReadFile(this.mappingPath);
    if (content === undefined) return new Map();

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Map();
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();

    const map = new Map<number, string>();
    for (const [key, value] of Object.entries(parsed)) {
      const pid = this.toPid(key);
      if (pid !== null && typeof value === "string" && value) {
        map.set(pid, value);
      }
    }

    return map;
  }

  private toPid(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private isTrustedSessionPath(filePath: string): boolean {
    const resolvedRoot = path.resolve(this.sessionsDir);
    const resolvedPath = path.resolve(filePath);
    return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`);
  }
}
