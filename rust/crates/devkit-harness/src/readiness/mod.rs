//! Readiness engine — port of `harnesses/readiness/` +
//! `harnesses/*/readiness.ts` (profiles + probes).
//!
//! The TS injectables (`readFile`, `access`, `runCommand`, `codexAuth`)
//! become the `Host` trait: `SystemHost` for the daemon, `FixtureHost`
//! for parity tests. Callers supply the serializable context
//! (homeDir/path/assetRoot/skill names/skill roots) that can't be
//! inferred daemon-side.

mod checks;
mod codex_auth;
mod fixtures;
mod profiles;

use devkit_core::readiness::AgentReadinessReport;
use std::collections::BTreeMap;
use std::io;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

pub use codex_auth::codex_auth_state;

pub const R_OK: i32 = libc::R_OK;
pub const X_OK: i32 = libc::X_OK;

const COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

/// AGENT_TYPES order — reports and `Object.keys` parity depend on it.
pub const READINESS_AGENT_TYPES: [&str; 10] = [
    "claude",
    "codex",
    "gemini_cli",
    "grok_cli",
    "kiro",
    "antigravity_cli",
    "opencode",
    "copilot",
    "pi",
    "devin",
];

/// `{ stdout, stderr }` — mirrors `CommandResult`.
#[derive(Debug, Clone)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
}

/// The four TS injectable seams. `run_command` resolves only on exit 0
/// (spawn failure / non-zero / timeout are all `Err`, like `execFile`).
/// `Sync` so reports can fan checks out across scoped threads.
pub trait Host: Sync {
    fn read_file(&self, path: &Path) -> io::Result<String>;
    fn access(&self, path: &Path, mode: i32) -> bool;
    fn run_command(&self, command: &str, args: &[&str]) -> io::Result<CommandResult>;
    fn codex_auth(&self) -> Option<bool>;
}

/// Serializable client context + host seams — `createReadinessRuntime`.
pub struct ReadinessRuntime<'a> {
    pub home_dir: String,
    pub path: String,
    pub asset_root: Option<String>,
    pub built_in_skill_names: Vec<String>,
    pub skill_roots: BTreeMap<String, String>,
    pub host: &'a dyn Host,
}

pub struct SystemHost {
    home_dir: String,
}

impl SystemHost {
    pub fn new(home_dir: &str) -> Self {
        Self {
            home_dir: home_dir.to_string(),
        }
    }
}

impl Host for SystemHost {
    fn read_file(&self, path: &Path) -> io::Result<String> {
        std::fs::read_to_string(path)
    }

    fn access(&self, path: &Path, mode: i32) -> bool {
        let Ok(cpath) = std::ffi::CString::new(path.as_os_str().as_encoded_bytes()) else {
            return false;
        };
        unsafe { libc::access(cpath.as_ptr(), mode) == 0 }
    }

    fn run_command(&self, command: &str, args: &[&str]) -> io::Result<CommandResult> {
        run_with_timeout(command, args, COMMAND_TIMEOUT)
    }

    fn codex_auth(&self) -> Option<bool> {
        codex_auth_state(&self.home_dir)
    }
}

fn run_with_timeout(command: &str, args: &[&str], timeout: Duration) -> io::Result<CommandResult> {
    let child = Command::new(command)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let (tx, rx) = mpsc::channel();
    let pid = child.id();
    std::thread::spawn(move || {
        let out = child.wait_with_output();
        let _ = tx.send(out);
    });
    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) if output.status.success() => Ok(CommandResult {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        }),
        Ok(Ok(_)) => Err(io::Error::other("non-zero exit")),
        Ok(Err(e)) => Err(e),
        Err(_) => {
            // Best-effort kill; the spawned thread reaps the child.
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
            Err(io::Error::new(io::ErrorKind::TimedOut, "command timed out"))
        }
    }
}

/// `getAgentReadinessReport`. Checks fan out on scoped threads — mirrors the
/// TS `Promise.all` so one slow probe can't serialize the whole report.
pub fn readiness_report(agent_type: &str, rt: &ReadinessRuntime) -> AgentReadinessReport {
    let profile = profiles::profile(agent_type);
    std::thread::scope(|s| {
        let executable = s.spawn(|| checks::executable_check(agent_type, rt));
        let global_config = s.spawn(|| checks::directory_check(profile.config_dir, rt));
        let built_in_skills = s.spawn(|| checks::built_in_skills_check(agent_type, rt));
        let auth = s.spawn(|| (profile.auth)(rt));
        let integration = s.spawn(|| (profile.integration)(rt));
        let executable = executable.join().unwrap();
        let global_config = global_config.join().unwrap();
        let built_in_skills = built_in_skills.join().unwrap();
        let auth = auth.join().unwrap();
        let integration = integration.join().unwrap();
        let status = checks::worst_status(&{
            let mut v = vec![executable.status.as_str(), global_config.status.as_str()];
            if let Some(a) = &auth {
                v.push(a.status.as_str());
            }
            if let Some(i) = &integration {
                v.push(i.status.as_str());
            }
            v
        });
        AgentReadinessReport {
            agent_type: agent_type.to_string(),
            executable,
            global_config,
            built_in_skills,
            auth,
            integration,
            status: status.into(),
        }
    })
}

/// `getAgentReadinessReports` — AGENT_TYPES order (the wire map can't
/// carry key order, so this is a Vec; clients `fromEntries` it). Harnesses
/// run in parallel on scoped threads, matching the TS `Promise.all`.
pub fn readiness_reports(rt: &ReadinessRuntime) -> Vec<AgentReadinessReport> {
    std::thread::scope(|s| {
        let handles: Vec<_> = READINESS_AGENT_TYPES
            .iter()
            .map(|t| s.spawn(move || readiness_report(t, rt)))
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    })
}

/// Default skill roots — the `STATUS_SKILL_ROOTS` fallbacks the CLI
/// computes; the daemon uses these when the client doesn't send any.
pub fn default_skill_roots() -> BTreeMap<String, String> {
    BTreeMap::from([
        ("claude".into(), ".claude/skills".into()),
        ("codex".into(), ".codex/skills".into()),
        ("copilot".into(), ".copilot/skills".into()),
        ("gemini_cli".into(), ".gemini/skills".into()),
        ("grok_cli".into(), ".grok/skills".into()),
        (
            "antigravity_cli".into(),
            ".gemini/config/skills".into(),
        ),
        ("opencode".into(), ".config/opencode/skills".into()),
        ("pi".into(), ".pi/agent/skills".into()),
        ("devin".into(), ".config/devin/skills".into()),
    ])
}


