//! tmux runtime — port of `TmuxManager`/`TmuxAgentRuntime`/`PidPolling`.
//! Spawns by creating a detached session and sending the launch command to
//! the pane, then resolves the agent pid by walking the pane's process
//! descendants until the command line matches the harness profile.

use super::{AgentRuntime, Availability, StartError, StartInput, StartOutput};
use devkit_harness::start_profiles::MatchSpec;
use serde_json::json;
use std::process::Command;
use std::time::{Duration, Instant};

/// Same-pid observations required before a pid is trusted — mirrors
/// `REQUIRED_STABLE_PID_POLLS`.
const REQUIRED_STABLE_POLLS: u32 = 5;

/// Binary paths are injectable so tests can point at fixture scripts instead
/// of real tmux/pgrep/ps.
pub struct TmuxRuntime {
    tmux: String,
    pgrep: String,
    ps: String,
}

impl Default for TmuxRuntime {
    fn default() -> Self {
        Self {
            tmux: "tmux".into(),
            pgrep: "pgrep".into(),
            ps: "ps".into(),
        }
    }
}

impl TmuxRuntime {
    #[cfg(test)]
    pub fn with_bins(tmux: &str, pgrep: &str, ps: &str) -> Self {
        Self {
            tmux: tmux.into(),
            pgrep: pgrep.into(),
            ps: ps.into(),
        }
    }

    fn run(&self, args: &[&str]) -> Result<String, String> {
        Command::new(&self.tmux)
            .args(args)
            .output()
            .map_err(|e| e.to_string())
            .and_then(|o| {
                if o.status.success() {
                    Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
                }
            })
    }

    pub fn session_exists(&self, name: &str) -> bool {
        self.run(&["has-session", "-t", name]).is_ok()
    }

    fn kill_session(&self, name: &str) {
        let _ = self.run(&["kill-session", "-t", name]);
    }

    fn pane_pid(&self, session: &str) -> Option<i64> {
        let out = self
            .run(&["list-panes", "-t", session, "-F", "#{pane_pid}"])
            .ok()?;
        out.lines().next()?.trim().parse().ok()
    }

    fn pgrep_children(&self, pid: i64) -> Vec<i64> {
        Command::new(&self.pgrep)
            .args(["-P", &pid.to_string()])
            .output()
            .ok()
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .filter_map(|l| l.trim().parse().ok())
                    .collect()
            })
            .unwrap_or_default()
    }

    fn process_command(&self, pid: i64) -> Option<String> {
        let o = Command::new(&self.ps)
            .args(["-p", &pid.to_string(), "-o", "command="])
            .output()
            .ok()?;
        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }

    /// Deepest descendant of the pane whose command line matches — mirrors
    /// `TmuxManager.findAgentPid` (BFS, deepest match wins).
    fn find_agent_pid(&self, session: &str, matcher: &MatchSpec) -> Option<i64> {
        let pane = self.pane_pid(session)?;
        let mut queue = vec![pane];
        let mut deepest: Option<i64> = None;
        while let Some(pid) = queue.pop() {
            queue.extend(self.pgrep_children(pid));
            if let Some(cmd) = self.process_command(pid) {
                if matcher.matches(&cmd) {
                    deepest = Some(pid);
                }
            }
        }
        deepest
    }

    /// `pollForPid` — same candidate must be seen on
    /// [`REQUIRED_STABLE_POLLS`] consecutive polls.
    fn poll_for_pid(
        &self,
        session: &str,
        matcher: &MatchSpec,
        interval: Duration,
        timeout: Duration,
    ) -> Option<i64> {
        let deadline = Instant::now() + timeout;
        let mut candidate: Option<i64> = None;
        let mut stable = 0u32;
        while Instant::now() < deadline {
            let pid = self.find_agent_pid(session, matcher);
            if let Some(pid) = pid {
                if candidate == Some(pid) {
                    stable += 1;
                } else {
                    candidate = Some(pid);
                    stable = 1;
                }
                if stable >= REQUIRED_STABLE_POLLS {
                    return Some(pid);
                }
            }
            std::thread::sleep(interval);
        }
        None
    }
}

impl AgentRuntime for TmuxRuntime {
    fn is_available(&self) -> Availability {
        match self.run(&["-V"]) {
            Ok(_) => Availability::ok(),
            Err(_) => Availability::missing("tmux is not installed or not in PATH."),
        }
    }

    fn start(&self, input: &StartInput) -> Result<StartOutput, StartError> {
        let matcher = input.matcher.ok_or_else(|| StartError::Failed {
            code: None,
            message: "tmux start requires a process matcher".into(),
        })?;

        if self.session_exists(input.name) {
            self.kill_session(input.name);
        }
        self.run(&["new-session", "-d", "-s", input.name, "-c", input.cwd])
            .map_err(|e| StartError::Failed {
                code: None,
                message: format!("tmux new-session failed: {e}"),
            })?;
        self.run(&["send-keys", "-t", input.name, input.command, "Enter"])
            .map_err(|e| StartError::Failed {
                code: None,
                message: format!("tmux send-keys failed: {e}"),
            })?;

        let pid = self.poll_for_pid(
            input.name,
            matcher,
            Duration::from_millis(input.poll_interval_ms),
            Duration::from_millis(input.timeout_ms),
        );
        match pid {
            Some(pid) => Ok(StartOutput {
                pid,
                runtime_ref: json!({"session": input.name}),
            }),
            None => {
                self.kill_session(input.name);
                Err(StartError::PidPollTimeout {
                    command: input.command.to_string(),
                    timeout_ms: input.timeout_ms,
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::testkit::FixtureDir;
    use super::*;
    use devkit_harness::start_profiles::MatchSpec;

    fn input<'a>(name: &'a str, matcher: &'a MatchSpec, timeout: u64) -> StartInput<'a> {
        StartInput {
            name,
            cwd: "/tmp",
            kind: "claude",
            command: "claude",
            args: &[],
            matcher: Some(matcher),
            timeout_ms: timeout,
            poll_interval_ms: 1,
        }
    }

    #[test]
    fn availability_follows_tmux_dash_v() {
        let f = FixtureDir::new("avail");
        assert!(f.tmux().is_available().ok);
        let missing = TmuxRuntime::with_bins(&f.bin("nope"), "pgrep", "ps");
        let a = missing.is_available();
        assert!(!a.ok);
        assert_eq!(a.reason.as_deref(), Some("binary-missing"));
    }

    #[test]
    fn start_creates_session_sends_command_resolves_pid() {
        let f = FixtureDir::new("start");
        f.set("pane_pid", "9000");
        f.set("children-9000", "9001");
        f.set("cmd-9001", "/usr/local/bin/claude");
        let matcher = MatchSpec::Argv0("claude");
        let out = f.tmux().start(&input("agent-one", &matcher, 5000)).unwrap();
        assert_eq!(out.pid, 9001);
        assert_eq!(out.runtime_ref["session"], "agent-one");
        let calls = f.log("tmux-calls.log");
        assert!(calls.contains("new-session -d -s agent-one -c /tmp"));
        assert!(calls.contains("send-keys -t agent-one claude Enter"));
    }

    #[test]
    fn existing_session_is_replaced() {
        let f = FixtureDir::new("replace");
        f.set("session-stale", "");
        assert!(f.tmux().session_exists("stale"));
        f.set("pane_pid", "9000");
        f.set("cmd-9000", "/usr/bin/claude");
        let matcher = MatchSpec::Argv0("claude");
        f.tmux().start(&input("stale", &matcher, 5000)).unwrap();
        assert!(f.log("tmux-calls.log").contains("kill-session -t stale"));
    }

    #[test]
    fn poll_requires_stable_pid_then_times_out_clean() {
        let f = FixtureDir::new("timeout");
        f.set("pane_pid", "9000");
        // No matching descendants — must time out and kill the session.
        let matcher = MatchSpec::Argv0("claude");
        let err = f.tmux().start(&input("doomed", &matcher, 30)).unwrap_err();
        assert!(matches!(err, StartError::PidPollTimeout { .. }));
        assert!(f.log("tmux-calls.log").contains("kill-session -t doomed"));
    }

    #[test]
    fn deepest_descendant_match_wins() {
        let f = FixtureDir::new("deep");
        f.set("pane_pid", "9000");
        f.set("children-9000", "9001\n9002");
        f.set("children-9001", "9003");
        f.set("cmd-9001", "/bin/zsh");
        f.set("cmd-9002", "/bin/zsh");
        f.set("cmd-9003", "/usr/bin/claude --continue");
        let matcher = MatchSpec::Argv0("claude");
        let out = f.tmux().start(&input("deep", &matcher, 5000)).unwrap();
        assert_eq!(out.pid, 9003);
    }
}
