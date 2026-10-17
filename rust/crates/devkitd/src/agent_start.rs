//! `agent.start` orchestration — the daemon-side port of TS
//! `ManagedAgentRuntime.startAgent`. Validates params, resolves the harness
//! start profile, checks runtime availability, enforces name uniqueness
//! under `Daemon::start_mutex`, spawns via the selected runtime, registers
//! the agent, and emits `agent.started`.

use crate::runtime::{
    AgentRuntime, Availability, HerdrRuntime, StartError, StartInput, TmuxRuntime,
};
use crate::server::Daemon;
use devkit_core::proto::{AgentStartParams, AgentStartResult};
use devkit_core::store::iso8601_utc;
use devkit_harness::start_profiles::start_profile;
use serde_json::{json, Value};

/// Wire-facing error: code + message + structured details.
#[derive(Debug)]
pub struct StartRpcError {
    pub code: &'static str,
    pub message: String,
    pub details: Option<Value>,
}

impl StartRpcError {
    fn new(code: &'static str, message: impl Into<String>, details: Option<Value>) -> Self {
        Self {
            code,
            message: message.into(),
            details,
        }
    }
    fn invalid(message: impl Into<String>) -> Self {
        Self::new("invalid_params", message, None)
    }
}

/// Runtimes bundle so tests can inject fixture-backed implementations.
#[derive(Default)]
pub struct Runtimes {
    pub tmux: TmuxRuntime,
    pub herdr: HerdrRuntime,
}

pub fn run(daemon: &Daemon, params: AgentStartParams) -> Result<AgentStartResult, StartRpcError> {
    run_with(daemon, params, &Runtimes::default())
}

pub fn run_with(
    daemon: &Daemon,
    params: AgentStartParams,
    runtimes: &Runtimes,
) -> Result<AgentStartResult, StartRpcError> {
    // --- validation -------------------------------------------------------
    let profile = start_profile(&params.agent_type).ok_or_else(|| {
        StartRpcError::new(
            "harness_not_startable",
            format!("Unsupported agent type \"{}\".", params.agent_type),
            Some(json!({"type": params.agent_type})),
        )
    })?;
    let provider = params.runtime.as_deref().unwrap_or("tmux");
    if !["tmux", "herdr"].contains(&provider) {
        return Err(StartRpcError::invalid(format!(
            "Unsupported runtime \"{provider}\". Supported: tmux, herdr."
        )));
    }
    let cwd = params.cwd.as_str();
    if !std::path::Path::new(cwd).is_dir() {
        return Err(StartRpcError::invalid(format!(
            "Directory \"{cwd}\" does not exist."
        )));
    }
    let name = match params.name {
        Some(n) if valid_agent_name(&n) => n,
        Some(n) => {
            return Err(StartRpcError::invalid(format!(
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
        return Err(StartRpcError::new(
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

    daemon.store.prune_dead().map_err(internal)?;
    if let Some(existing) = daemon.store.lookup_name(&name).map_err(internal)? {
        if pid_alive(existing.pid) && existing.gone_at.is_none() {
            return Err(StartRpcError::new(
                "name_in_use",
                format!(
                    "Agent \"{name}\" is already running (PID {}). Choose a different name.",
                    existing.pid
                ),
                Some(json!({"pid": existing.pid})),
            ));
        }
        // Dead registration (pending or tombstone) — clear it.
        daemon.store.unregister(existing.pid).map_err(internal)?;
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
        .map_err(|e| match e {
            StartError::Unavailable { reason, detail } => StartRpcError::new(
                "runtime_unavailable",
                detail.clone(),
                Some(json!({
                    "provider": provider,
                    "reason": reason,
                    "detail": detail,
                })),
            ),
            StartError::PidPollTimeout {
                command,
                timeout_ms,
            } => StartRpcError::new(
                "pid_poll_timeout",
                format!(
                    "Agent process not found after {}s. Verify that \"{command}\" is in PATH inside the tmux environment.",
                    timeout_ms / 1000
                ),
                Some(json!({"command": command, "timeoutMs": timeout_ms})),
            ),
            StartError::Failed { code, message } => StartRpcError::new(
                "internal",
                message,
                code.map(|c| json!({"runtimeCode": c})),
            ),
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
                return StartRpcError::new(
                    "name_in_use",
                    format!("Agent \"{name}\" is already running."),
                    Some(json!({"pid": out.pid})),
                );
            }
            internal(e)
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

/// `/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/` ported without the regex crate.
fn valid_agent_name(name: &str) -> bool {
    let b = name.as_bytes();
    (2..=64).contains(&b.len())
        && b.iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
        && b[0] != b'-'
        && b[b.len() - 1] != b'-'
}

/// `generateAgentName` — `{basename-sanitized}-{epoch-ms base36}`.
fn generate_agent_name(cwd: &str) -> String {
    let folder = std::path::Path::new(cwd)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut folder: String = folder
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_lowercase() || c.is_ascii_digit() {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(50)
        .collect();
    if folder.is_empty() {
        folder = "agent".into();
    }
    format!("{}-{}", folder, base36(devkit_core::store::chrono_now()))
}

fn base36(mut n: i64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    out.iter().rev().map(|c| *c as char).collect()
}

/// Process liveness: exists or permission-denied (EPERM = exists, not ours).
fn pid_alive(pid: i64) -> bool {
    unsafe {
        if libc::kill(pid as libc::pid_t, 0) == 0 {
            return true;
        }
    }
    std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

fn internal(e: impl std::fmt::Display) -> StartRpcError {
    StartRpcError::new("internal", e.to_string(), None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use devkit_core::store::chrono_now;
    use std::path::PathBuf;
    use std::sync::Arc;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new(tag: &str) -> Self {
            static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let dir = std::env::temp_dir().join(format!(
                "astart-{}-{}-{}",
                std::process::id(),
                tag,
                N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            let f = Fixture(dir);
            f.write(
                "tmux",
                r#"#!/bin/sh
DIR="$(dirname "$0")"
echo "$@" >> "$DIR/tmux-calls.log"
case "$1" in
  -V) echo "tmux 3.4";;
  has-session) [ -f "$DIR/session-$3" ];;
  new-session)
    shift; while [ $# -gt 0 ]; do
      case "$1" in -s) touch "$DIR/session-$2"; shift 2;; *) shift;; esac
    done;;
  send-keys) :;;
  list-panes) cat "$DIR/pane_pid" 2>/dev/null;;
  kill-session) rm -f "$DIR/session-$3";;
esac
exit 0
"#,
            );
            f.write(
                "pgrep",
                "#!/bin/sh\nDIR=\"$(dirname \"$0\")\"\ncat \"$DIR/children-$2\" 2>/dev/null\nexit 0\n",
            );
            f.write(
                "ps",
                "#!/bin/sh\nDIR=\"$(dirname \"$0\")\"\ncat \"$DIR/cmd-$2\" 2>/dev/null\nexit 0\n",
            );
            f
        }
        fn write(&self, name: &str, content: &str) -> PathBuf {
            let p = self.0.join(name);
            std::fs::write(&p, content).unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
            }
            p
        }
        fn set(&self, name: &str, content: &str) {
            std::fs::write(self.0.join(name), content).unwrap();
        }
        fn daemon(&self) -> Arc<Daemon> {
            let data = self.0.join("data");
            Arc::new(Daemon::new(&data, data.join("d.sock"), data.clone()).unwrap())
        }
        fn runtimes(&self) -> Runtimes {
            Runtimes {
                tmux: TmuxRuntime::with_bins(
                    self.0.join("tmux").to_str().unwrap(),
                    self.0.join("pgrep").to_str().unwrap(),
                    self.0.join("ps").to_str().unwrap(),
                ),
                herdr: HerdrRuntime::default(),
            }
        }
        /// Wire a fake pane that resolves to pid 4242 running `claude`.
        fn live_agent(&self) -> &Self {
            self.set("pane_pid", "9000");
            self.set("children-9000", "9001");
            self.set("cmd-9001", "/usr/local/bin/claude");
            self
        }
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
        let f = Fixture::new("happy");
        f.live_agent();
        let d = f.daemon();
        let r = run_with(&d, params(Some("my-agent"), "/tmp"), &f.runtimes()).unwrap();
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
        let f = Fixture::new("invalid");
        let d = f.daemon();
        let e = run_with(&d, params(Some("BAD NAME"), "/tmp"), &f.runtimes()).unwrap_err();
        assert_eq!(e.code, "invalid_params");
        let e = run_with(&d, params(Some("ok-name"), "/nope/nada"), &f.runtimes()).unwrap_err();
        assert_eq!(e.code, "invalid_params");
        let mut p = params(Some("ok-name"), "/tmp");
        p.agent_type = "nonsense".into();
        let e = run_with(&d, p, &f.runtimes()).unwrap_err();
        assert_eq!(e.code, "harness_not_startable");
        let mut p = params(Some("ok-name"), "/tmp");
        p.runtime = Some("zsh".into());
        let e = run_with(&d, p, &f.runtimes()).unwrap_err();
        assert_eq!(e.code, "invalid_params");
    }

    #[test]
    fn live_duplicate_name_is_rejected_with_pid() {
        let f = Fixture::new("dup");
        let d = f.daemon();
        let self_pid = std::process::id() as i64;
        d.store
            .register_start(self_pid, "my-agent", "claude", "/tmp", "tmux", &json!({}))
            .unwrap();
        let e = run_with(&d, params(Some("my-agent"), "/tmp"), &f.runtimes()).unwrap_err();
        assert_eq!(e.code, "name_in_use");
        assert_eq!(e.details.unwrap()["pid"], self_pid as u64);
    }

    #[test]
    fn dead_pending_name_is_reclaimed() {
        let f = Fixture::new("reclaim");
        f.live_agent();
        let d = f.daemon();
        // Registered but the pid is long dead and never swept.
        d.store
            .register_start(4_000_000, "my-agent", "claude", "/tmp", "tmux", &json!({}))
            .unwrap();
        let r = run_with(&d, params(Some("my-agent"), "/tmp"), &f.runtimes()).unwrap();
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
        let f = Fixture::new("payload");
        f.live_agent();
        let d = f.daemon();
        run_with(&d, params(Some("p-1"), "/tmp"), &f.runtimes()).unwrap();
        let ev = d.store.events_after(0, 10).unwrap().remove(0);
        assert_eq!(ev.payload["type"], "claude");
        assert_eq!(ev.payload["runtimeRef"]["session"], "p-1");
        assert!(ev.payload["startedAt"].is_string());
        assert!(ev.ts <= chrono_now());
    }
}
