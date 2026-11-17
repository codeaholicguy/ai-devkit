//! Durable state is independent of the transient process registry. All run
//! mutations compare the current token; SQLite is the single ownership arbiter.
use super::Store;
use anyhow::{ensure, Context, Result};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde_json::{json, Value};
use std::io::Read;
use std::path::Path;

pub fn uuid() -> Result<String> {
    let mut b = [0u8; 16];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut b)?;
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    let h: String = b.iter().map(|v| format!("{v:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    ))
}
pub fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && (b'1'..=b'8').contains(&s.as_bytes()[14])
        && matches!(
            s.as_bytes()[19].to_ascii_lowercase(),
            b'8' | b'9' | b'a' | b'b'
        )
        && s.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
fn now(c: &Connection) -> Result<String> {
    Ok(
        c.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
            r.get(0)
        })?,
    )
}
pub(super) fn init(c: &Connection) -> Result<()> {
    c.busy_timeout(std::time::Duration::from_secs(5))?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS durable_agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      provider TEXT NOT NULL CHECK(provider IN ('claude','codex','pi')),
      cwd TEXT NOT NULL, provider_session_id TEXT UNIQUE,
      state TEXT NOT NULL CHECK(state IN ('ready','running','degraded')),
      session_health TEXT NOT NULL CHECK(session_health IN ('uninitialized','healthy','unknown','mismatch')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_active_at TEXT,
      active_token TEXT UNIQUE, last_token TEXT,
      CHECK(provider='codex' OR provider_session_id IS NOT NULL),
      CHECK((state='running') = (active_token IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS durable_runs (
      token TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES durable_agents(id),
      started_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL
      CHECK(status IN ('running','succeeded','failed','interrupted')),
      owner_pid INTEGER, owner_started_at TEXT, provider_pid INTEGER, provider_started_at TEXT,
      exit_code INTEGER, summary TEXT NOT NULL DEFAULT '', result TEXT, session_health TEXT,
      stop_requested INTEGER NOT NULL DEFAULT 0,
      CHECK((status='running') = (completed_at IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS durable_one_run ON durable_runs(agent_id) WHERE status='running';
    CREATE TABLE IF NOT EXISTS durable_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE VIEW IF NOT EXISTS durable_view AS SELECT a.id, a.name, a.updated_at,
      json_object('id',a.id,'name',a.name,'provider',a.provider,'mode','durable','cwd',a.cwd,
       'providerSessionId',a.provider_session_id,'state',a.state,'sessionHealth',a.session_health,
       'createdAt',a.created_at,'updatedAt',a.updated_at,'lastActiveAt',a.last_active_at,
       'activeRun',CASE WHEN r.token IS NULL THEN NULL ELSE json_object('token',r.token,
        'owner',json_object('pid',r.owner_pid,'startedAt',r.owner_started_at),
        'provider',CASE WHEN r.provider_pid IS NULL THEN NULL ELSE json_object('pid',r.provider_pid,'startedAt',r.provider_started_at) END,
        'startedAt',r.started_at) END,
       'lastResult',CASE WHEN l.token IS NULL THEN NULL ELSE json_object('status',l.status,'completedAt',l.completed_at,
        'exitCode',l.exit_code,'summary',l.summary) END) AS document
    FROM durable_agents a LEFT JOIN durable_runs r ON r.token=a.active_token LEFT JOIN durable_runs l ON l.token=a.last_token;")?;
    Ok(())
}
fn by_id(c: &Connection, id: &str) -> Result<Value> {
    let s: Option<String> = c
        .query_row("SELECT document FROM durable_view WHERE id=?", [id], |r| {
            r.get(0)
        })
        .optional()?;
    Ok(s.map(|v| serde_json::from_str(&v))
        .transpose()?
        .unwrap_or(Value::Null))
}
impl Store {
    pub fn durable_create(&self, name: &str, provider: &str, cwd: &str) -> Result<Value> {
        ensure!(
            !name.trim().is_empty() && name.len() <= 64,
            "invalid_params: invalid durable name"
        );
        ensure!(
            ["claude", "codex", "pi"].contains(&provider),
            "invalid_params: unsupported provider"
        );
        let path =
            std::fs::canonicalize(cwd).context("invalid_cwd: cwd is not an existing directory")?;
        ensure!(path.is_dir(), "invalid_cwd: cwd is not a directory");
        let c = self.conn.lock().unwrap();
        let id = uuid()?;
        let sid = if provider == "codex" {
            None
        } else {
            Some(uuid()?)
        };
        let ts = now(&c)?;
        c.execute("INSERT INTO durable_agents(id,name,provider,cwd,provider_session_id,state,session_health,created_at,updated_at) VALUES(?,?,?,?,?,'ready','uninitialized',?,?)",
            params![id,name,provider,path.to_string_lossy(),sid,ts,ts]).context("name_in_use: failed to create durable agent")?;
        by_id(&c, &id)
    }
    pub fn durable_list(&self) -> Result<Vec<Value>> {
        let c = self.conn.lock().unwrap();
        let mut s = c.prepare(
            "SELECT document FROM durable_view ORDER BY updated_at DESC,name COLLATE NOCASE",
        )?;
        let rows = s
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows.into_iter()
            .map(|s| Ok(serde_json::from_str(&s)?))
            .collect()
    }
    pub fn durable_resolve(&self, reference: &str) -> Result<Value> {
        let c = self.conn.lock().unwrap();
        let exact = by_id(&c, reference)?;
        if !exact.is_null() {
            return Ok(exact);
        }
        let mut s = c.prepare(
            "SELECT document FROM durable_view ORDER BY updated_at DESC,name COLLATE NOCASE",
        )?;
        let rows = s
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut rows: Vec<Value> = rows
            .into_iter()
            .map(|s| serde_json::from_str(&s))
            .collect::<serde_json::Result<_>>()?;
        rows.retain(|a| {
            a["name"]
                .as_str()
                .is_some_and(|name| name.to_lowercase() == reference.to_lowercase())
        });
        Ok(match rows.len() {
            0 => Value::Null,
            1 => rows.remove(0),
            _ => json!(rows),
        })
    }
    pub fn durable_acquire(&self, id: &str) -> Result<Value> {
        let mut c = self.conn.lock().unwrap();
        let t = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let a = by_id(&t, id)?;
        ensure!(!a.is_null(), "not_found: durable agent not found");
        ensure!(a["activeRun"].is_null(), "busy: durable agent is busy");
        let cwd = a["cwd"].as_str().unwrap();
        let p = Path::new(cwd);
        let meta = std::fs::symlink_metadata(p).context("invalid_cwd: bound cwd is gone")?;
        ensure!(
            meta.is_dir() && !meta.file_type().is_symlink() && std::fs::canonicalize(p)? == p,
            "invalid_cwd: cwd binding changed"
        );
        let owner = crate::durable_process::identity(std::process::id() as i64)?
            .context("cannot identify owner")?;
        let token = uuid()?;
        let ts = now(&t)?;
        t.execute("INSERT INTO durable_runs(token,agent_id,started_at,status,owner_pid,owner_started_at) VALUES(?,?,?,'running',?,?)", params![token,id,ts,owner.0,owner.1])?;
        t.execute(
            "UPDATE durable_agents SET state='running',active_token=?,updated_at=? WHERE id=?",
            params![token, ts, id],
        )?;
        let a = by_id(&t, id)?;
        t.commit()?;
        Ok(a)
    }
    pub fn durable_record_process(
        &self,
        id: &str,
        token: &str,
        pid: i64,
        started: &str,
    ) -> Result<()> {
        let c = self.conn.lock().unwrap();
        let n = c.execute("UPDATE durable_runs SET provider_pid=?,provider_started_at=? WHERE token=? AND agent_id=? AND status='running' AND token=(SELECT active_token FROM durable_agents WHERE id=?)", params![pid,started,token,id,id])?;
        ensure!(n == 1, "ownership_changed: print run ownership changed");
        Ok(())
    }
    pub fn durable_bind(&self, id: &str, token: &str, sid: &str) -> Result<()> {
        ensure!(is_uuid(sid), "session_mismatch: invalid session identity");
        let c = self.conn.lock().unwrap();
        let n = c.execute("UPDATE durable_agents SET provider_session_id=? WHERE id=? AND provider='codex' AND active_token=? AND (provider_session_id IS NULL OR provider_session_id=?)",params![sid,id,token,sid]).context("session_mismatch: provider session already bound")?;
        ensure!(
            n == 1,
            "session_mismatch: session binding or run ownership changed"
        );
        Ok(())
    }
    pub fn durable_complete(
        &self,
        id: &str,
        token: &str,
        status: &str,
        exit: Option<i32>,
        summary: &str,
        health: &str,
    ) -> Result<Value> {
        ensure!(
            ["succeeded", "failed", "interrupted"].contains(&status),
            "invalid terminal status"
        );
        let mut c = self.conn.lock().unwrap();
        let t = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let ts = now(&t)?;
        let stopped: bool = t.query_row("SELECT stop_requested FROM durable_runs WHERE token=? AND agent_id=? AND status='running' AND token=(SELECT active_token FROM durable_agents WHERE id=?)", params![token,id,id], |r|r.get(0)).optional()?.context("ownership_changed: print run ownership changed")?;
        let status = if stopped { "interrupted" } else { status };
        let health = if stopped { "unknown" } else { health };
        let result = if status == "succeeded" {
            Some(summary.chars().take(1024 * 1024).collect::<String>())
        } else {
            None
        };
        let cleaned: String = summary
            .chars()
            .map(|c| {
                if (c <= '\u{1f}' || c == '\u{7f}') && !['\n', '\r', '\t'].contains(&c) {
                    ' '
                } else {
                    c
                }
            })
            .collect();
        let summary: String = cleaned.trim().chars().take(4096).collect();
        t.execute("UPDATE durable_runs SET status=?,completed_at=?,exit_code=?,summary=?,session_health=?,result=? WHERE token=?",params![status,ts,exit,summary,health,result,token])?;
        t.execute("UPDATE durable_agents SET state=?,session_health=?,active_token=NULL,last_token=?,last_active_at=?,updated_at=? WHERE id=?",params![if status=="succeeded" {"ready"} else {"degraded"},health,token,ts,ts,id])?;
        let a = by_id(&t, id)?;
        t.commit()?;
        Ok(a)
    }
    pub fn durable_run(&self, id: &str, token: &str) -> Result<Value> {
        let c = self.conn.lock().unwrap();
        let row:Option<String>=c.query_row("SELECT json_object('token',token,'status',status,'completedAt',completed_at,'exitCode',exit_code,'summary',summary,'result',result,'stopRequested',json(CASE WHEN stop_requested THEN 'true' ELSE 'false' END)) FROM durable_runs WHERE agent_id=? AND token=?",params![id,token],|r|r.get(0)).optional()?;
        Ok(row
            .map(|s| serde_json::from_str(&s))
            .transpose()?
            .unwrap_or(Value::Null))
    }
    pub fn durable_request_stop(&self, id: &str, token: &str) -> Result<bool> {
        let c = self.conn.lock().unwrap();
        Ok(c.execute("UPDATE durable_runs SET stop_requested=1 WHERE agent_id=? AND token=? AND status='running' AND token=(SELECT active_token FROM durable_agents WHERE id=?)",params![id,token,id])?==1)
    }
}

impl Store {
    /// Snapshot the source once; completion marker and imported rows commit
    /// together in daemon.db. Never merge or dual-write after transfer.
    pub fn durable_import_legacy(&self, path: &Path) -> Result<bool> {
        let mut c = self.conn.lock().unwrap();
        let t = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let done: bool = t.query_row(
            "SELECT EXISTS(SELECT 1 FROM durable_metadata WHERE key='legacy-import-v1')",
            [],
            |r| r.get(0),
        )?;
        if done || !path.exists() {
            return Ok(false);
        }
        let source = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        source.busy_timeout(std::time::Duration::from_secs(5))?;
        source.execute_batch("BEGIN")?;
        let exists:bool=source.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='durable_agents')",[],|r|r.get(0))?;
        if !exists {
            return Ok(false);
        }
        let cols = [
            "id",
            "name",
            "provider",
            "mode",
            "cwd",
            "provider_session_id",
            "state",
            "session_health",
            "created_at",
            "updated_at",
            "last_active_at",
            "last_result_status",
            "last_result_completed_at",
            "last_result_exit_code",
            "last_result_summary",
            "active_run_token",
            "active_owner_pid",
            "active_owner_started_at",
            "active_provider_pid",
            "active_provider_started_at",
            "active_run_started_at",
        ];
        let sql = format!(
            "SELECT json_object({}) FROM durable_agents",
            cols.iter()
                .map(|s| format!("'{s}',{s}"))
                .collect::<Vec<_>>()
                .join(",")
        );
        let mut stmt = source.prepare(&sql)?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for raw in rows {
            let a: Value = serde_json::from_str(&raw)?;
            let text = |k: &str| -> Result<&str> {
                a[k].as_str().with_context(|| format!("invalid legacy {k}"))
            };
            let id = text("id")?;
            // No silent skip on collision: a retry after rollback has no rows;
            // a committed import already has its marker.
            let sid = a["provider_session_id"].as_str();
            ensure!(sid.is_none_or(is_uuid), "invalid legacy provider session");
            let active = a["active_run_token"].as_str();
            let last = if a["last_result_status"].is_null() {
                None
            } else {
                Some(format!("legacy-last:{id}"))
            };
            ensure!(
                (text("state")? == "running") == active.is_some(),
                "invalid legacy run state"
            );
            t.execute("INSERT INTO durable_agents(id,name,provider,cwd,provider_session_id,state,session_health,created_at,updated_at,last_active_at,active_token,last_token) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",params![id,text("name")?,text("provider")?,text("cwd")?,sid,text("state")?,text("session_health")?,text("created_at")?,text("updated_at")?,a["last_active_at"].as_str(),active,last])?;
            if let Some(token) = active {
                t.execute("INSERT INTO durable_runs(token,agent_id,started_at,status,owner_pid,owner_started_at,provider_pid,provider_started_at) VALUES(?,?,?,'running',?,?,?,?)",params![token,id,text("active_run_started_at")?,a["active_owner_pid"].as_i64().context("missing legacy owner pid")?,text("active_owner_started_at")?,a["active_provider_pid"].as_i64(),a["active_provider_started_at"].as_str()])?;
            }
            if let Some(token) = last {
                t.execute("INSERT INTO durable_runs(token,agent_id,started_at,completed_at,status,exit_code,summary,session_health) VALUES(?,?,?,?,?,?,?,?)",params![token,id,text("created_at")?,text("last_result_completed_at")?,text("last_result_status")?,a["last_result_exit_code"].as_i64(),a["last_result_summary"].as_str().unwrap_or(""),text("session_health")?])?;
            }
        }
        let marker = json!({"source":path,"completedAt":now(&t)?}).to_string();
        t.execute(
            "INSERT INTO durable_metadata(key,value) VALUES('legacy-import-v1',?)",
            [marker],
        )?;
        t.commit()?;
        Ok(true)
    }
}
