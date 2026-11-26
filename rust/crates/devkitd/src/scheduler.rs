//! Scheduled send delivery engine and unified tick evaluator.
//!
//! Fire-time resolution looks up `agent_name` dynamically (never pinning PIDs
//! at schedule time), dispatches to Rust-native `herdr` or exact-pane `tmux`,
//! and falls back to `ai-devkit agent send --id <name> --stdin` only for live
//! agents running in unmanaged terminals (WezTerm, Ghostty, iTerm2, Terminal.app).

use crate::runtime::Runtimes;
use crate::server::Daemon;
use devkit_core::discover::pid_alive;
use devkit_core::store::parse_iso8601_utc_ms;
use serde_json::Value;
use std::process::Command;
use std::time::Duration;

/// Overdue sends older than 1 hour are marked `skipped`.
pub const LATE_WINDOW_MS: i64 = 60 * 60 * 1000;
/// Steady-state overdue sends older than 60s (e.g. host suspend/wake) are
/// marked `late` rather than `sent`.
pub const LATE_THRESHOLD_MS: i64 = 60 * 1000;
const CLI_FALLBACK_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone)]
pub struct ResolvedTarget {
    pub name: String,
    pub pid: i64,
    pub runtime: String,
    pub runtime_ref: Value,
}

pub trait ScheduleDeliverer: Send + Sync {
    fn deliver(&self, target: &ResolvedTarget, message: &str) -> Result<(), String>;
}

pub struct HybridDeliverer {
    pub runtimes: Runtimes,
    pub cli_bin: String,
}

impl Default for HybridDeliverer {
    fn default() -> Self {
        Self {
            runtimes: Runtimes::default(),
            cli_bin: "ai-devkit".into(),
        }
    }
}

impl HybridDeliverer {
    #[cfg(test)]
    pub fn with_bins(runtimes: Runtimes, cli_bin: &str) -> Self {
        Self {
            runtimes,
            cli_bin: cli_bin.into(),
        }
    }

    fn deliver_via_cli_fallback(&self, name: &str, message: &str) -> Result<(), String> {
        let out = crate::runtime::spawn_output_with_timeout(
            Command::new(&self.cli_bin).args(["agent", "send", "--id", name, "--stdin"]),
            Some(message.as_bytes()),
            CLI_FALLBACK_TIMEOUT,
        );
        match out {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(format!(
                "Agent \"{name}\" is not in a tmux or herdr pane, and fallback CLI \"{}\" was not found in devkitd PATH.",
                self.cli_bin
            )),
            Err(e) => Err(format!("Fallback CLI delivery failed: {e}")),
            Ok(o) if o.status.success() => Ok(()),
            Ok(o) => {
                let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
                let detail = if !stderr.is_empty() {
                    stderr
                } else if !stdout.is_empty() {
                    stdout
                } else {
                    format!("exited with {}", o.status)
                };
                Err(format!("Fallback CLI delivery failed: {detail}"))
            }
        }
    }
}

impl ScheduleDeliverer for HybridDeliverer {
    fn deliver(&self, target: &ResolvedTarget, message: &str) -> Result<(), String> {
        if target.runtime == "herdr" {
            let pane_id = target.runtime_ref["paneId"]
                .as_str()
                .filter(|s| !s.trim().is_empty())
                .ok_or_else(|| {
                    format!(
                        "Herdr agent \"{}\" is missing runtimeRef.paneId.",
                        target.name
                    )
                })?;
            return self.runtimes.herdr.send_prompt(pane_id, message);
        }
        if let Some((pane_id, _tty)) = self.runtimes.tmux.pane_for_pid(target.pid) {
            return self.runtimes.tmux.send_to_pane(&pane_id, message);
        }
        self.deliver_via_cli_fallback(&target.name, message)
    }
}

/// Fire-time target resolution by exact `agent_name`:
/// 1. Registered agents (re-syncing legacy `agents.db`), checking liveness.
/// 2. Unique live match in `daemon.enriched` (manually launched agents).
/// 3. Explicit error when target is a durable agent, ambiguous, dead, or missing.
pub fn resolve_fire_target(daemon: &Daemon, agent_name: &str) -> Result<ResolvedTarget, String> {
    let _ = daemon.store.import_legacy_agents();
    if let Some(reg) = daemon
        .store
        .lookup_name(agent_name)
        .map_err(|e| format!("Registry lookup failed: {e}"))?
    {
        if reg.gone_at.is_some() || !pid_alive(reg.pid) {
            return Err(format!(
                "Target agent \"{agent_name}\" is no longer running."
            ));
        }
        return Ok(ResolvedTarget {
            name: reg.name,
            pid: reg.pid,
            runtime: reg.runtime,
            runtime_ref: serde_json::from_str(&reg.runtime_ref).unwrap_or(Value::Null),
        });
    }

    let matches: Vec<(String, i64)> = {
        let enriched = daemon.enriched.read().unwrap();
        enriched
            .iter()
            .filter(|a| a.name == agent_name && pid_alive(a.pid as i64))
            .map(|a| (a.name.clone(), a.pid as i64))
            .collect()
    };
    match matches.len() {
        1 => {
            let (name, pid) = matches.into_iter().next().unwrap();
            return Ok(ResolvedTarget {
                name,
                pid,
                runtime: String::new(),
                runtime_ref: Value::Null,
            });
        }
        n if n > 1 => {
            return Err(format!(
                "Multiple live agents ({n}) match \"{agent_name}\"."
            ));
        }
        _ => {}
    }

    if let Ok(val) = daemon.store.durable_resolve(agent_name) {
        if !val.is_null() {
            return Err(format!(
                "Target agent \"{agent_name}\" is a durable agent; scheduled sends support direct pane delivery only."
            ));
        }
    }

    Err(format!("Target agent \"{agent_name}\" not found."))
}

struct InFlightGuard<'a> {
    daemon: &'a Daemon,
    id: String,
}

impl<'a> InFlightGuard<'a> {
    fn acquire(daemon: &'a Daemon, id: String) -> Self {
        daemon
            .in_flight_schedules
            .lock()
            .unwrap()
            .insert(id.clone());
        Self { daemon, id }
    }
}

impl Drop for InFlightGuard<'_> {
    fn drop(&mut self) {
        self.daemon
            .in_flight_schedules
            .lock()
            .unwrap()
            .remove(&self.id);
    }
}

fn format_overdue(age_ms: i64) -> String {
    let mins = (age_ms / 60_000).max(1);
    if mins < 60 {
        format!("{mins}m")
    } else {
        let hrs = mins / 60;
        let rem = mins % 60;
        if rem == 0 {
            format!("{hrs}h")
        } else {
            format!("{hrs}h{rem}m")
        }
    }
}

/// Evaluate and process all pending schedules due at `now_ms` sequentially in
/// `(due_at ASC, id ASC)` order. Returns the number of due rows processed.
pub fn tick_schedules(daemon: &Daemon, now_ms: i64, deliverer: &dyn ScheduleDeliverer) -> usize {
    let due = match daemon.store.due_pending_schedules(now_ms) {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!("due_pending_schedules query failed: {e}");
            return 0;
        }
    };

    let mut processed = 0;
    for item in due {
        let due_ms = match parse_iso8601_utc_ms(&item.due_at) {
            Ok(ms) => ms,
            Err(e) => {
                let _ = daemon
                    .store
                    .mark_schedule_failed(&item.id, &format!("Corrupt due_at: {e}"));
                processed += 1;
                continue;
            }
        };
        let age_ms = now_ms - due_ms;
        if age_ms > LATE_WINDOW_MS {
            let reason = format!(
                "Skipped: missed due time by {} (>1h late window).",
                format_overdue(age_ms)
            );
            if let Err(e) = daemon.store.mark_schedule_skipped(&item.id, &reason) {
                tracing::warn!("failed to mark schedule {} skipped: {e}", item.id);
            }
            processed += 1;
            continue;
        }

        let _guard = InFlightGuard::acquire(daemon, item.id.clone());
        // Re-check after acquiring in-flight guard in case a concurrent cancel won.
        match daemon.store.get_schedule(&item.id) {
            Ok(Some(row)) if row.status == "pending" => {}
            _ => continue,
        }

        let outcome = resolve_fire_target(daemon, &item.agent_name)
            .and_then(|target| deliverer.deliver(&target, &item.message));

        match outcome {
            Ok(()) => {
                let is_late = due_ms < daemon.started_at || age_ms > LATE_THRESHOLD_MS;
                if let Err(e) = daemon
                    .store
                    .mark_schedule_delivered(&item.id, now_ms, is_late)
                {
                    tracing::warn!("failed to mark schedule {} delivered: {e}", item.id);
                }
            }
            Err(reason) => {
                if let Err(e) = daemon.store.mark_schedule_failed(&item.id, &reason) {
                    tracing::warn!("failed to mark schedule {} failed: {e}", item.id);
                }
            }
        }
        processed += 1;
    }
    processed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::testkit::FixtureDir;
    use devkit_core::agent::EnrichedAgent;
    use devkit_core::store::{chrono_now, iso8601_utc};
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    struct MockDeliverer {
        calls: Mutex<Vec<(String, i64, String)>>,
        fail_with: Option<String>,
    }

    impl MockDeliverer {
        fn ok() -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                fail_with: None,
            }
        }
        fn failing(msg: &str) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                fail_with: Some(msg.into()),
            }
        }
    }

    impl ScheduleDeliverer for MockDeliverer {
        fn deliver(&self, target: &ResolvedTarget, message: &str) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push((target.name.clone(), target.pid, message.to_owned()));
            match &self.fail_with {
                Some(err) => Err(err.clone()),
                None => Ok(()),
            }
        }
    }

    fn test_daemon(f: &FixtureDir) -> Arc<Daemon> {
        let data = f.0.join("data");
        Arc::new(Daemon::new(&data, data.join("d.sock"), data.clone()).unwrap())
    }

    #[test]
    fn tick_delivers_on_time_late_and_skips_past_one_hour() {
        let f = FixtureDir::new("sched-states");
        let d = test_daemon(&f);
        let self_pid = std::process::id() as i64;
        d.store
            .register_start(
                self_pid,
                "worker",
                "claude",
                "/repo",
                "tmux",
                &json!({"session": "worker"}),
            )
            .unwrap();

        let base = d.started_at;
        // 1. Overdue > 1h before startup -> skipped
        let s_skip = d
            .store
            .create_schedule_at(
                "worker",
                "too old",
                &iso8601_utc(base - 4_000_000),
                None,
                base - 5_000_000,
            )
            .unwrap();
        // 2. Overdue 5m before startup -> late
        let s_late = d
            .store
            .create_schedule_at(
                "worker",
                "catchup",
                &iso8601_utc(base - 300_000),
                None,
                base - 600_000,
            )
            .unwrap();
        // 3. Due 5s after startup -> sent on time
        let s_sent = d
            .store
            .create_schedule_at("worker", "ontime", &iso8601_utc(base + 5_000), None, base)
            .unwrap();

        let mock = MockDeliverer::ok();
        let processed = tick_schedules(&d, base + 6_000, &mock);
        assert_eq!(processed, 3);

        let r_skip = d.store.get_schedule(&s_skip.id).unwrap().unwrap();
        assert_eq!(r_skip.status, "skipped");
        assert!(r_skip.failure_reason.as_deref().unwrap().contains(">1h"));
        assert!(r_skip.sent_at.is_none());

        let r_late = d.store.get_schedule(&s_late.id).unwrap().unwrap();
        assert_eq!(r_late.status, "late");
        assert!(r_late.sent_at.is_some());

        let r_sent = d.store.get_schedule(&s_sent.id).unwrap().unwrap();
        assert_eq!(r_sent.status, "sent");
        assert!(r_sent.sent_at.is_some());

        let calls = mock.calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].2, "catchup");
        assert_eq!(calls[1].2, "ontime");
    }

    #[test]
    fn tick_handles_missing_dead_ambiguous_and_durable_targets_honestly() {
        let f = FixtureDir::new("sched-failures");
        let d = test_daemon(&f);
        let now = chrono_now();
        let due = iso8601_utc(now + 1000);

        // Dead registered target
        d.store
            .register_start(
                i32::MAX as i64,
                "dead-agent",
                "codex",
                "/repo",
                "tmux",
                &json!({"session": "dead-agent"}),
            )
            .unwrap();
        // Ambiguous unregistered targets in enriched cache
        let self_pid = std::process::id() as u64;
        *d.enriched.write().unwrap() = vec![
            EnrichedAgent {
                name: "dup".into(),
                agent_type: "claude".into(),
                status: "idle".into(),
                summary: String::new(),
                pid: self_pid,
                project_path: "/a".into(),
                session_id: "s1".into(),
                last_active: iso8601_utc(now),
                pinned: None,
                session_file_path: None,
            },
            EnrichedAgent {
                name: "dup".into(),
                agent_type: "claude".into(),
                status: "idle".into(),
                summary: String::new(),
                pid: self_pid,
                project_path: "/b".into(),
                session_id: "s2".into(),
                last_active: iso8601_utc(now),
                pinned: None,
                session_file_path: None,
            },
        ];
        // Durable agent
        d.store
            .durable_create("dur-1", "claude", f.0.to_str().unwrap())
            .unwrap();

        let s_missing = d
            .store
            .create_schedule_at("ghost", "m", &due, None, now)
            .unwrap();
        let s_dead = d
            .store
            .create_schedule_at("dead-agent", "m", &due, None, now)
            .unwrap();
        let s_dup = d
            .store
            .create_schedule_at("dup", "m", &due, None, now)
            .unwrap();
        let s_dur = d
            .store
            .create_schedule_at("dur-1", "m", &due, None, now)
            .unwrap();

        let mock = MockDeliverer::ok();
        tick_schedules(&d, now + 2000, &mock);
        assert!(mock.calls.lock().unwrap().is_empty());

        for (id, expected_substr) in [
            (&s_missing.id, "not found"),
            (&s_dead.id, "no longer running"),
            (&s_dup.id, "Multiple live agents"),
            (&s_dur.id, "durable agent"),
        ] {
            let row = d.store.get_schedule(id).unwrap().unwrap();
            assert_eq!(row.status, "failed");
            assert!(
                row.failure_reason
                    .as_deref()
                    .unwrap()
                    .contains(expected_substr),
                "expected {expected_substr:?} in {:?}",
                row.failure_reason
            );
        }
    }

    #[test]
    fn tick_marks_failed_when_deliverer_errors_and_orders_concurrent_by_id() {
        let f = FixtureDir::new("sched-order");
        let d = test_daemon(&f);
        let self_pid = std::process::id() as i64;
        d.store
            .register_start(self_pid, "w", "claude", "/repo", "tmux", &json!({}))
            .unwrap();
        let now = chrono_now();
        let due = iso8601_utc(now + 1000);
        let s1 = d
            .store
            .create_schedule_at("w", "m1", &due, None, now)
            .unwrap();
        let s2 = d
            .store
            .create_schedule_at("w", "m2", &due, None, now)
            .unwrap();

        let mock = MockDeliverer::failing("pane closed");
        tick_schedules(&d, now + 2000, &mock);

        assert_eq!(
            d.store.get_schedule(&s1.id).unwrap().unwrap().status,
            "failed"
        );
        assert_eq!(
            d.store
                .get_schedule(&s2.id)
                .unwrap()
                .unwrap()
                .failure_reason
                .as_deref(),
            Some("pane closed")
        );
        // Verify deterministic order by id
        let calls = mock.calls.lock().unwrap();
        let mut expected = [(&s1.id, "m1"), (&s2.id, "m2")];
        expected.sort_by_key(|(id, _)| *id);
        assert_eq!(
            calls.iter().map(|c| c.2.as_str()).collect::<Vec<_>>(),
            expected.iter().map(|(_, m)| *m).collect::<Vec<_>>()
        );
    }

    #[test]
    fn hybrid_deliverer_routes_herdr_tmux_and_cli_fallback() {
        let f = FixtureDir::new("sched-hybrid");
        f.set("cmd-12", "pts/20");
        f.set("pane_pid", "/dev/pts/2|%1\n/dev/pts/20|%3");
        let fake_cli = f.script(
            "fake-ai-devkit",
            "#!/bin/sh\nDIR=\"$(dirname \"$0\")\"\necho \"$@\" >> \"$DIR/cli-calls.log\"\ncat > \"$DIR/cli-stdin.log\"\nexit 0\n",
        );

        let deliverer = HybridDeliverer::with_bins(
            Runtimes {
                tmux: f.tmux(),
                herdr: f.herdr(),
            },
            fake_cli.to_str().unwrap(),
        );

        // 1. Herdr route
        deliverer
            .deliver(
                &ResolvedTarget {
                    name: "h-agent".into(),
                    pid: 99,
                    runtime: "herdr".into(),
                    runtime_ref: json!({"paneId": "w1:p9"}),
                },
                "ping herdr",
            )
            .unwrap();
        assert!(f
            .log("herdr-calls.log")
            .contains("agent prompt w1:p9 ping herdr"));

        // 2. Tmux exact pane route
        deliverer
            .deliver(
                &ResolvedTarget {
                    name: "t-agent".into(),
                    pid: 12,
                    runtime: "tmux".into(),
                    runtime_ref: json!({"session": "t-agent"}),
                },
                "line1\nline2",
            )
            .unwrap();
        let tmux_calls = f.log("tmux-calls.log");
        assert!(tmux_calls.contains("paste-buffer -t %3"));
        assert!(tmux_calls.contains("send-keys -t %3 Enter"));
        assert_eq!(f.log("tmux-stdin.log"), "line1\nline2");

        // 3. Unmanaged terminal -> CLI fallback
        deliverer
            .deliver(
                &ResolvedTarget {
                    name: "wez-agent".into(),
                    pid: 55, // no tty match
                    runtime: String::new(),
                    runtime_ref: Value::Null,
                },
                "hello wez",
            )
            .unwrap();
        assert!(f
            .log("cli-calls.log")
            .contains("agent send --id wez-agent --stdin"));
        assert_eq!(f.log("cli-stdin.log"), "hello wez");

        // 4. Missing CLI binary reports clear PATH-aware error
        let missing = HybridDeliverer::with_bins(
            Runtimes {
                tmux: f.tmux(),
                herdr: f.herdr(),
            },
            &f.bin("nonexistent-cli"),
        );
        let err = missing
            .deliver(
                &ResolvedTarget {
                    name: "wez-agent".into(),
                    pid: 55,
                    runtime: String::new(),
                    runtime_ref: Value::Null,
                },
                "hi",
            )
            .unwrap_err();
        assert!(err.contains("not found in devkitd PATH"), "{err}");
    }
}
