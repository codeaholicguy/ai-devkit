//! Interactive agent runtimes — the Rust port of
//! `packages/agent-manager/src/runtime` (TmuxAgentRuntime,
//! HerdrAgentRuntime). Each runtime knows how to check availability, spawn
//! an agent into its terminal substrate, and resolve the spawned pid.

pub mod herdr;
#[cfg(test)]
pub(crate) mod testkit;
pub mod tmux;

use devkit_harness::start_profiles::MatchSpec;
use serde_json::Value;

pub use herdr::HerdrRuntime;
pub use tmux::TmuxRuntime;

/// Runtime availability, mirroring TS `AgentRuntimeAvailability`.
/// Enum so `ok` can't disagree with the payload.
#[derive(Debug)]
pub enum Availability {
    Ok,
    /// Runtime binary not on PATH — wire reason "binary-missing".
    Missing(String),
    /// Binary exists but its backend is down — "backend-unreachable".
    Unreachable(String),
}

impl Availability {
    /// Wire-facing reason string (None when available).
    pub fn reason(&self) -> Option<&'static str> {
        match self {
            Availability::Ok => None,
            Availability::Missing(_) => Some("binary-missing"),
            Availability::Unreachable(_) => Some("backend-unreachable"),
        }
    }
    /// Wire-facing detail message.
    pub fn detail(&self) -> Option<&str> {
        match self {
            Availability::Ok => None,
            Availability::Missing(d) | Availability::Unreachable(d) => Some(d),
        }
    }
}

pub struct StartInput<'a> {
    pub name: &'a str,
    pub cwd: &'a str,
    /// Harness runtime kind — `herdr --kind` value.
    pub kind: &'a str,
    /// Launch command (tmux sends it to the pane).
    pub command: &'a str,
    /// Extra argv appended after `--` (herdr only).
    pub args: &'a [String],
    /// Process matcher for pid resolution (tmux only).
    pub matcher: Option<&'a MatchSpec>,
    pub timeout_ms: u64,
    pub poll_interval_ms: u64,
}

#[derive(Debug)]
pub struct StartOutput {
    pub pid: i64,
    pub runtime_ref: Value,
}

/// Failures the handler maps onto wire error codes.
#[derive(Debug)]
pub enum StartError {
    /// Availability re-check inside start failed.
    Unavailable { reason: String, detail: String },
    /// The pane never produced a matching pid — session cleaned up.
    PidPollTimeout { command: String, timeout_ms: u64 },
    /// Runtime refused or errored (herdr code, tmux failure, ...).
    Failed {
        code: Option<String>,
        message: String,
    },
}

impl std::fmt::Display for StartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StartError::Unavailable { detail, .. } => write!(f, "{detail}"),
            StartError::PidPollTimeout { command, timeout_ms } => write!(
                f,
                "Agent process not found after {}s. Verify that \"{command}\" is in PATH inside the tmux environment.",
                timeout_ms / 1000
            ),
            StartError::Failed { message, .. } => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for StartError {}

/// `Command::output` with ETXTBSY retry — exec of a just-written
/// executable (fixture scripts in tests, freshly-installed binaries on
/// overlayfs) transiently fails with os error 26 before the write settles.
pub(crate) fn spawn_output(
    cmd: &mut std::process::Command,
) -> std::io::Result<std::process::Output> {
    const ETXTBSY: i32 = 26;
    let mut attempts = 0;
    loop {
        match cmd.output() {
            Err(e) if e.raw_os_error() == Some(ETXTBSY) && attempts < 3 => {
                attempts += 1;
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            other => return other,
        }
    }
}

/// Spawn a command with optional stdin bytes and a hard timeout; SIGKILLs the
/// child on timeout so a wedged tmux/herdr/CLI call cannot wedge the scheduler.
pub(crate) fn spawn_output_with_timeout(
    cmd: &mut std::process::Command,
    stdin_bytes: Option<&[u8]>,
    timeout: std::time::Duration,
) -> std::io::Result<std::process::Output> {
    use std::io::Write;
    use std::process::Stdio;

    cmd.stdin(if stdin_bytes.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    const ETXTBSY: i32 = 26;
    let mut attempts = 0;
    let mut child = loop {
        match cmd.spawn() {
            Err(e) if e.raw_os_error() == Some(ETXTBSY) && attempts < 3 => {
                attempts += 1;
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            other => break other?,
        }
    };

    if let Some(bytes) = stdin_bytes {
        if let Some(mut stdin) = child.stdin.take() {
            let owned = bytes.to_vec();
            std::thread::spawn(move || {
                let _ = stdin.write_all(&owned);
            });
        }
    }

    let pid = child.id();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    match rx.recv_timeout(timeout) {
        Ok(res) => res,
        Err(_) => {
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
            Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                format!("command timed out after {}s", timeout.as_secs()),
            ))
        }
    }
}

/// Runtimes bundle — injectable so tests can pass fixture-backed impls.
#[derive(Default)]
pub struct Runtimes {
    pub tmux: TmuxRuntime,
    pub herdr: HerdrRuntime,
}

pub trait AgentRuntime: Send + Sync {
    fn is_available(&self) -> Availability;
    fn start(&self, input: &StartInput) -> Result<StartOutput, StartError>;
}
