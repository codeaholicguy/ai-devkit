//! `agent.rename` — atomic daemon-side rename. The exception to the
//! client-executes-runtime-ops model: `runtimeRef.session` *is* the tmux
//! session name, so the registry rename and `tmux rename-session` /
//! `herdr agent rename` run together under `Daemon::start_mutex` and can't
//! diverge across clients.
//!
//! Order: name check → runtime rename → registry rename (+ legacy mirror).
//! Any failure before the registry write leaves the registry untouched; a
//! registry write failure rolls the runtime rename back.
//!
//! Runtime handle missing (tmux session gone, dead herdr agent — herdr
//! clears names when the agent exits) → registry-only rename with a
//! warning, `runtimeRenamed: false`. tmux unavailable → `runtime_unavailable`
//! rather than a silent registry-only rename.

use super::lookup::find;
use super::{pid_alive, valid_agent_name};
use crate::rpc::RpcError;
use crate::runtime::{AgentRuntime, Runtimes};
use crate::server::Daemon;
use devkit_core::proto::{AgentRenameParams, AgentRenameResult};
use serde_json::{json, Value};

pub fn run(daemon: &Daemon, params: AgentRenameParams) -> Result<AgentRenameResult, RpcError> {
    run_with(daemon, params, &Runtimes::default())
}

/// Runtime rename that succeeded — what to undo if the registry write fails.
enum Renamed {
    Tmux { session: String },
    Herdr { pane: String },
}

pub fn run_with(
    daemon: &Daemon,
    params: AgentRenameParams,
    runtimes: &Runtimes,
) -> Result<AgentRenameResult, RpcError> {
    let AgentRenameParams { from, to } = params;
    if !valid_agent_name(&to) {
        return Err(RpcError::invalid(format!(
            "Invalid name \"{to}\". Use lowercase letters, digits, and hyphens only. \
             Must start and end with a letter or digit, 2–64 characters."
        )));
    }

    let start_guard = daemon.start_mutex.lock().unwrap();
    let reg = find(daemon, &from)?;
    let mut runtime_ref: Value = serde_json::from_str(&reg.runtime_ref).unwrap_or(Value::Null);
    if reg.name == to {
        return Ok(AgentRenameResult {
            from,
            to,
            pid: reg.pid as u64,
            runtime: reg.runtime,
            runtime_ref,
            runtime_renamed: false,
            warnings: vec![],
        });
    }

    // Same liveness rule as agent.start: a live holder blocks, a dead one
    // is reclaimed by the registry write below.
    if let Some(holder) = daemon.store.lookup_name(&to).map_err(RpcError::internal)? {
        if pid_alive(holder.pid) {
            return Err(RpcError::new(
                "name_in_use",
                format!(
                    "Agent \"{to}\" is already running (PID {}). Choose a different name.",
                    holder.pid
                ),
                Some(json!({"pid": holder.pid})),
            ));
        }
    }

    let mut warnings = Vec::new();
    let renamed = match reg.runtime.as_str() {
        "tmux" => {
            let tmux = &runtimes.tmux;
            let availability = tmux.is_available();
            if let Some(reason) = availability.reason() {
                let detail = availability.detail().unwrap_or_default();
                return Err(RpcError::new(
                    "runtime_unavailable",
                    detail.to_string(),
                    Some(json!({"provider": "tmux", "reason": reason, "detail": detail})),
                ));
            }
            if tmux.session_exists_exact(&to) {
                return Err(RpcError::new(
                    "name_in_use",
                    format!(
                        "tmux session \"{to}\" already exists. Kill it or choose a different name."
                    ),
                    Some(json!({"session": to})),
                ));
            }
            let session = runtime_ref["session"].as_str().map(str::to_string);
            let renamed = match session {
                Some(s) if tmux.session_exists_exact(&s) => {
                    tmux.rename_session(&s, &to).map_err(|detail| {
                        runtime_failed("tmux", &format!("tmux session \"{s}\""), &to, detail)
                    })?;
                    Some(Renamed::Tmux { session: s })
                }
                Some(s) => {
                    warnings.push(format!(
                        "tmux session \"{s}\" no longer exists; renamed the registry entry only."
                    ));
                    None
                }
                None => {
                    warnings.push(
                        "No tmux session recorded for this agent; renamed the registry entry only."
                            .into(),
                    );
                    None
                }
            };
            // Point at the new name either way — leaving the old one would
            // let a later agent reusing it be addressed through this entry.
            set_field(&mut runtime_ref, "session", &to);
            renamed
        }
        "herdr" => match runtime_ref["paneId"].as_str().map(str::to_string) {
            Some(pane) if pid_alive(reg.pid) => {
                runtimes.herdr.rename_agent(&pane, &to).map_err(|detail| {
                    runtime_failed("herdr", &format!("herdr agent in pane {pane}"), &to, detail)
                })?;
                set_field(&mut runtime_ref, "agentName", &to);
                Some(Renamed::Herdr { pane })
            }
            _ => {
                warnings.push(
                    "Agent is not running; herdr only names live agents — renamed the registry entry only."
                        .into(),
                );
                None
            }
        },
        other => {
            warnings.push(format!(
                "Runtime \"{other}\" has no rename support; renamed the registry entry only."
            ));
            None
        }
    };

    if let Err(e) = daemon.store.rename_registration(reg.pid, &to, &runtime_ref) {
        // Undo so registry and runtime stay in agreement.
        let undo = match &renamed {
            Some(Renamed::Tmux { session }) => runtimes.tmux.rename_session(&to, session),
            Some(Renamed::Herdr { pane }) => runtimes.herdr.rename_agent(pane, &reg.name),
            None => Ok(()),
        };
        if let Err(u) = undo {
            tracing::error!("agent.rename rollback failed after registry error: {u}");
        }
        return Err(RpcError::internal(e));
    }
    daemon.store.rename_legacy(&reg.name, &to, &runtime_ref);
    drop(start_guard);

    let result = AgentRenameResult {
        from: reg.name,
        to,
        pid: reg.pid as u64,
        runtime: reg.runtime,
        runtime_ref,
        runtime_renamed: renamed.is_some(),
        warnings,
    };
    daemon.emit(
        "agent.renamed",
        json!({"from": result.from, "to": result.to, "pid": result.pid}),
    );
    // Refresh the enriched overlay so agent.list shows the new name now.
    daemon.apply_sweep();
    Ok(result)
}

fn runtime_failed(provider: &str, what: &str, to: &str, detail: String) -> RpcError {
    RpcError::new(
        "runtime_rename_failed",
        format!("Failed to rename {what} to \"{to}\": {detail}. Registry left unchanged."),
        Some(json!({"provider": provider, "detail": detail})),
    )
}

/// Set `key` on an object runtimeRef, creating the object when it is null.
fn set_field(runtime_ref: &mut Value, key: &str, value: &str) {
    if !runtime_ref.is_object() {
        *runtime_ref = json!({});
    }
    runtime_ref[key] = json!(value);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::testkit::FixtureDir;
    use crate::runtime::TmuxRuntime;
    use std::sync::Arc;

    const DEAD: i64 = i32::MAX as i64; // above every pid_max

    fn daemon(f: &FixtureDir) -> Arc<Daemon> {
        let data = f.0.join("data");
        Arc::new(Daemon::new(&data, data.join("d.sock"), data.clone()).unwrap())
    }

    fn runtimes(f: &FixtureDir) -> Runtimes {
        Runtimes {
            tmux: f.tmux(),
            herdr: f.herdr(),
        }
    }

    fn params(from: &str, to: &str) -> AgentRenameParams {
        AgentRenameParams {
            from: from.into(),
            to: to.into(),
        }
    }

    fn self_pid() -> i64 {
        std::process::id() as i64
    }

    fn register_tmux(d: &Daemon, pid: i64, name: &str) {
        d.store
            .register_start(
                pid,
                name,
                "claude",
                "/tmp",
                "tmux",
                &json!({"session": name}),
            )
            .unwrap();
    }

    #[test]
    fn tmux_rename_moves_session_and_registry_together() {
        let f = FixtureDir::new("rn-tmux");
        f.set("session-old", "");
        let d = daemon(&f);
        register_tmux(&d, self_pid(), "old");

        let r = run_with(&d, params("old", "new"), &runtimes(&f)).unwrap();
        assert_eq!((r.from.as_str(), r.to.as_str()), ("old", "new"));
        assert!(r.runtime_renamed);
        assert_eq!(r.runtime_ref["session"], "new");
        assert!(f
            .log("tmux-calls.log")
            .contains("rename-session -t =old new"));
        assert!(d.store.lookup_name("old").unwrap().is_none());
        let reg = d.store.lookup_name("new").unwrap().unwrap();
        assert_eq!(reg.pid, self_pid());
        assert!(reg.runtime_ref.contains("\"new\""));
    }

    #[test]
    fn tmux_failure_leaves_registry_unchanged() {
        let f = FixtureDir::new("rn-tmux-fail");
        f.set("session-old", "");
        f.set("rename-fail", "");
        let d = daemon(&f);
        register_tmux(&d, self_pid(), "old");

        let e = run_with(&d, params("old", "new"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "runtime_rename_failed");
        assert_eq!(e.details.unwrap()["provider"], "tmux");
        let reg = d.store.lookup_name("old").unwrap().unwrap();
        assert!(reg.runtime_ref.contains("\"old\""));
        assert!(d.store.lookup_name("new").unwrap().is_none());
    }

    #[test]
    fn tmux_unavailable_refuses_instead_of_registry_only() {
        let f = FixtureDir::new("rn-tmux-missing");
        let d = daemon(&f);
        register_tmux(&d, self_pid(), "old");
        let rt = Runtimes {
            tmux: TmuxRuntime::with_bins(&f.bin("nope"), "pgrep", "ps"),
            herdr: f.herdr(),
        };
        let e = run_with(&d, params("old", "new"), &rt).unwrap_err();
        assert_eq!(e.code, "runtime_unavailable");
        assert!(d.store.lookup_name("old").unwrap().is_some());
    }

    #[test]
    fn live_target_name_is_coded_name_in_use() {
        let f = FixtureDir::new("rn-taken");
        f.set("session-old", "");
        let d = daemon(&f);
        register_tmux(&d, DEAD, "old");
        register_tmux(&d, self_pid(), "taken");
        let e = run_with(&d, params("old", "taken"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "name_in_use");
        assert_eq!(e.details.unwrap()["pid"], self_pid());
        assert!(!f.log("tmux-calls.log").contains("rename-session"));
        assert!(d.store.lookup_name("old").unwrap().is_some());
    }

    #[test]
    fn orphan_tmux_session_with_target_name_is_name_in_use() {
        let f = FixtureDir::new("rn-orphan");
        f.set("session-old", "");
        f.set("session-new", "");
        let d = daemon(&f);
        register_tmux(&d, self_pid(), "old");
        let e = run_with(&d, params("old", "new"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "name_in_use");
        assert_eq!(e.details.unwrap()["session"], "new");
        assert!(d.store.lookup_name("old").unwrap().is_some());
    }

    #[test]
    fn dead_holder_of_target_name_is_reclaimed() {
        let f = FixtureDir::new("rn-reclaim");
        f.set("session-old", "");
        let d = daemon(&f);
        register_tmux(&d, self_pid(), "old");
        register_tmux(&d, DEAD, "stale");
        let r = run_with(&d, params("old", "stale"), &runtimes(&f)).unwrap();
        assert!(r.runtime_renamed);
        assert_eq!(
            d.store.lookup_name("stale").unwrap().unwrap().pid,
            self_pid()
        );
    }

    #[test]
    fn dead_agent_without_session_renames_registry_only() {
        let f = FixtureDir::new("rn-dead");
        let d = daemon(&f);
        register_tmux(&d, DEAD, "old");
        d.store.apply_agent_snapshot(&[]).unwrap(); // tombstone
        let r = run_with(&d, params("old", "new"), &runtimes(&f)).unwrap();
        assert!(!r.runtime_renamed);
        assert_eq!(r.warnings.len(), 1);
        assert!(r.warnings[0].contains("no longer exists"));
        // Session pointer follows the name so the old one can't be reused.
        assert_eq!(r.runtime_ref["session"], "new");
        assert!(d.store.lookup_name("new").unwrap().is_some());
    }

    #[test]
    fn dead_agent_with_surviving_session_renames_both() {
        let f = FixtureDir::new("rn-dead-session");
        f.set("session-old", "");
        let d = daemon(&f);
        register_tmux(&d, DEAD, "old");
        d.store.apply_agent_snapshot(&[]).unwrap();
        let r = run_with(&d, params("old", "new"), &runtimes(&f)).unwrap();
        assert!(r.runtime_renamed);
        assert!(f
            .log("tmux-calls.log")
            .contains("rename-session -t =old new"));
    }

    #[test]
    fn live_herdr_agent_is_renamed_by_pane() {
        let f = FixtureDir::new("rn-herdr");
        let d = daemon(&f);
        d.store
            .register_start(
                self_pid(),
                "old",
                "codex",
                "/tmp",
                "herdr",
                &json!({"session": "default", "paneId": "w1:p1", "agentName": "old"}),
            )
            .unwrap();
        let r = run_with(&d, params("old", "new"), &runtimes(&f)).unwrap();
        assert!(r.runtime_renamed);
        assert_eq!(r.runtime_ref["agentName"], "new");
        assert_eq!(r.runtime_ref["session"], "default"); // herdr session untouched
        assert!(f.log("herdr-calls.log").contains("agent rename w1:p1 new"));
    }

    #[test]
    fn herdr_failure_leaves_registry_unchanged() {
        let f = FixtureDir::new("rn-herdr-fail");
        f.set("rename-fail", "");
        let d = daemon(&f);
        d.store
            .register_start(
                self_pid(),
                "old",
                "codex",
                "/tmp",
                "herdr",
                &json!({"paneId": "w1:p1", "agentName": "old"}),
            )
            .unwrap();
        let e = run_with(&d, params("old", "new"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "runtime_rename_failed");
        assert!(e.message.contains("agent_name_taken"));
        assert!(d.store.lookup_name("old").unwrap().is_some());
    }

    #[test]
    fn dead_herdr_agent_renames_registry_only() {
        let f = FixtureDir::new("rn-herdr-dead");
        let d = daemon(&f);
        d.store
            .register_start(
                DEAD,
                "old",
                "codex",
                "/tmp",
                "herdr",
                &json!({"paneId": "w1:p1"}),
            )
            .unwrap();
        let r = run_with(&d, params("old", "new"), &runtimes(&f)).unwrap();
        assert!(!r.runtime_renamed);
        assert!(f.log("herdr-calls.log").is_empty());
    }

    #[test]
    fn unknown_name_and_invalid_target_are_coded() {
        let f = FixtureDir::new("rn-codes");
        let d = daemon(&f);
        let e = run_with(&d, params("nobody", "new"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "not_found");
        register_tmux(&d, self_pid(), "old");
        let e = run_with(&d, params("old", "Bad_Name"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "invalid_params");
    }

    #[test]
    fn same_name_is_a_no_op() {
        let f = FixtureDir::new("rn-same");
        f.set("session-old", "");
        let d = daemon(&f);
        register_tmux(&d, self_pid(), "old");
        let r = run_with(&d, params("old", "old"), &runtimes(&f)).unwrap();
        assert!(!r.runtime_renamed);
        assert!(!f.log("tmux-calls.log").contains("rename-session"));
    }

    #[test]
    fn legacy_row_follows_the_rename() {
        let f = FixtureDir::new("rn-legacy");
        f.set("session-old", "");
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
        d.store.set_legacy_db(legacy).unwrap();
        register_tmux(&d, self_pid(), "old"); // dual-writes

        run_with(&d, params("old", "new"), &runtimes(&f)).unwrap();

        let (name, session): (String, String) = conn
            .query_row("SELECT name, tmux_session FROM agents", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((name.as_str(), session.as_str()), ("new", "new"));
        // Re-import must not resurrect the old name.
        d.store.import_legacy_agents().unwrap();
        assert!(d.store.lookup_name("old").unwrap().is_none());
    }
}
