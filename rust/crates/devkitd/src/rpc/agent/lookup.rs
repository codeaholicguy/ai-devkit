//! `agent.lookup` — resolve a registered agent name to the location data a
//! client needs to act on its runtime itself (tmux kill-session/send-keys,
//! herdr pane ops). The generic name → registration primitive that `kill`
//! uses first and `send`/`open`/channel/console will reuse as they migrate.
//!
//! Exact-name match only: fuzzy/partial resolution stays client-side.
//! Tombstoned (dead) registrations still resolve — `alive: false` + `goneAt`
//! — so dead-agent cleanup by name keeps working. Unknown names return the
//! coded `not_found` error.

use super::pid_alive;
use crate::rpc::RpcError;
use crate::server::Daemon;
use devkit_core::proto::{AgentLookupParams, AgentLookupResult};
use devkit_core::store::Registration;
use serde_json::{json, Value};

pub fn run(daemon: &Daemon, params: AgentLookupParams) -> Result<AgentLookupResult, RpcError> {
    let reg = match find(daemon, &params.name) {
        Ok(reg) => reg,
        Err(error) if error.code == "not_found" => {
            let Some(row) = params
                .listed_pid
                .and_then(|pid| daemon.listed_agent(&params.name, pid))
            else {
                return Err(error);
            };
            let alive = pid_alive(row.pid as i64);
            return Ok(AgentLookupResult {
                name: row.name,
                agent_type: row.agent_type,
                pid: row.pid,
                runtime: String::new(),
                runtime_ref: Value::Null,
                cwd: row.project_path,
                pinned: row.pinned.unwrap_or(false),
                terminal_target: terminal_target(row.pid as i64, alive, params.resolve_terminal),
                alive,
                gone_at: None,
            });
        }
        Err(error) => return Err(error),
    };
    let alive = reg.gone_at.is_none() && pid_alive(reg.pid);
    Ok(AgentLookupResult {
        name: reg.name,
        agent_type: reg.agent_type,
        pid: reg.pid as u64,
        runtime: reg.runtime,
        // Stored as JSON text; '' (never set) crosses as null.
        runtime_ref: serde_json::from_str(&reg.runtime_ref).unwrap_or(Value::Null),
        cwd: reg.cwd,
        pinned: reg.pinned,
        terminal_target: terminal_target(reg.pid, alive, params.resolve_terminal),
        alive,
        gone_at: reg.gone_at,
    })
}

fn terminal_target(
    pid: i64,
    alive: bool,
    requested: Option<bool>,
) -> Option<devkit_core::proto::AgentTerminalTarget> {
    if alive && requested == Some(true) {
        crate::runtime::tmux::TmuxRuntime::default().terminal_target(pid)
    } else {
        None
    }
}

/// Name → registration, re-syncing the legacy registry first so agents
/// started via the TS fallback path (agents.db only) resolve too. Shared by
/// every name-addressed op.
pub(super) fn find(daemon: &Daemon, name: &str) -> Result<Registration, RpcError> {
    daemon
        .store
        .import_legacy_agents()
        .map_err(RpcError::internal)?;
    daemon
        .store
        .lookup_name(name)
        .map_err(RpcError::internal)?
        .ok_or_else(|| {
            RpcError::new(
                "not_found",
                format!("No registered agent named \"{name}\"."),
                Some(json!({"name": name})),
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::testkit::FixtureDir;
    use serde_json::json;
    use std::sync::Arc;

    fn daemon(f: &FixtureDir) -> Arc<Daemon> {
        let data = f.0.join("data");
        Arc::new(Daemon::new(&data, data.join("d.sock"), data.clone()).unwrap())
    }

    fn name(n: &str) -> AgentLookupParams {
        AgentLookupParams {
            name: n.into(),
            resolve_terminal: None,
            listed_pid: None,
        }
    }

    #[test]
    fn live_registration_resolves_with_location_data() {
        let f = FixtureDir::new("lookup-live");
        let d = daemon(&f);
        let self_pid = std::process::id() as i64;
        d.store
            .register_start(
                self_pid,
                "my-agent",
                "claude",
                "/repo",
                "tmux",
                &json!({"session": "my-agent"}),
            )
            .unwrap();
        let r = run(&d, name("my-agent")).unwrap();
        assert_eq!(r.name, "my-agent");
        assert_eq!(r.agent_type, "claude");
        assert_eq!(r.pid, self_pid as u64);
        assert_eq!(r.runtime, "tmux");
        assert_eq!(r.runtime_ref["session"], "my-agent");
        assert_eq!(r.cwd, "/repo");
        assert!(r.alive);
        assert!(r.gone_at.is_none());
    }

    #[test]
    fn tombstoned_registration_still_resolves_as_dead() {
        let f = FixtureDir::new("lookup-dead");
        let d = daemon(&f);
        let dead = i32::MAX as i64; // above every pid_max
        d.store
            .register_start(
                dead,
                "gone-one",
                "codex",
                "/repo",
                "herdr",
                &json!({"paneId": "p1"}),
            )
            .unwrap();
        d.store.apply_agent_snapshot(&[]).unwrap(); // tombstone
        let r = run(&d, name("gone-one")).unwrap();
        assert_eq!(r.pid, dead as u64);
        assert_eq!(r.runtime, "herdr");
        assert_eq!(r.runtime_ref["paneId"], "p1");
        assert!(!r.alive);
        assert!(r.gone_at.is_some());
    }

    #[test]
    fn a_tombstone_cannot_target_a_live_pid() {
        let f = FixtureDir::new("lookup-tombstoned-live-pid");
        let d = daemon(&f);
        d.store
            .register_start(
                std::process::id().into(),
                "tombstoned",
                "claude",
                "/repo",
                "tmux",
                &json!({"session": "tombstoned"}),
            )
            .unwrap();
        d.store.apply_agent_snapshot(&[]).unwrap();
        let row = run(&d, name("tombstoned")).unwrap();
        assert!(row.gone_at.is_some());
        assert!(!row.alive);
    }

    #[test]
    fn unknown_name_is_coded_not_found() {
        let f = FixtureDir::new("lookup-missing");
        let d = daemon(&f);
        let e = run(&d, name("nobody")).unwrap_err();
        assert_eq!(e.code, "not_found");
        assert_eq!(e.details.unwrap()["name"], "nobody");
    }

    #[test]
    fn pre_runtime_schema_preserves_legacy_tmux_session() {
        let f = FixtureDir::new("lookup-old-schema");
        let d = daemon(&f);
        let legacy = f.0.join("agents.db");
        let conn = rusqlite::Connection::open(&legacy).unwrap();
        conn.execute_batch(
            "CREATE TABLE agents (type TEXT, pid INTEGER, name TEXT, cwd TEXT, tmux_session TEXT);
             INSERT INTO agents VALUES ('claude',2147483647,'old-agent','/repo','old-session');",
        )
        .unwrap();
        d.store.set_legacy_db(legacy).unwrap();
        let mut params = name("old-agent");
        params.resolve_terminal = Some(true);
        let row = run(&d, params).unwrap();
        assert_eq!(row.runtime_ref["session"], "old-session");
        assert!(!row.alive);
        assert!(row.terminal_target.is_none());
    }

    #[test]
    fn legacy_only_registration_resolves() {
        // Started via the TS fallback while the daemon was up — exists only
        // in agents.db until a re-import.
        let f = FixtureDir::new("lookup-legacy");
        let d = daemon(&f);
        let legacy = f.0.join("agents.db");
        let conn = rusqlite::Connection::open(&legacy).unwrap();
        conn.execute_batch(
            "CREATE TABLE agents (
                type TEXT NOT NULL, pid INTEGER NOT NULL, name TEXT NOT NULL UNIQUE,
                tmux_session TEXT NOT NULL DEFAULT '', cwd TEXT NOT NULL DEFAULT '',
                started_at TEXT NOT NULL, session_id TEXT NOT NULL DEFAULT '',
                session_file_path TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0, runtime TEXT NOT NULL DEFAULT 'tmux',
                runtime_ref TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (type, pid));
             INSERT INTO agents (type,pid,name,cwd,started_at,updated_at,runtime,runtime_ref)
             VALUES ('claude',2147483647,'legacy-1','/x','2026-10-16T00:00:00.000Z',
                     '2026-10-16T00:00:00.000Z','tmux','{\"session\":\"legacy-1\"}');",
        )
        .unwrap();
        d.store.set_legacy_db(legacy).unwrap();
        let r = run(&d, name("legacy-1")).unwrap();
        assert_eq!(r.runtime_ref["session"], "legacy-1");
        assert_eq!(r.cwd, "/x");
    }
}
