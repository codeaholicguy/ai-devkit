import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import type { ListSessionsOptions, SessionSummary } from "../../adapters/AgentAdapter.js";
import { OpenCodeSessionParser } from "./OpenCodeSessionParser.js";
import { homeDir } from "../shared.js";

const SESSION_REF_SEP = "::";

function encodeOpenCodeSessionRef(dbPath: string, sessionId: string): string {
  return `${dbPath}${SESSION_REF_SEP}${sessionId}`;
}

export interface OpenCodeSession {
  sessionId: string;
  directory: string;
  timeCreated: number;
  /** OpenCode's auto-generated session title (e.g. "slug-lib-75800") — metadata only, never identity. */
  title?: string;
}

interface OpenCodeSessionRow {
  id: string;
  directory: string;
  timeCreated: number;
  title?: string;
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
    const base = xdg || path.join(homeDir(), ".local", "share");
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
    const row = this.querySession(
      db,
      "WHERE directory = ? ORDER BY time_created DESC LIMIT 1",
      directory,
    );
    if (!row) return null;
    return {
      sessionId: row.id,
      directory: row.directory,
      timeCreated: row.time_created ?? 0,
      title: row.title ?? undefined,
    };
  }

  /**
   * Newer OpenCode schemas carry a `title` column (auto-generated names like
   * "slug-lib-75800"); older ones do not. Try the wide select first, then
   * fall back so either schema works.
   */
  private querySession(
    db: Database.Database,
    where: string,
    ...params: string[]
  ): { id: string; directory: string; time_created: number; title: string | null } | undefined {
    for (const cols of ["id, directory, time_created, title", "id, directory, time_created"]) {
      try {
        return db
          .prepare<
            string[],
            { id: string; directory: string; time_created: number; title: string | null }
          >(`SELECT ${cols} FROM session ${where}`)
          .get(...params);
      } catch {
        /* retry with the narrower column set */
      }
    }
    return undefined;
  }

  listSessions(opts?: ListSessionsOptions): SessionSummary[] {
    const db = this.openDb();
    if (!db) return [];

    try {
      const rows = this.querySessions("ORDER BY time_created DESC");

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
      const rows = this.querySessions("WHERE id = ?", sessionId);
      const row = rows[0];
      return row ? [this.toSessionSummary(db, row)] : [];
    } catch {
      this.close();
      return [];
    }
  }

  private querySessions(where: string, ...params: string[]): OpenCodeSessionRow[] {
    const db = this.openDb();
    if (!db) return [];
    for (const cols of [
      "id, directory, title, time_created AS timeCreated",
      "id, directory, time_created AS timeCreated",
    ]) {
      try {
        return db
          .prepare<string[], OpenCodeSessionRow>(`SELECT ${cols} FROM session ${where}`)
          .all(...params);
      } catch {
        /* retry with the narrower column set */
      }
    }
    return [];
  }

  private toSessionSummary(db: Database.Database, row: OpenCodeSessionRow): SessionSummary {
    const stats = this.parser.getSessionStats(db, row.id);
    const lastActive =
      stats.lastTimeUpdated > 0 ? new Date(stats.lastTimeUpdated) : new Date(row.timeCreated);

    return {
      type: "opencode",
      sessionId: row.id,
      cwd: row.directory,
      firstUserMessage: stats.summary || row.title || "",
      lastActive,
      startedAt: new Date(row.timeCreated),
      sessionFilePath: encodeOpenCodeSessionRef(this.dbPath, row.id),
    };
  }

  get dbFilePath(): string {
    return this.dbPath;
  }
}
