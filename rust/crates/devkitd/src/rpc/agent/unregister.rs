//! `agent.unregister` — drop a name's registration row outright (no
//! tombstone) so the name is immediately reusable by `agent.start`. Mirrors
//! the delete into the legacy agents.db so unmigrated TS consumers stop
//! resolving it too. Runtime teardown is the caller's job, driven by the
//! location data from `agent.lookup`; process disappearance still reaches
//! subscribers as `agent.disappeared` through the regular sweep.

use super::lookup::find;
use crate::rpc::RpcError;
use crate::server::Daemon;
use devkit_core::proto::{AgentNameParams, AgentUnregisterResult};

pub fn run(daemon: &Daemon, params: AgentNameParams) -> Result<AgentUnregisterResult, RpcError> {
    // Same mutex as agent.start: an unregister can't interleave with a
    // start's prune → name-check → register sequence for the same name.
    let _start_guard = daemon.start_mutex.lock().unwrap();
    let reg = find(daemon, &params.name)?;
    daemon
        .store
        .unregister(reg.pid)
        .map_err(RpcError::internal)?;
    daemon.store.unregister_legacy(&reg.name);
    Ok(AgentUnregisterResult {
        name: reg.name,
        pid: reg.pid as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rpc::agent::start;
    use crate::runtime::testkit::FixtureDir;
    use crate::runtime::Runtimes;
    use devkit_core::proto::AgentStartParams;
    use serde_json::json;
    use std::sync::Arc;

    fn daemon(f: &FixtureDir) -> Arc<Daemon> {
        let data = f.0.join("data");
        Arc::new(Daemon::new(&data, data.join("d.sock"), data.clone()).unwrap())
    }

    fn name(n: &str) -> AgentNameParams {
        AgentNameParams { name: n.into() }
    }

    #[test]
    fn removes_live_registration_and_frees_name_for_start() {
        let f = FixtureDir::new("unreg-live");
        f.set("pane_pid", "9000");
        f.set("children-9000", "9001");
        f.set("cmd-9001", "/usr/local/bin/claude");
        let d = daemon(&f);
        // A live pid would block agent.start with name_in_use.
        let self_pid = std::process::id() as i64;
        d.store
            .register_start(self_pid, "my-agent", "claude", "/tmp", "tmux", &json!({}))
            .unwrap();

        let r = run(&d, name("my-agent")).unwrap();
        assert_eq!(r.name, "my-agent");
        assert_eq!(r.pid, self_pid as u64);
        assert!(d.store.lookup_name("my-agent").unwrap().is_none());

        let started = start::run_with(
            &d,
            AgentStartParams {
                agent_type: "claude".into(),
                name: Some("my-agent".into()),
                cwd: "/tmp".into(),
                runtime: Some("tmux".into()),
                args: None,
                timeout_ms: Some(5000),
                poll_interval_ms: Some(1),
            },
            &Runtimes {
                tmux: f.tmux(),
                herdr: f.herdr(),
            },
        )
        .unwrap();
        assert_eq!(started.name, "my-agent");
    }

    #[test]
    fn removes_tombstone_without_leaving_one_behind() {
        let f = FixtureDir::new("unreg-dead");
        let d = daemon(&f);
        d.store
            .register_start(
                i32::MAX as i64,
                "gone-one",
                "claude",
                "/tmp",
                "tmux",
                &json!({}),
            )
            .unwrap();
        d.store.apply_agent_snapshot(&[]).unwrap();
        run(&d, name("gone-one")).unwrap();
        assert!(d.store.lookup_name("gone-one").unwrap().is_none());
        assert_eq!(d.store.prune_dead().unwrap(), 0); // no tombstone left
    }

    #[test]
    fn unknown_name_is_coded_not_found() {
        let f = FixtureDir::new("unreg-missing");
        let d = daemon(&f);
        let e = run(&d, name("nobody")).unwrap_err();
        assert_eq!(e.code, "not_found");
    }

    #[test]
    fn legacy_row_is_removed_so_it_does_not_reimport() {
        let f = FixtureDir::new("unreg-legacy");
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
                PRIMARY KEY (type, pid));",
        )
        .unwrap();
        d.store.set_legacy_db(legacy.clone()).unwrap();
        d.store
            .register_start(
                i32::MAX as i64,
                "dual-1",
                "claude",
                "/tmp",
                "tmux",
                &json!({}),
            )
            .unwrap(); // dual-writes into agents.db

        run(&d, name("dual-1")).unwrap();

        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agents WHERE name='dual-1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(n, 0);
        d.store.import_legacy_agents().unwrap();
        assert!(d.store.lookup_name("dual-1").unwrap().is_none());
    }
}
