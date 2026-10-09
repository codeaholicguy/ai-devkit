use crate::proto::Event;
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;

/// Newest events kept before retention pruning kicks in.
const EVENT_RETENTION: i64 = 10_000;
/// Prune/checkpoint cadence in emitted events.
const PRUNE_EVERY: i64 = 512;

/// Daemon-owned store: the persisted agent snapshot (for diff/events across
/// restarts) and the durable event log. The daemon is the sole writer.
pub struct Store {
    conn: Mutex<Connection>,
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
        // Migration: databases created before start_time-keyed identity lack
        // the column — add it in place.
        {
            let mut s = conn.prepare("PRAGMA table_info(agents)")?;
            let cols = s
                .query_map([], |r| r.get::<_, String>(1))?
                .collect::<std::result::Result<Vec<String>, _>>()?;
            if !cols.iter().any(|c| c == "start_time_ms") {
                conn.execute("ALTER TABLE agents ADD COLUMN start_time_ms INTEGER", [])?;
            }
        }
        Ok(Self {
            conn: Mutex::new(conn),
        })
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
    pub fn apply_agent_snapshot(
        &self,
        agents: &[crate::discover::AgentProc],
    ) -> Result<(Vec<i64>, Vec<i64>)> {
        let conn = self.conn.lock().unwrap();
        let now = chrono_now();
        let tx = conn.unchecked_transaction()?;
        // Identity is (pid, start_time_ms) — pid alone breaks under reuse: a
        // recycled pid would silently inherit the dead process's first_seen
        // and emit no appeared/disappeared events at all.
        let known: std::collections::HashSet<(i64, Option<i64>)> = {
            let mut s = tx.prepare("SELECT pid, start_time_ms FROM agents")?;
            let v = s
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<std::result::Result<
                    std::collections::HashSet<(i64, Option<i64>)>,
                    _,
                >>()?;
            v
        };
        let current: std::collections::HashSet<(i64, Option<i64>)> = agents
            .iter()
            .map(|a| (a.pid, a.start_time_ms))
            .collect();

        let mut appeared: Vec<i64> = current
            .difference(&known)
            .map(|(pid, _)| *pid)
            .collect();
        let mut gone: Vec<i64> = known
            .difference(&current)
            .map(|(pid, _)| *pid)
            .collect();
        appeared.sort_unstable();
        gone.sort_unstable();

        // Delete first so a reused pid drops its stale row (first_seen resets)
        // and reappears via insert rather than an in-place update.
        for pid in &gone {
            tx.execute("DELETE FROM agents WHERE pid=?1", params![pid])?;
        }
        for a in agents {
            tx.execute(
                "INSERT INTO agents (pid,ppid,tty,command,cwd,session_file,start_time_ms,first_seen,last_seen)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
                 ON CONFLICT(pid) DO UPDATE SET
                   ppid=excluded.ppid, tty=excluded.tty, command=excluded.command,
                   cwd=excluded.cwd, session_file=excluded.session_file,
                   start_time_ms=excluded.start_time_ms,
                   last_seen=excluded.last_seen",
                params![a.pid, a.ppid, a.tty, a.command, a.cwd, a.session_file, a.start_time_ms, now],
            )?;
        }
        tx.commit()?;
        Ok((appeared, gone))
    }

    #[cfg(test)]
    pub fn list_agents(&self) -> Result<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut s = conn.prepare(
            "SELECT pid,ppid,tty,command,cwd,session_file,start_time_ms,first_seen,last_seen FROM agents ORDER BY pid",
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
            }))
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
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
