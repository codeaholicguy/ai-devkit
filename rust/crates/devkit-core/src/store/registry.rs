//! Agent registration lifecycle + legacy `agents.db` bridge — an
//! `impl Store` block living in the `store` module's child file so the
//! observed-process snapshot (`store.rs`) and the registry don't share a
//! 900-line file. Registered rows (name non-NULL) follow their own rules:
//! tombstone on disappearance, full delete on pid reuse, unique live names.

use super::{chrono_now, iso8601_utc, Store};
use anyhow::Result;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::PathBuf;

/// One row of the legacy agents.db `agents` table.
type LegacyRow = (String, i64, String, String, String, i64, String, String);

/// Registration fields carried into the legacy dual-write.
struct RegWrite<'a> {
    pid: i64,
    name: &'a str,
    agent_type: &'a str,
    cwd: &'a str,
    runtime: &'a str,
    runtime_ref: &'a Value,
    now_ms: i64,
}

/// Registry row as stored on the agents table.
#[derive(Debug, Clone)]
pub struct Registration {
    pub pid: i64,
    pub name: String,
    pub agent_type: String,
    pub runtime: String,
    pub runtime_ref: String,
    pub pinned: bool,
    /// None while registered-but-not-yet-swept, or when tombstoned before
    /// the process was ever observed.
    pub start_time_ms: Option<i64>,
    /// Some(_) once a sweep confirmed the process disappeared.
    pub gone_at: Option<i64>,
}

impl Store {
    /// Point the store at the legacy registry db. Absence of the file is not
    /// an error — dual-write/import just no-op.
    pub fn set_legacy_db(&self, path: PathBuf) -> Result<()> {
        *self.legacy_db.lock().unwrap() = Some(path);
        Ok(())
    }

    /// Claim a pid's row with registry metadata. `start_time_ms` is left
    /// untouched — NULL until a sweep adopts the real value — so the
    /// snapshot diff above recognizes the row as registered-not-yet-swept.
    /// Dual-writes into the legacy agents.db when one is configured.
    pub fn register_start(
        &self,
        pid: i64,
        name: &str,
        agent_type: &str,
        cwd: &str,
        runtime: &str,
        runtime_ref: &Value,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono_now();
        conn.execute(
            "INSERT INTO agents (pid, name, agent_type, runtime, runtime_ref,
                                 cwd, registered_at, first_seen, last_seen)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
             ON CONFLICT(pid) DO UPDATE SET
               name=excluded.name, agent_type=excluded.agent_type,
               runtime=excluded.runtime, runtime_ref=excluded.runtime_ref,
               registered_at=excluded.registered_at,
               last_seen=excluded.last_seen, gone_at=NULL",
            params![
                pid,
                name,
                agent_type,
                runtime,
                serde_json::to_string(runtime_ref)?,
                cwd,
                now,
                now
            ],
        )?;
        drop(conn);
        self.dual_write_legacy(&RegWrite {
            pid,
            name,
            agent_type,
            cwd,
            runtime,
            runtime_ref,
            now_ms: now,
        });
        Ok(())
    }

    /// Best-effort mirror of a registration into the legacy agents.db so
    /// unmigrated consumers (send/kill/rename/open, channel bridges) still
    /// resolve the agent. Silent on any failure — the daemon db is
    /// authoritative and the file may legitimately not exist.
    fn dual_write_legacy(&self, w: &RegWrite) {
        let Some(path) = self.legacy_db.lock().unwrap().clone() else {
            return;
        };
        if !path.exists() {
            return;
        }
        let tmux_session = if w.runtime == "tmux" {
            w.runtime_ref["session"].as_str().unwrap_or(w.name)
        } else {
            ""
        };
        let now_iso = iso8601_utc(w.now_ms);
        if let Err(e) = (|| -> Result<()> {
            let conn = Connection::open(&path)?;
            conn.execute(
                "INSERT OR REPLACE INTO agents
                   (type,pid,name,tmux_session,cwd,started_at,session_id,
                    session_file_path,updated_at,pinned,runtime,runtime_ref)
                 VALUES (?1,?2,?3,?4,?5,?6,'','',?6,0,?7,?8)",
                params![
                    w.agent_type,
                    w.pid,
                    w.name,
                    tmux_session,
                    w.cwd,
                    now_iso,
                    w.runtime,
                    serde_json::to_string(w.runtime_ref)?,
                ],
            )?;
            Ok(())
        })() {
            tracing::warn!("legacy agents.db dual-write failed: {e:#}");
        }
    }

    /// Delta-import legacy agents.db rows: live rows get the name attached
    /// (attach-by-pid), unknown pids become dead-by-default tombstones
    /// (gone_at set → no phantom disappeared for stale rows). Daemon rows
    /// always win — `AND name IS NULL` / `OR IGNORE` keep them untouched.
    ///
    /// Attach-by-pid could mislabel a process when a legacy pid was recycled
    /// between the legacy write and daemon boot — an accepted narrow race,
    /// the wrong name dies with that process's next sweep.
    /// Read all rows from the legacy DB. Returns None when the bridge is
    /// off or the file is absent/unreadable — import is best-effort.
    fn read_legacy_rows(&self) -> Result<Vec<LegacyRow>> {
        let Some(path) = self.legacy_db.lock().unwrap().clone() else {
            return Ok(vec![]);
        };
        if !path.exists() {
            return Ok(vec![]);
        }
        let legacy =
            match Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("legacy agents.db unreadable ({e:#}); skipping import");
                    return Ok(vec![]);
                }
            };
        let mut stmt = match legacy
            .prepare("SELECT type,pid,name,cwd,started_at,pinned,runtime,runtime_ref FROM agents")
        {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("legacy agents.db lacks agents table ({e:#}); skipping import");
                return Ok(vec![]);
            }
        };
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    /// Merge legacy rows into the registry: attach to a live row for the
    /// same pid, else insert as a tombstone (dead-by-default; the sweep
    /// reanimates it if the pid is actually alive).
    pub fn import_legacy_agents(&self) -> Result<()> {
        let rows = self.read_legacy_rows()?;

        let conn = self.conn.lock().unwrap();
        let now = chrono_now();
        for row in rows {
            let (agent_type, pid, name, cwd, _started_at, pinned, runtime, runtime_ref) = row;
            // Attach to a live, unclaimed row for the same pid.
            let attached = conn.execute(
                "UPDATE agents SET name=?1, agent_type=?2, runtime=?3,
                   runtime_ref=?4, pinned=?5, registered_at=?6
                 WHERE pid=?7 AND name IS NULL",
                params![name, agent_type, runtime, runtime_ref, pinned, now, pid],
            )?;
            if attached == 0 {
                conn.execute(
                    "INSERT OR IGNORE INTO agents
                       (pid, name, agent_type, runtime, runtime_ref, cwd,
                        pinned, registered_at, gone_at, first_seen, last_seen)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8,?8,?8)",
                    params![
                        pid,
                        name,
                        agent_type,
                        runtime,
                        runtime_ref,
                        cwd,
                        pinned,
                        now
                    ],
                )?;
            }
        }
        Ok(())
    }

    /// Look up a registered agent by name (live or tombstoned).
    pub fn lookup_name(&self, name: &str) -> Result<Option<Registration>> {
        let conn = self.conn.lock().unwrap();
        let mut s = conn.prepare(
            "SELECT pid, name, agent_type, runtime, runtime_ref, pinned,
                    start_time_ms, gone_at
             FROM agents WHERE name=?1",
        )?;
        let mut rows = s
            .query_map(params![name], |r| {
                Ok(Registration {
                    pid: r.get(0)?,
                    name: r.get(1)?,
                    agent_type: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    runtime: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    runtime_ref: r.get(4)?,
                    pinned: r.get::<_, i64>(5)? != 0,
                    start_time_ms: r.get(6)?,
                    gone_at: r.get(7)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows.pop())
    }

    /// Remove a pid's registration row entirely (dead pending registration
    /// cleared ahead of a fresh start).
    pub fn unregister(&self, pid: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM agents WHERE pid=?1 AND name IS NOT NULL",
            params![pid],
        )?;
        Ok(())
    }

    /// Drop tombstoned registrations (gone_at set) — the prune half of the
    /// start-time name check.
    pub fn prune_dead(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let pids: Vec<i64> = conn
            .prepare("SELECT pid FROM agents WHERE name IS NOT NULL AND gone_at IS NOT NULL")?
            .query_map([], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        // gone_at is sweep bookkeeping — prune only tombstones whose pid is
        // actually dead. A tombstoned-but-alive row keeps its registration;
        // deleting it would free a name that is still in use.
        let mut n = 0;
        for pid in pids {
            if !crate::discover::pid_alive(pid) {
                n += conn.execute("DELETE FROM agents WHERE pid=?1", params![pid])?;
            }
        }
        Ok(n)
    }

    /// Registry overlays for live rows: pid -> (name, pinned). Tombstones
    /// excluded — dead registrations don't label live observations.
    pub fn registry_overlays(&self) -> Result<std::collections::HashMap<i64, (String, bool)>> {
        let conn = self.conn.lock().unwrap();
        let mut s = conn.prepare(
            "SELECT pid, name, pinned FROM agents
             WHERE name IS NOT NULL AND gone_at IS NULL",
        )?;
        let rows = s
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    (r.get::<_, String>(1)?, r.get::<_, i64>(2)? != 0),
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows.into_iter().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::tests::{proc_started, tmp_store};
    use serde_json::json;
    #[test]
    fn register_marks_row_without_clobbering_sweep_fields() {
        let (s, _p) = tmp_store();
        s.apply_agent_snapshot(&[proc_started(10, 1000)]).unwrap();
        s.register_start(
            10,
            "my-agent",
            "codex",
            "/tmp",
            "tmux",
            &json!({"session":"my-agent"}),
        )
        .unwrap();
        let row = &s.list_agents().unwrap()[0];
        assert_eq!(row["name"], "my-agent");
        assert_eq!(row["agentType"], "codex");
        assert_eq!(row["runtime"], "tmux");
        assert_eq!(row["startTime"], 1000); // sweep fields preserved
        assert_eq!(row["command"], "codex");
    }

    #[test]
    fn register_before_sweep_survives_and_adopts_start_time() {
        let (s, _p) = tmp_store();
        // Registered while the process exists but before any sweep saw it.
        s.register_start(10, "my-agent", "codex", "/tmp", "tmux", &json!({}))
            .unwrap();
        let (app, gone) = s.apply_agent_snapshot(&[proc_started(10, 1000)]).unwrap();
        assert_eq!(app, vec![10]);
        // Adoption must not count as a disappearance.
        assert!(gone.is_empty());
        let row = &s.list_agents().unwrap()[0];
        assert_eq!(row["name"], "my-agent");
        assert_eq!(row["startTime"], 1000);
    }

    #[test]
    fn pid_reuse_drops_registration() {
        let (s, _p) = tmp_store();
        s.apply_agent_snapshot(&[proc_started(10, 1000)]).unwrap();
        s.register_start(10, "my-agent", "codex", "/tmp", "tmux", &json!({}))
            .unwrap();
        // Unrelated process reuses the pid.
        let (app, gone) = s.apply_agent_snapshot(&[proc_started(10, 2000)]).unwrap();
        assert_eq!(app, vec![10]);
        assert_eq!(gone, vec![10]);
        let row = &s.list_agents().unwrap()[0];
        assert!(row["name"].is_null());
        assert!(row["registeredAt"].is_null());
    }

    #[test]
    fn disappeared_registered_agent_becomes_tombstone() {
        let (s, _p) = tmp_store();
        s.apply_agent_snapshot(&[proc_started(10, 1000)]).unwrap();
        s.register_start(
            10,
            "my-agent",
            "codex",
            "/tmp",
            "herdr",
            &json!({"paneId":"p1"}),
        )
        .unwrap();
        let (_app, gone) = s.apply_agent_snapshot(&[]).unwrap();
        assert_eq!(gone, vec![10]); // disappeared fires once
        let rows = s.list_agents().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["name"], "my-agent"); // runtimeRef retained for cleanup
        assert!(rows[0]["goneAt"].is_i64());
        // Steady state: no repeat disappeared events for the tombstone.
        let (_a, gone2) = s.apply_agent_snapshot(&[]).unwrap();
        assert!(gone2.is_empty());
        // Unnamed vanished rows are still deleted outright.
        s.apply_agent_snapshot(&[proc_started(11, 1000)]).unwrap();
        let (_a, gone3) = s.apply_agent_snapshot(&[]).unwrap();
        assert_eq!(gone3, vec![11]);
        let rows = s.list_agents().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["pid"], 10);
    }

    #[test]
    fn tombstone_frees_name_via_prune_and_reuse() {
        let (s, _p) = tmp_store();
        s.apply_agent_snapshot(&[proc_started(10, 1000)]).unwrap();
        s.register_start(10, "my-agent", "codex", "/tmp", "tmux", &json!({}))
            .unwrap();
        s.apply_agent_snapshot(&[]).unwrap();
        // Dead name does not block a new start once pruned.
        let tombstone = s.lookup_name("my-agent").unwrap().unwrap();
        assert!(tombstone.gone_at.is_some());
        s.prune_dead().unwrap();
        s.register_start(20, "my-agent", "codex", "/tmp", "tmux", &json!({}))
            .unwrap();
        assert_eq!(s.lookup_name("my-agent").unwrap().unwrap().pid, 20);
    }

    #[test]
    fn duplicate_live_name_is_rejected() {
        let (s, _p) = tmp_store();
        s.apply_agent_snapshot(&[proc_started(10, 1000)]).unwrap();
        s.register_start(10, "my-agent", "codex", "/tmp", "tmux", &json!({}))
            .unwrap();
        assert_eq!(s.lookup_name("my-agent").unwrap().unwrap().pid, 10);
        // Unique index also hard-rejects a straight duplicate register.
        assert!(s
            .register_start(11, "my-agent", "codex", "/tmp", "tmux", &json!({}))
            .is_err());
    }

    fn legacy_fixture(path: &std::path::Path) {
        let _ = std::fs::remove_file(path); // tests share the fixture filename
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE agents (
                type TEXT NOT NULL, pid INTEGER NOT NULL, name TEXT NOT NULL UNIQUE,
                tmux_session TEXT NOT NULL DEFAULT '', cwd TEXT NOT NULL DEFAULT '',
                started_at TEXT NOT NULL, session_id TEXT NOT NULL DEFAULT '',
                session_file_path TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0, runtime TEXT NOT NULL DEFAULT 'tmux',
                runtime_ref TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (type, pid));
             INSERT INTO agents (type,pid,name,tmux_session,cwd,started_at,updated_at,runtime,runtime_ref)
             VALUES
               ('claude', 500, 'old-claude', 'old-claude', '/x', '2026-10-16T00:00:00.000Z', '2026-10-16T00:00:00.000Z', 'tmux', '{\"session\":\"old-claude\"}'),
               ('codex',  501, 'old-codex',  '',           '/y', '2026-10-16T01:00:00.000Z', '2026-10-16T01:00:00.000Z', 'herdr','{\"paneId\":\"p9\"}');",
        )
        .unwrap();
    }

    #[test]
    fn legacy_import_bridges_rows_as_tombstones() {
        let (s, p) = tmp_store();
        let legacy = p.with_file_name(format!(
            "{}.legacy.db",
            p.file_name().unwrap().to_str().unwrap()
        ));
        legacy_fixture(&legacy);
        s.set_legacy_db(legacy.clone()).unwrap();
        s.import_legacy_agents().unwrap();

        let r = s.lookup_name("old-claude").unwrap().unwrap();
        assert_eq!(r.pid, 500);
        assert_eq!(r.runtime, "tmux");
        assert!(r.gone_at.is_some()); // imported dead — no phantom appeared
        let r2 = s.lookup_name("old-codex").unwrap().unwrap();
        assert_eq!(r2.runtime, "herdr");
        assert!(r2.runtime_ref.contains("p9"));
        // Re-import is a no-op (delta merge), not an error.
        s.import_legacy_agents().unwrap();
    }

    #[test]
    fn register_dual_writes_to_legacy_db() {
        let (s, p) = tmp_store();
        let legacy = p.with_file_name(format!(
            "{}.legacy.db",
            p.file_name().unwrap().to_str().unwrap()
        ));
        legacy_fixture(&legacy);
        s.set_legacy_db(legacy.clone()).unwrap();

        s.register_start(
            600,
            "new-one",
            "claude",
            "/x",
            "tmux",
            &json!({"session":"new-one"}),
        )
        .unwrap();

        let conn = Connection::open(&legacy).unwrap();
        let name: String = conn
            .query_row(
                "SELECT name FROM agents WHERE pid=600 AND type='claude'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(name, "new-one");
    }

    #[test]
    fn missing_legacy_db_skips_silently() {
        let (s, p) = tmp_store();
        s.set_legacy_db(p.with_file_name("does-not-exist.db"))
            .unwrap();
        s.import_legacy_agents().unwrap(); // no file → no-op
        s.register_start(1, "x1", "claude", "/tmp", "tmux", &json!({}))
            .unwrap(); // dual-write skipped
    }
}
