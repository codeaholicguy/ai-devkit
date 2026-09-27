import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import type { ListSessionsOptions, SessionSummary } from "../../adapters/AgentAdapter.js";
import { OpenCodeSessionParser } from "./OpenCodeSessionParser.js";

const SESSION_REF_SEP = "::";

function encodeOpenCodeSessionRef(dbPath: string, sessionId: string): string {
  return `${dbPath}${SESSION_REF_SEP}${sessionId}`;
}

export interface OpenCodeSession {
  sessionId: string;
  directory: string;
  timeCreated: number;
}

interface OpenCodeSessionRow {
  id: string;
  directory: string;
  timeCreated: number;
}

export class OpenCodeSessionLocator {
  private readonly dbPath: string;
  private db: Database.Database | null = null;

  constructor(
    dbPath = OpenCodeSessionLocator.resolveDbPath(),
    private readonly parser: OpenCodeSessionParser = new OpenCodeSessionParser(),
  ) {
    this.dbPath = dbPath;
  }

  static resolveDbPath(): string {
    const xdg = process.env.XDG_DATA_HOME;
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const base = xdg || path.join(home, ".local", "share");
    return path.join(base, "opencode", "opencode.db");
  }

  openDb(): Database.Database | null {
    if (this.db) return this.db;
    if (!fs.existsSync(this.dbPath)) return null;

    try {
      this.db = new Database(this.dbPath, { readonly: true });
      return this.db;
    } catch {
      return null;
    }
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        /* ignore */
      }
      this.db = null;
    }
  }

  findSessionForDirectory(db: Database.Database, directory: string): OpenCodeSession | null {
    try {
      const row = db
        .prepare<[string], { id: string; directory: string; time_created: number }>(`
                SELECT id, directory, time_created
                FROM session
                WHERE directory = ?
                ORDER BY time_created DESC
                LIMIT 1
            `)
        .get(directory);

      if (!row) return null;
      return { sessionId: row.id, directory: row.directory, timeCreated: row.time_created };
    } catch {
      return null;
    }
  }

  listSessions(opts?: ListSessionsOptions): SessionSummary[] {
    const db = this.openDb();
    if (!db) return [];

    try {
      const rows = db
        .prepare<[], OpenCodeSessionRow>(`
                SELECT id, directory, time_created AS timeCreated
                FROM session
                ORDER BY time_created DESC
            `)
        .all();

      const summaries: SessionSummary[] = [];

      for (const row of rows) {
        if (opts?.cwd !== undefined && row.directory !== opts.cwd) continue;

        summaries.push(this.toSessionSummary(db, row));
      }

      return summaries;
    } catch {
      this.close();
      return [];
    }
  }

  findSessionsById(sessionId: string): SessionSummary[] {
    const db = this.openDb();
    if (!db) return [];

    try {
      const row = db
        .prepare<[string], OpenCodeSessionRow>(`
                SELECT id, directory, time_created AS timeCreated
                FROM session
                WHERE id = ?
            `)
        .get(sessionId);
      return row ? [this.toSessionSummary(db, row)] : [];
    } catch {
      this.close();
      return [];
    }
  }

  private toSessionSummary(db: Database.Database, row: OpenCodeSessionRow): SessionSummary {
    const stats = this.parser.getSessionStats(db, row.id);
    const lastActive =
      stats.lastTimeUpdated > 0 ? new Date(stats.lastTimeUpdated) : new Date(row.timeCreated);

    return {
      type: "opencode",
      sessionId: row.id,
      cwd: row.directory,
      firstUserMessage: stats.summary,
      lastActive,
      startedAt: new Date(row.timeCreated),
      sessionFilePath: encodeOpenCodeSessionRef(this.dbPath, row.id),
    };
  }

  get dbFilePath(): string {
    return this.dbPath;
  }
}
