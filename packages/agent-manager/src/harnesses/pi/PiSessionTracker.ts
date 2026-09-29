import * as fs from "fs";
import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { safeReadFile } from "../../utils/session.js";

export interface PiTrackerMatch {
  process: ProcessInfo;
  filePath: string;
}

export interface PiTrackerMatchResult {
  matches: PiTrackerMatch[];
  fallback: ProcessInfo[];
}

export interface PiSessionTrackerOptions {
  sessionsDir?: string;
  trackerPath?: string;
}

export class PiSessionTracker {
  private readonly sessionsDir: string;
  private readonly trackerPath: string;

  constructor(options: PiSessionTrackerOptions = {}) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const agentDir = path.join(homeDir, ".pi", "agent");
    this.sessionsDir = options.sessionsDir ?? path.join(agentDir, "sessions");
    this.trackerPath = options.trackerPath ?? path.join(agentDir, "sessions.json");
  }

  match(processes: ProcessInfo[]): PiTrackerMatchResult {
    const tracker = this.readTracker();
    if (tracker.size === 0) return { matches: [], fallback: processes };

    const matches: PiTrackerMatch[] = [];
    const fallback: ProcessInfo[] = [];

    for (const processInfo of processes) {
      const filePath = tracker.get(processInfo.pid);
      if (!filePath || !this.isTrustedSessionPath(filePath) || !fs.existsSync(filePath)) {
        fallback.push(processInfo);
        continue;
      }

      matches.push({ process: processInfo, filePath });
    }

    return { matches, fallback };
  }

  private readTracker(): Map<number, string> {
    const content = safeReadFile(this.trackerPath);
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
      const keyPid = this.toPid(key);
      if (keyPid !== null && typeof value === "string" && value) {
        map.set(keyPid, value);
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
