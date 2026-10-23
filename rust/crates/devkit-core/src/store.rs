use crate::proto::Event;
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Newest events kept before retention pruning kicks in.
const EVENT_RETENTION: i64 = 10_000;
/// Prune/checkpoint cadence in emitted events.
const PRUNE_EVERY: i64 = 512;

/// Daemon-owned store: the persisted agent snapshot (for diff/events across
/// restarts) and the durable event log. The daemon is the sole writer.
pub struct Store {
    conn: Mutex<Connection>,
    /// Legacy agent registry (`~/.ai-devkit/agents.db`) — dual-write target
    /// while unmigrated TS consumers still read it.
    legacy_db: Mutex<Option<PathBuf>>,
}

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
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).context("open daemon db")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.execute_batch(
            "DROP TABLE IF EXISTS registry;
            CREATE TABLE IF NOT EXISTS events (
                seq     INTEGER PRIMARY KEY AUTOINCREMENT,
                ts      INTEGER NOT NULL,
                kind    TEXT NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS agents (
                pid              INTEGER PRIMARY KEY,
                ppid             INTEGER,
                tty              TEXT,
                command          TEXT,
                cwd              TEXT,
                session_file     TEXT,
                start_time_ms    INTEGER,
                first_seen       INTEGER NOT NULL,
                last_seen        INTEGER NOT NULL
            );",
        )?;
        // Migrations: databases created before later identity/registry
        // columns lack them — add each missing column in place.
        {
            let mut s = conn.prepare("PRAGMA table_info(agents)")?;
            let cols = s
                .query_map([], |r| r.get::<_, String>(1))?
                .collect::<std::result::Result<Vec<String>, _>>()?;
            for (col, ddl) in [
                (
                    "start_time_ms",
                    "ALTER TABLE agents ADD COLUMN start_time_ms INTEGER",
                ),
                // Registry columns — NULL/empty until `register_start` claims
                // the row. `name` doubles as the "is registered" marker.
                ("name", "ALTER TABLE agents ADD COLUMN name TEXT"),
                (
                    "agent_type",
                    "ALTER TABLE agents ADD COLUMN agent_type TEXT",
                ),
                ("runtime", "ALTER TABLE agents ADD COLUMN runtime TEXT"),
                (
                    "runtime_ref",
                    "ALTER TABLE agents ADD COLUMN runtime_ref TEXT NOT NULL DEFAULT ''",
                ),
                (
                    "pinned",
                    "ALTER TABLE agents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
                ),
                (
                    "registered_at",
                    "ALTER TABLE agents ADD COLUMN registered_at INTEGER",
                ),
                // Disappearance acknowledged: tombstone marker so repeated
                // sweeps don't re-emit agent.disappeared for dead rows.
                ("gone_at", "ALTER TABLE agents ADD COLUMN gone_at INTEGER"),
            ] {
                if !cols.iter().any(|c| c == col) {
                    conn.execute(ddl, [])?;
                }
            }
            conn.execute_batch(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_name
                 ON agents(name) WHERE name IS NOT NULL;",
            )?;
        }
        Ok(Self {
            conn: Mutex::new(conn),
            legacy_db: Mutex::new(None),
        })
    }

    /// Point the store at the legacy registry db. Absence of the file is not
    /// an error — dual-write/import just no-op.
    pub fn set_legacy_db(&self, path: PathBuf) -> Result<()> {
        *self.legacy_db.lock().unwrap() = Some(path);
        Ok(())
    }

    /// Append an event; returns its sequence number.
    ///
    /// The table is bounded to the newest [`EVENT_RETENTION`] rows and the WAL
    /// is checkpointed, both amortised to every [`PRUNE_EVERY`] emits so the
    /// hot path stays a single insert.
    pub fn emit(&self, kind: &str, payload: &Value) -> Result<u64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO events (ts,kind,payload) VALUES (?1,?2,?3)",
            params![chrono_now(), kind, serde_json::to_string(payload)?],
        )?;
        let seq = conn.last_insert_rowid();
        if seq % PRUNE_EVERY == 0 {
            conn.execute(
                "DELETE FROM events WHERE seq < ?1",
                params![seq - EVENT_RETENTION],
            )?;
            // Single connection ⇒ no competing readers; TRUNCATE reclaims the
            // WAL file synchronously.
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)");
        }
        Ok(seq as u64)
    }

    /// Replay events after `after_seq` (for crash-recovery / late subscribers).
    pub fn events_after(&self, after_seq: u64, limit: u32) -> Result<Vec<Event>> {
        let conn = self.conn.lock().unwrap();
        let mut s = conn
            .prepare("SELECT seq,ts,kind,payload FROM events WHERE seq>?1 ORDER BY seq LIMIT ?2")?;
        let rows = s.query_map(params![after_seq as i64, limit], |r| {
            Ok(Event {
                seq: r.get::<_, i64>(0)? as u64,
                ts: r.get(1)?,
                kind: r.get(2)?,
                payload: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or(Value::Null),
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// Replace the live-agent snapshot with the latest discovery sweep.
    /// Returns (appeared_pids, disappeared_pids) so the server can emit events.
    ///
    /// Identity is (pid, start_time_ms). Registry columns change the row
    /// lifecycle: registered rows (name non-NULL) that disappear become
    /// tombstones (gone_at set, row kept for runtime_ref cleanup) instead of
    /// being deleted, and rows registered before their first sweep
    /// (start_time_ms NULL) are adopted rather than deleted+reinserted.
    pub fn apply_agent_snapshot(
        &self,
        agents: &[crate::discover::AgentProc],
    ) -> Result<(Vec<i64>, Vec<i64>)> {
        let conn = self.conn.lock().unwrap();
        let now = chrono_now();
        let tx = conn.unchecked_transaction()?;
        // pid -> (start_time_ms, registered, gone_at)
        let known: std::collections::HashMap<i64, (Option<i64>, bool, Option<i64>)> = {
            let mut s = tx.prepare("SELECT pid, start_time_ms, name, gone_at FROM agents")?;
            let v = s
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        (
                            r.get::<_, Option<i64>>(1)?,
                            r.get::<_, Option<String>>(2)?.is_some(),
                            r.get::<_, Option<i64>>(3)?,
                        ),
                    ))
                })?
                .collect::<std::result::Result<
                    std::collections::HashMap<i64, (Option<i64>, bool, Option<i64>)>,
                    _,
                >>()?;
            v
        };
        let current: std::collections::HashSet<i64> = agents.iter().map(|a| a.pid).collect();

        let mut appeared: Vec<i64> = Vec::new();
        let mut gone: Vec<i64> = Vec::new();

        for a in agents {
            match known.get(&a.pid) {
                None => appeared.push(a.pid),
                Some((Some(st), _, _)) if Some(*st) == a.start_time_ms => {}
                // Registered before its first sweep — adopt the real start
                // time via the upsert below; first observation counts as
                // appeared. Unregistered NULL-st rows getting a start time
                // resolve silently (same proc, previously unmeasured).
                Some((None, registered, _)) => {
                    if *registered {
                        appeared.push(a.pid);
                    }
                }
                Some((Some(_), _, _)) if a.start_time_ms.is_none() => {
                    // Sweep couldn't measure start time this pass — can't
                    // distinguish identity change; keep the row and its
                    // registration rather than nuking on flaky data.
                }
                Some((Some(_), _, _)) => {
                    // start_time mismatch → pid reuse: drop the whole row
                    // incl. registration; a recycled pid must not inherit a
                    // dead agent's name.
                    gone.push(a.pid);
                    appeared.push(a.pid);
                    tx.execute("DELETE FROM agents WHERE pid=?1", params![a.pid])?;
                }
            }
        }

        for (pid, (_, registered, gone_at)) in &known {
            if current.contains(pid) {
                continue;
            }
            if *registered {
                if gone_at.is_none() {
                    // First disappearance: tombstone the row — runtime_ref
                    // stays available for cleanup of a lingering pane.
                    gone.push(*pid);
                    tx.execute(
                        "UPDATE agents SET gone_at=?2 WHERE pid=?1",
                        params![pid, now],
                    )?;
                }
            } else {
                gone.push(*pid);
                tx.execute("DELETE FROM agents WHERE pid=?1", params![pid])?;
            }
        }

        appeared.sort_unstable();
        appeared.dedup();
        gone.sort_unstable();
        gone.dedup();

        for a in agents {
            tx.execute(
                "INSERT INTO agents (pid,ppid,tty,command,cwd,session_file,start_time_ms,first_seen,last_seen)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
                 ON CONFLICT(pid) DO UPDATE SET
                   ppid=excluded.ppid, tty=excluded.tty, command=excluded.command,
                   cwd=excluded.cwd, session_file=excluded.session_file,
                   start_time_ms=COALESCE(excluded.start_time_ms, agents.start_time_ms),
                   last_seen=excluded.last_seen, gone_at=NULL",
                params![a.pid, a.ppid, a.tty, a.command, a.cwd, a.session_file, a.start_time_ms, now],
            )?;
        }
        tx.commit()?;
        Ok((appeared, gone))
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
    pub fn import_legacy_agents(&self) -> Result<()> {
        let Some(path) = self.legacy_db.lock().unwrap().clone() else {
            return Ok(());
        };
        if !path.exists() {
            return Ok(());
        }
        let legacy =
            match Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("legacy agents.db unreadable ({e:#}); skipping import");
                    return Ok(());
                }
            };
        let mut stmt = match legacy
            .prepare("SELECT type,pid,name,cwd,started_at,pinned,runtime,runtime_ref FROM agents")
        {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("legacy agents.db lacks agents table ({e:#}); skipping import");
                return Ok(());
            }
        };
        let rows: Vec<LegacyRow> = stmt
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
        Ok(conn.execute(
            "DELETE FROM agents WHERE name IS NOT NULL AND gone_at IS NOT NULL",
            [],
        )?)
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

    #[cfg(test)]
    pub fn list_agents(&self) -> Result<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut s = conn.prepare(
            "SELECT pid,ppid,tty,command,cwd,session_file,start_time_ms,first_seen,last_seen,name,agent_type,runtime,registered_at,gone_at FROM agents ORDER BY pid",
        )?;
        let rows = s.query_map([], |r| {
            Ok(serde_json::json!({
                "pid": r.get::<_, i64>(0)?,
                "ppid": r.get::<_, Option<i64>>(1)?,
                "tty": r.get::<_, Option<String>>(2)?,
                "command": r.get::<_, Option<String>>(3)?,
                "cwd": r.get::<_, Option<String>>(4)?,
                "sessionFilePath": r.get::<_, Option<String>>(5)?,
                "startTime": r.get::<_, Option<i64>>(6)?,
                "firstSeen": r.get::<_, i64>(7)?,
                "lastSeen": r.get::<_, i64>(8)?,
                "name": r.get::<_, Option<String>>(9)?,
                "agentType": r.get::<_, Option<String>>(10)?,
                "runtime": r.get::<_, Option<String>>(11)?,
                "registeredAt": r.get::<_, Option<i64>>(12)?,
                "goneAt": r.get::<_, Option<i64>>(13)?,
            }))
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }
}

/// RFC3339/ISO-8601 UTC rendering of epoch ms — the `started_at` format the
/// legacy agents.db stores. Uses gmtime_r to avoid a chrono dependency.
pub fn iso8601_utc(ms: i64) -> String {
    unsafe {
        let secs = (ms / 1000) as libc::time_t;
        let mut tm: libc::tm = std::mem::zeroed();
        libc::gmtime_r(&secs, &mut tm);
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
            tm.tm_year + 1900,
            tm.tm_mon + 1,
            tm.tm_mday,
            tm.tm_hour,
            tm.tm_min,
            tm.tm_sec,
            ms.rem_euclid(1000)
        )
    }
}

pub fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discover::AgentProc;
    use serde_json::json;
    use std::path::PathBuf;

    fn tmp_store() -> (Store, PathBuf) {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!("aidk-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(format!(
            "t-{}-{}.db",
            chrono_now(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        (Store::open(&p).unwrap(), p)
    }

    fn proc(pid: i64) -> AgentProc {
        AgentProc {
            pid,
            ppid: Some(1),
            tty: None,
            command: Some("codex".into()),
            cwd: Some("/tmp".into()),
            session_file: None,
            start_time_ms: None,
        }
    }

    fn proc_started(pid: i64, start: i64) -> AgentProc {
        AgentProc {
            start_time_ms: Some(start),
            ..proc(pid)
        }
    }

    #[test]
    fn events_are_ordered_and_replayable() {
        let (s, _p) = tmp_store();
        let a = s.emit("registry.changed", &json!({"name":"a"})).unwrap();
        let b = s.emit("agent.appeared", &json!({"pid":1})).unwrap();
        assert!(b > a);
        let replayed = s.events_after(0, 100).unwrap();
        assert_eq!(replayed.len(), 2);
        assert_eq!(s.events_after(a, 100).unwrap().len(), 1);
    }

    #[test]
    fn snapshot_diff_reports_appear_and_vanish() {
        let (s, _p) = tmp_store();
        let (app, gone) = s.apply_agent_snapshot(&[proc(10), proc(11)]).unwrap();
        assert_eq!(app, vec![10, 11]);
        assert!(gone.is_empty());
        let (app, gone) = s.apply_agent_snapshot(&[proc(11), proc(12)]).unwrap();
        assert_eq!(app, vec![12]);
        assert_eq!(gone, vec![10]);
        let agents = s.list_agents().unwrap();
        assert_eq!(agents.len(), 2);
    }

    #[test]
    fn pid_reuse_is_disappear_plus_appear_and_resets_first_seen() {
        let (s, _p) = tmp_store();
        let (app, gone) = s.apply_agent_snapshot(&[proc_started(10, 1000)]).unwrap();
        assert_eq!(app, vec![10]);
        assert!(gone.is_empty());
        let first_seen = s.list_agents().unwrap()[0]["firstSeen"].as_i64().unwrap();

        // Same pid, different start time → the OS reused it. Must read as a
        // disappear+appear pair, not a silent continuation.
        std::thread::sleep(std::time::Duration::from_millis(10));
        let (app, gone) = s.apply_agent_snapshot(&[proc_started(10, 2000)]).unwrap();
        assert_eq!(app, vec![10]);
        assert_eq!(gone, vec![10]);
        let row = &s.list_agents().unwrap()[0];
        assert_eq!(row["startTime"], serde_json::json!(2000));
        assert!(row["firstSeen"].as_i64().unwrap() > first_seen);
    }

    #[test]
    fn events_table_is_bounded_by_retention() {
        let (s, _p) = tmp_store();
        for i in 0..(EVENT_RETENTION + 2 * PRUNE_EVERY) {
            s.emit("tick", &serde_json::json!({"i": i})).unwrap();
        }
        let conn = s.conn.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM events", [], |r| r.get(0))
            .unwrap();
        let min_seq: i64 = conn
            .query_row("SELECT MIN(seq) FROM events", [], |r| r.get(0))
            .unwrap();
        assert!(count <= EVENT_RETENTION + PRUNE_EVERY);
        assert!(min_seq > 0);
    }

    #[test]
    fn concurrent_sole_writer_loses_no_updates() {
        // N threads racing writes must all land — the store serializes via
        // the mutex and every emit gets its own seq.
        let (s, _p) = tmp_store();
        let s = std::sync::Arc::new(s);
        let mut handles = Vec::new();
        for i in 0..32 {
            let s = s.clone();
            handles.push(std::thread::spawn(move || {
                s.emit("tick", &json!(i)).unwrap();
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(s.events_after(0, 100).unwrap().len(), 32);
    }

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
        let legacy = p.with_file_name("agents-legacy.db");
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
        let legacy = p.with_file_name("agents-legacy.db");
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

    #[test]
    fn events_survive_reopen() {
        let (s, p) = tmp_store();
        let seq = s.emit("agent.appeared", &json!({"pid": 7})).unwrap();
        drop(s);
        let s2 = Store::open(&p).unwrap();
        let events = s2.events_after(0, 100).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].seq, seq);
        assert_eq!(events[0].kind, "agent.appeared");
        assert_eq!(events[0].payload["pid"], 7);
    }
}
