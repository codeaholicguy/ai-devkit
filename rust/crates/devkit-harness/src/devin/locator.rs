//! DevinSessionLocator port — sessions.db path, `session_locks/*.lock`
//! listing, and the by-id / by-directory session queries.

use rusqlite::Connection;
use std::path::{Path, PathBuf};

/// `<dbPath>::<sessionSlug>` session ref separator.
pub const SESSION_REF_SEP: &str = "::";
const LOCK_FILE_SUFFIX: &str = ".lock";

/// `DevinSession` — detect-path fields; db columns are epoch SECONDS,
/// carried here *1000 (mirroring `toDevinSession`).
pub struct Session {
    pub session_id: String,
    pub directory: String,
    pub title: Option<String>,
    pub time_created_ms: i64,
    pub last_activity_at_ms: i64,
}

/// A live `session_locks/<slug>.lock` entry.
pub struct SessionLock {
    pub session_id: String,
    pub pid: i64,
}

/// `resolveDbPath` — `XDG_DATA_HOME` (empty falls back) or
/// `~/.local/share`, plus `devin/cli/sessions.db`.
pub fn resolve_db_path(home: &Path) -> PathBuf {
    let base = std::env::var("XDG_DATA_HOME")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local").join("share"));
    base.join("devin").join("cli").join("sessions.db")
}

/// `openDb` — readonly; missing/unopenable yields None.
pub fn open_db(db_path: &Path) -> Option<Connection> {
    if !db_path.exists() {
        return None;
    }
    Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()
}

/// `parseInt(raw.trim(), 10)` semantics — optional sign then a digit
/// prefix; trailing junk is fine (`"123abc"` → 123), a non-digit first
/// char is NaN.
fn parse_int_prefix(raw: &str) -> Option<i64> {
    let s = raw.trim();
    let (sign, rest) = match s.strip_prefix('-') {
        Some(r) => (-1i64, r),
        None => (1i64, s.strip_prefix('+').unwrap_or(s)),
    };
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    // Overflow → None; parseInt would give an enormous nonexistent pid
    // that never matches the snapshot anyway.
    digits.parse::<i64>().ok().map(|v| sign * v)
}

/// `listActiveLocks` — `session_locks/*.lock`; file name minus `.lock` is
/// the session slug, body parses via `parseInt` and must be > 0. Malformed
/// files are skipped; entries come back in (sorted) readdir order.
pub fn list_active_locks(locks_dir: &Path) -> Vec<SessionLock> {
    let mut locks = Vec::new();
    for name in crate::shared::list_dir_names(locks_dir) {
        let Some(session_id) = name.strip_suffix(LOCK_FILE_SUFFIX) else {
            continue;
        };
        if session_id.is_empty() {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(locks_dir.join(&name)) else {
            continue;
        };
        if let Some(pid) = parse_int_prefix(&raw).filter(|p| *p > 0) {
            locks.push(SessionLock {
                session_id: session_id.to_string(),
                pid,
            });
        }
    }
    locks
}

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<Session> {
    Ok(Session {
        session_id: row.get::<_, String>(0)?,
        directory: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        title: row.get::<_, Option<String>>(2)?,
        // `* 1000` — db timestamps are epoch seconds. NULL → 0, as in
        // JS (`null * 1000 === 0`).
        time_created_ms: row
            .get::<_, Option<i64>>(3)?
            .unwrap_or(0)
            .saturating_mul(1000),
        last_activity_at_ms: row
            .get::<_, Option<i64>>(4)?
            .unwrap_or(0)
            .saturating_mul(1000),
    })
}

const SESSION_COLS: &str = "id, working_directory, title, created_at, last_activity_at";

/// `findSessionById` — `WHERE id = ? AND hidden = 0`.
pub fn find_session_by_id(db: &Connection, session_id: &str) -> Option<Session> {
    db.query_row(
        &format!("SELECT {SESSION_COLS} FROM sessions WHERE id = ?1 AND hidden = 0"),
        [session_id],
        row_to_session,
    )
    .ok()
}

/// `findSessionForDirectory` — newest `last_activity_at` row for the dir.
pub fn find_session_for_directory(db: &Connection, directory: &str) -> Option<Session> {
    db.query_row(
        &format!(
            "SELECT {SESSION_COLS} FROM sessions
             WHERE working_directory = ?1 AND hidden = 0
             ORDER BY last_activity_at DESC LIMIT 1"
        ),
        [directory],
        row_to_session,
    )
    .ok()
}
