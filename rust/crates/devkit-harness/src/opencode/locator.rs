//! OpenCodeSessionLocator port — `opencode.db` session lookup by directory.

use rusqlite::Connection;
use std::path::{Path, PathBuf};

/// `<dbPath>::<sessionId>` session ref separator.
pub const SESSION_REF_SEP: &str = "::";

/// `OpenCodeSession` — id + directory + time_created.
pub struct Session {
    pub session_id: String,
    pub directory: String,
    pub time_created_ms: i64,
}

/// `resolveDbPath` — `XDG_DATA_HOME` (empty falls back) or
/// `~/.local/share`, plus `opencode/opencode.db`.
pub fn resolve_db_path(home: &Path) -> PathBuf {
    let xdg = std::env::var("XDG_DATA_HOME")
        .ok()
        .filter(|s| !s.is_empty());
    resolve_db_path_with(xdg.as_deref(), home)
}

/// Env-free core of `resolveDbPath` — testable without mutating process env.
pub fn resolve_db_path_with(xdg_data_home: Option<&str>, home: &Path) -> PathBuf {
    let base = xdg_data_home
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local").join("share"));
    base.join("opencode").join("opencode.db")
}

/// `openDb` — readonly open; missing/unopenable db yields None.
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

/// `findSessionForDirectory` — newest session row for the directory.
pub fn find_session_for_directory(db: &Connection, directory: &str) -> Option<Session> {
    db.query_row(
        "SELECT id, directory, time_created FROM session
         WHERE directory = ?1 ORDER BY time_created DESC LIMIT 1",
        [directory],
        |r| {
            Ok(Session {
                session_id: r.get::<_, String>(0)?,
                directory: r.get::<_, String>(1)?,
                time_created_ms: r.get::<_, i64>(2)?,
            })
        },
    )
    .ok()
}
