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
#[derive(Debug)]
pub struct Availability {
    pub ok: bool,
    /// "binary-missing" | "backend-unreachable" when !ok.
    pub reason: Option<String>,
    pub detail: Option<String>,
}

impl Availability {
    pub fn ok() -> Self {
        Self {
            ok: true,
            reason: None,
            detail: None,
        }
    }
    pub fn missing(detail: impl Into<String>) -> Self {
        Self {
            ok: false,
            reason: Some("binary-missing".into()),
            detail: Some(detail.into()),
        }
    }
    pub fn unreachable(detail: impl Into<String>) -> Self {
        Self {
            ok: false,
            reason: Some("backend-unreachable".into()),
            detail: Some(detail.into()),
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

pub trait AgentRuntime: Send + Sync {
    fn is_available(&self) -> Availability;
    fn start(&self, input: &StartInput) -> Result<StartOutput, StartError>;
}
