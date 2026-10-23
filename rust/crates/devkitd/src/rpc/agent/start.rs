//! `agent.start` orchestration — the daemon-side port of TS
//! `ManagedAgentRuntime.startAgent`. Validates params, resolves the harness
//! start profile, checks runtime availability, enforces name uniqueness
//! under `Daemon::start_mutex`, spawns via the selected runtime, registers
//! the agent, and emits `agent.started`.

use super::{generate_agent_name, pid_alive, valid_agent_name};
use crate::rpc::RpcError;
use crate::runtime::{AgentRuntime, Availability, Runtimes, StartError, StartInput};
use crate::server::Daemon;
use devkit_core::proto::{AgentStartParams, AgentStartResult};
use devkit_core::store::iso8601_utc;
use devkit_harness::start_profiles::start_profile;
use serde_json::json;

pub fn run_with(
    daemon: &Daemon,
    params: AgentStartParams,
    runtimes: &Runtimes,
) -> Result<AgentStartResult, RpcError> {
    // --- validation -------------------------------------------------------
    let profile = start_profile(&params.agent_type).ok_or_else(|| {
        RpcError::new(
            "harness_not_startable",
            format!("Unsupported agent type \"{}\".", params.agent_type),
            Some(json!({"type": params.agent_type})),
        )
    })?;
    let provider = params.runtime.as_deref().unwrap_or("tmux");
    if !["tmux", "herdr"].contains(&provider) {
        return Err(RpcError::invalid(format!(
            "Unsupported runtime \"{provider}\". Supported: tmux, herdr."
        )));
    }
    let cwd = params.cwd.as_str();
    if !std::path::Path::new(cwd).is_dir() {
        return Err(RpcError::invalid(format!(
            "Directory \"{cwd}\" does not exist."
        )));
    }
    let name = match params.name {
        Some(n) if valid_agent_name(&n) => n,
        Some(n) => {
            return Err(RpcError::invalid(format!(
                "Invalid name \"{n}\". Use lowercase letters, digits, and hyphens only. \
                 Must start and end with a letter or digit, 2–64 characters."
            )))
        }
        None => generate_agent_name(cwd),
    };

    let runtime: &dyn AgentRuntime = match provider {
        "herdr" => &runtimes.herdr,
        _ => &runtimes.tmux,
    };

    let availability = runtime.is_available();
    if !availability.ok {
        let Availability { reason, detail, .. } = availability;
        return Err(RpcError::new(
            "runtime_unavailable",
            detail.clone().unwrap_or_default(),
            Some(json!({
                "provider": provider,
                "reason": reason.unwrap_or_default(),
                "detail": detail.unwrap_or_default(),
            })),
        ));
    }

    // --- serialized start: prune + name check + spawn + register ----------
    let _start_guard = daemon.start_mutex.lock().unwrap();

    daemon.store.prune_dead().map_err(RpcError::internal)?;
    if let Some(existing) = daemon
        .store
        .lookup_name(&name)
        .map_err(RpcError::internal)?
    {
        if pid_alive(existing.pid) && existing.gone_at.is_none() {
            return Err(RpcError::new(
                "name_in_use",
                format!(
                    "Agent \"{name}\" is already running (PID {}). Choose a different name.",
                    existing.pid
                ),
                Some(json!({"pid": existing.pid})),
            ));
        }
        // Dead registration (pending or tombstone) — clear it.
        daemon
            .store
            .unregister(existing.pid)
            .map_err(RpcError::internal)?;
    }

    let mut warnings = Vec::new();
    if provider == "tmux" && runtimes.tmux.session_exists(&name) {
        warnings.push(format!(
            "tmux session \"{name}\" already exists but has no live registry entry — it will be replaced."
        ));
    }

    let out = runtime
        .start(&StartInput {
            name: &name,
            cwd,
            kind: profile.runtime_kind,
            command: profile.command,
            args: params.args.as_deref().unwrap_or(&[]),
            matcher: Some(&profile.matcher),
            timeout_ms: params.timeout_ms.unwrap_or(15_000),
            poll_interval_ms: params.poll_interval_ms.unwrap_or(500),
        })
        .map_err(|e| {
            // Display is the single source of each variant's message text.
            let message = e.to_string();
            match e {
                StartError::Unavailable { reason, .. } => RpcError::new(
                    "runtime_unavailable",
                    message.clone(),
                    Some(json!({
                        "provider": provider,
                        "reason": reason,
                        "detail": message,
                    })),
                ),
                StartError::PidPollTimeout {
                    command,
                    timeout_ms,
                } => RpcError::new(
                    "pid_poll_timeout",
                    message,
                    Some(json!({"command": command, "timeoutMs": timeout_ms})),
                ),
                StartError::Failed { code, .. } => {
                    RpcError::new("internal", message, code.map(|c| json!({"runtimeCode": c})))
                }
            }
        })?;

    let started_at = iso8601_utc(devkit_core::store::chrono_now());
    daemon
        .store
        .register_start(
            out.pid,
            &name,
            &params.agent_type,
            cwd,
            provider,
            &out.runtime_ref,
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE constraint") {
                return RpcError::new(
                    "name_in_use",
                    format!("Agent \"{name}\" is already running."),
                    Some(json!({"pid": out.pid})),
                );
            }
            RpcError::internal(e)
        })?;

    let result = AgentStartResult {
        name: name.clone(),
        agent_type: params.agent_type.clone(),
        pid: out.pid as u64,
        runtime: provider.to_string(),
        runtime_ref: out.runtime_ref.clone(),
        cwd: cwd.to_string(),
        started_at,
        warnings,
    };
    daemon.emit(
        "agent.started",
        serde_json::to_value(&result).unwrap_or_default(),
    );
    // Reconcile now — adopt start_time, refresh enriched, emit appeared —
    // rather than leaving subscribers a sweep behind.
    daemon.apply_sweep();

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::testkit::FixtureDir;
    use devkit_core::store::chrono_now;
    use std::sync::Arc;

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

    /// Wire a fake tmux pane that resolves to pid 9001 running `claude`.
    fn live_agent(f: &FixtureDir) {
        f.set("pane_pid", "9000");
        f.set("children-9000", "9001");
        f.set("cmd-9001", "/usr/local/bin/claude");
    }

    fn params(name: Option<&str>, cwd: &str) -> AgentStartParams {
        AgentStartParams {
            agent_type: "claude".into(),
            name: name.map(|s| s.into()),
            cwd: cwd.into(),
            runtime: Some("tmux".into()),
            args: None,
            timeout_ms: Some(5000),
            poll_interval_ms: Some(1),
        }
    }

    #[test]
    fn happy_path_registers_and_emits() {
        let f = FixtureDir::new("happy");
        live_agent(&f);
        let d = daemon(&f);
        let r = run_with(&d, params(Some("my-agent"), "/tmp"), &runtimes(&f)).unwrap();
        assert_eq!(r.name, "my-agent");
        assert_eq!(r.pid, 9001);
        assert_eq!(r.runtime_ref["session"], "my-agent");
        // Fake pid never shows up in a real ps sweep → registered row becomes
        // a tombstone after the post-start apply_sweep (expected lifecycle).
        let reg = d.store.lookup_name("my-agent").unwrap().unwrap();
        assert_eq!(reg.pid, 9001);
        let events = d.store.events_after(0, 10).unwrap();
        assert_eq!(events[0].kind, "agent.started");
        assert_eq!(events[0].payload["name"], "my-agent");
    }

    #[test]
    fn invalid_inputs_map_to_codes() {
        let f = FixtureDir::new("invalid");
        let d = daemon(&f);
        let e = run_with(&d, params(Some("BAD NAME"), "/tmp"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "invalid_params");
        let e = run_with(&d, params(Some("ok-name"), "/nope/nada"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "invalid_params");
        let mut p = params(Some("ok-name"), "/tmp");
        p.agent_type = "nonsense".into();
        let e = run_with(&d, p, &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "harness_not_startable");
        let mut p = params(Some("ok-name"), "/tmp");
        p.runtime = Some("zsh".into());
        let e = run_with(&d, p, &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "invalid_params");
    }

    #[test]
    fn live_duplicate_name_is_rejected_with_pid() {
        let f = FixtureDir::new("dup");
        let d = daemon(&f);
        let self_pid = std::process::id() as i64;
        d.store
            .register_start(self_pid, "my-agent", "claude", "/tmp", "tmux", &json!({}))
            .unwrap();
        let e = run_with(&d, params(Some("my-agent"), "/tmp"), &runtimes(&f)).unwrap_err();
        assert_eq!(e.code, "name_in_use");
        assert_eq!(e.details.unwrap()["pid"], self_pid as u64);
    }

    #[test]
    fn dead_pending_name_is_reclaimed() {
        let f = FixtureDir::new("reclaim");
        live_agent(&f);
        let d = daemon(&f);
        // Registered but the pid is long dead and never swept.
        d.store
            .register_start(4_000_000, "my-agent", "claude", "/tmp", "tmux", &json!({}))
            .unwrap();
        let r = run_with(&d, params(Some("my-agent"), "/tmp"), &runtimes(&f)).unwrap();
        assert_eq!(r.name, "my-agent");
    }

    #[test]
    fn generated_name_matches_convention() {
        let n = generate_agent_name("/Users/dev/My Project");
        assert!(n.starts_with("my-project-"), "got {n}");
        assert!(valid_agent_name(&n), "generated name must validate");
    }

    #[test]
    fn started_event_payload_is_serializable_result() {
        let f = FixtureDir::new("payload");
        live_agent(&f);
        let d = daemon(&f);
        run_with(&d, params(Some("p-1"), "/tmp"), &runtimes(&f)).unwrap();
        let ev = d.store.events_after(0, 10).unwrap().remove(0);
        assert_eq!(ev.payload["type"], "claude");
        assert_eq!(ev.payload["runtimeRef"]["session"], "p-1");
        assert!(ev.payload["startedAt"].is_string());
        assert!(ev.ts <= chrono_now());
    }
}
