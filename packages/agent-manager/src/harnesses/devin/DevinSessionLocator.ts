import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import type { ListSessionsOptions, SessionSummary } from "../../adapters/AgentAdapter.js";
import { DevinSessionParser } from "./DevinSessionParser.js";
import { homeDir } from "../shared.js";

const SESSION_REF_SEP = "::";
const LOCK_FILE_SUFFIX = ".lock";

export function encodeDevinSessionRef(dbPath: string, sessionId: string): string {
  return `${dbPath}${SESSION_REF_SEP}${sessionId}`;
}

/** Inverse of {@link encodeDevinSessionRef}; null when the ref has no separator. */
export function decodeDevinSessionRef(ref: string): string | null {
  const idx = ref.lastIndexOf(SESSION_REF_SEP);
  return idx === -1 ? null : ref.slice(idx + SESSION_REF_SEP.length);
}

export interface DevinSession {
  sessionId: string;
  directory: string;
  title: string | null;
  /** Epoch milliseconds. */
  timeCreated: number;
  /** Epoch milliseconds. */
  lastActivityAt: number;
}

/** A live `session_locks/<slug>.lock` entry: the session and its holder PID. */
export interface DevinSessionLock {
  sessionId: string;
  pid: number;
}

interface DevinSessionRow {
  id: string;
  working_directory: string;
  title: string | null;
  created_at: number;
  last_activity_at: number;
}

function toDevinSession(row: DevinSessionRow): DevinSession {
  return {
    sessionId: row.id,
    directory: row.working_directory,
    title: row.title,
    timeCreated: row.created_at * 1000,
    lastActivityAt: row.last_activity_at * 1000,
  };
}

export class DevinSessionLocator {
  private readonly dbPath: string;
  private readonly locksDir: string;
  private db: Database.Database | null = null;

  constructor(
    dbPath = DevinSessionLocator.resolveDbPath(),
    locksDir = DevinSessionLocator.defaultLocksDir(dbPath),
    private readonly parser: DevinSessionParser = new DevinSessionParser(),
  ) {
    this.dbPath = dbPath;
    this.locksDir = locksDir;
  }

  static resolveDbPath(): string {
    const xdg = process.env.XDG_DATA_HOME;
    const base = xdg || path.join(homeDir(), ".local", "share");
    return path.join(base, "devin", "cli", "sessions.db");
  }

  static defaultLocksDir(dbPath: string): string {
    return path.join(path.dirname(dbPath), "session_locks");
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

  /**
   * Read `session_locks/*.lock` entries. Each file name is a session slug and
   * its body is the PID of the `devin acp` backend holding the session.
   * Malformed files are skipped; callers validate liveness against the
   * process snapshot.
   */
  listActiveLocks(): DevinSessionLock[] {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.locksDir);
    } catch {
      return [];
    }

    const locks: DevinSessionLock[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(LOCK_FILE_SUFFIX)) continue;
      const sessionId = entry.slice(0, -LOCK_FILE_SUFFIX.length);
      if (!sessionId) continue;

      try {
        const raw = fs.readFileSync(path.join(this.locksDir, entry), "utf-8").trim();
        const pid = parseInt(raw, 10);
        if (Number.isFinite(pid) && pid > 0) locks.push({ sessionId, pid });
      } catch {
        /* skip unreadable lock */
      }
    }
    return locks;
  }

  findSessionById(db: Database.Database, sessionId: string): DevinSession | null {
    try {
      const row = db
        .prepare<[string], DevinSessionRow>(`
                SELECT id, working_directory, title, created_at, last_activity_at
                FROM sessions
                WHERE id = ? AND hidden = 0
            `)
        .get(sessionId);
      return row ? toDevinSession(row) : null;
    } catch {
      return null;
    }
  }

  findSessionForDirectory(db: Database.Database, directory: string): DevinSession | null {
    try {
      const row = db
        .prepare<[string], DevinSessionRow>(`
                SELECT id, working_directory, title, created_at, last_activity_at
                FROM sessions
                WHERE working_directory = ? AND hidden = 0
                ORDER BY last_activity_at DESC
                LIMIT 1
            `)
        .get(directory);
      return row ? toDevinSession(row) : null;
    } catch {
      return null;
    }
  }

  listSessions(opts?: ListSessionsOptions): SessionSummary[] {
    const db = this.openDb();
    if (!db) return [];

    try {
      const rows = db
        .prepare<[], DevinSessionRow>(`
                SELECT id, working_directory, title, created_at, last_activity_at
                FROM sessions
                WHERE hidden = 0
                ORDER BY last_activity_at DESC
            `)
        .all();

      const summaries: SessionSummary[] = [];
      for (const row of rows) {
        if (opts?.cwd !== undefined && row.working_directory !== opts.cwd) continue;
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
        .prepare<[string], DevinSessionRow>(`
                SELECT id, working_directory, title, created_at, last_activity_at
                FROM sessions
                WHERE id = ? AND hidden = 0
            `)
        .get(sessionId);
      return row ? [this.toSessionSummary(db, row)] : [];
    } catch {
      this.close();
      return [];
    }
  }

  private toSessionSummary(db: Database.Database, row: DevinSessionRow): SessionSummary {
    const session = toDevinSession(row);
    return {
      type: "devin",
      sessionId: session.sessionId,
      cwd: session.directory,
      firstUserMessage: this.parser.getFirstUserMessage(db, session.sessionId),
      lastActive: new Date(session.lastActivityAt),
      startedAt: new Date(session.timeCreated),
      sessionFilePath: encodeDevinSessionRef(this.dbPath, session.sessionId),
    };
  }

  get dbFilePath(): string {
    return this.dbPath;
  }

  get sessionLocksDir(): string {
    return this.locksDir;
  }
}
