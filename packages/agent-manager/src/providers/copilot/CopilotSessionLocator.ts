import * as path from "path";
import { isDirectory, safeReaddir } from "../../utils/session.js";

export interface CopilotLock {
  sessionDir: string;
  sessionId: string;
  pid: number;
}

export interface CopilotSessionDir {
  sessionDir: string;
  sessionId: string;
}

export interface CopilotSessionLocatorOptions {
  sessionStateDir?: string;
}

export class CopilotSessionLocator {
  private readonly sessionStateDir: string;

  constructor(options: CopilotSessionLocatorOptions = {}) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.sessionStateDir =
      options.sessionStateDir ?? path.join(homeDir, ".copilot", "session-state");
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

  discoverActiveLocks(): CopilotLock[] {
    const locks: CopilotLock[] = [];
    for (const { sessionDir, sessionId } of this.listSessionDirs()) {
      for (const entry of safeReaddir(sessionDir)) {
        const match = entry.match(/^inuse\.(\d+)\.lock$/);
        if (!match) continue;

        const pid = Number.parseInt(match[1], 10);
        if (!Number.isFinite(pid)) continue;
        locks.push({ sessionDir, sessionId, pid });
      }
    }

    return locks;
  }
}
