use crate::proto::Event;
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;

/// Daemon-owned store. The daemon is the sole writer — this type is the only
/// code path that mutates registries, which is what eliminates the
/// read-modify-write races the JSON files had.
pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).context("open daemon db")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS registry (
                scope TEXT NOT NULL,
                name  TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (scope, name)
            );
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
                first_seen       INTEGER NOT NULL,
                last_seen        INTEGER NOT NULL
            );",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn registry_get(&self, scope: &str, name: Option<&str>) -> Result<Value> {
        let conn = self.conn.lock().unwrap();
        match name {
            Some(n) => {
                let mut s =
                    conn.prepare("SELECT value FROM registry WHERE scope=?1 AND name=?2")?;
                let v: Option<String> = s.query_row(params![scope, n], |r| r.get(0)).ok();
                Ok(
                    v.map(|x| serde_json::from_str(&x).unwrap_or(Value::String(x)))
                        .unwrap_or(Value::Null),
                )
            }
            None => {
                let mut s = conn.prepare("SELECT name, value FROM registry WHERE scope=?1")?;
                let rows = s.query_map(params![scope], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })?;
                let mut map = serde_json::Map::new();
                for row in rows {
                    let (k, v) = row?;
                    map.insert(k, serde_json::from_str(&v).unwrap_or(Value::String(v)));
                }
                Ok(Value::Object(map))
            }
        }
    }

    pub fn registry_put(&self, scope: &str, name: &str, value: &Value) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO registry (scope,name,value) VALUES (?1,?2,?3)
             ON CONFLICT(scope,name) DO UPDATE SET value=excluded.value",
            params![scope, name, serde_json::to_string(value)?],
        )?;
        Ok(())
    }

    pub fn registry_delete(&self, scope: &str, name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM registry WHERE scope=?1 AND name=?2",
            params![scope, name],
        )?;
        Ok(())
    }

    /// Append an event; returns its sequence number.
    pub fn emit(&self, kind: &str, payload: &Value) -> Result<u64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO events (ts,kind,payload) VALUES (?1,?2,?3)",
            params![chrono_now(), kind, serde_json::to_string(payload)?],
        )?;
        Ok(conn.last_insert_rowid() as u64)
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
        let mut known: Vec<i64> = {
            let mut s = tx.prepare("SELECT pid FROM agents")?;
            let v = s
                .query_map([], |r| r.get(0))?
                .collect::<std::result::Result<Vec<i64>, _>>()?;
            v
        };
        known.sort_unstable();
        let mut current: Vec<i64> = agents.iter().map(|a| a.pid).collect();
        current.sort_unstable();

        let appeared: Vec<i64> = current
            .iter()
            .copied()
            .filter(|p| !known.contains(p))
            .collect();
        let gone: Vec<i64> = known
            .iter()
            .copied()
            .filter(|p| !current.contains(p))
            .collect();

        for a in agents {
            tx.execute(
                "INSERT INTO agents (pid,ppid,tty,command,cwd,session_file,first_seen,last_seen)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?7)
                 ON CONFLICT(pid) DO UPDATE SET
                   ppid=excluded.ppid, tty=excluded.tty, command=excluded.command,
                   cwd=excluded.cwd, session_file=excluded.session_file,
                   last_seen=excluded.last_seen",
                params![a.pid, a.ppid, a.tty, a.command, a.cwd, a.session_file, now],
            )?;
        }
        for pid in &gone {
            tx.execute("DELETE FROM agents WHERE pid=?1", params![pid])?;
        }
        tx.commit()?;
        Ok((appeared, gone))
    }

    pub fn list_agents(&self) -> Result<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let mut s = conn.prepare(
            "SELECT pid,ppid,tty,command,cwd,session_file,first_seen,last_seen FROM agents ORDER BY pid",
        )?;
        let rows = s.query_map([], |r| {
            Ok(serde_json::json!({
                "pid": r.get::<_, i64>(0)?,
                "ppid": r.get::<_, Option<i64>>(1)?,
                "tty": r.get::<_, Option<String>>(2)?,
                "command": r.get::<_, Option<String>>(3)?,
                "cwd": r.get::<_, Option<String>>(4)?,
                "sessionFilePath": r.get::<_, Option<String>>(5)?,
                "firstSeen": r.get::<_, i64>(6)?,
                "lastSeen": r.get::<_, i64>(7)?,
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

    #[test]
    fn registry_roundtrip() {
        let (s, _p) = tmp_store();
        s.registry_put("channels", "tg-main", &json!({"type":"telegram"}))
            .unwrap();
        let one = s.registry_get("channels", Some("tg-main")).unwrap();
        assert_eq!(one["type"], "telegram");
        let all = s.registry_get("channels", None).unwrap();
        assert!(all["tg-main"].is_object());
        s.registry_delete("channels", "tg-main").unwrap();
        assert_eq!(
            s.registry_get("channels", Some("tg-main")).unwrap(),
            Value::Null
        );
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
    fn concurrent_sole_writer_loses_no_updates() {
        // The property the RMW JSON files lacked: N threads racing puts on the
        // same scope must all land — the store serializes via the mutex.
        let (s, _p) = tmp_store();
        let s = std::sync::Arc::new(s);
        let mut handles = Vec::new();
        for i in 0..32 {
            let s = s.clone();
            handles.push(std::thread::spawn(move || {
                s.registry_put("pi-sessions", &format!("pid-{i}"), &json!(i))
                    .unwrap();
                s.registry_put("shared", "counter", &json!(i)).unwrap();
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let all = s.registry_get("pi-sessions", None).unwrap();
        assert_eq!(all.as_object().unwrap().len(), 32);
        assert!(s
            .registry_get("shared", Some("counter"))
            .unwrap()
            .is_number());
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

    #[test]
    fn registry_get_missing_scope_returns_empty_object() {
        let (s, _p) = tmp_store();
        assert_eq!(
            s.registry_get("no-such-scope", None).unwrap(),
            Value::Object(serde_json::Map::new())
        );
    }
}
