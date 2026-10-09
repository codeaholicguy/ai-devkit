//! Port of `ClaudeCodeAdapter` — detect path only (no getConversation /
//! listSessions). Mirrors ClaudeSessionLocator → ClaudeSessionParser →
//! ClaudeAgentMapper exactly; fixture parity is the acceptance gate.

mod locator;
mod parser;

use crate::shared::{
    generate_agent_name, iso_utc, matches_executable_name, process_only_agent, SessionFile,
};
use crate::{HarnessAdapter, SweepContext};
use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use locator::{ClaudeLocator, Matches};
use std::path::PathBuf;

pub struct ClaudeAdapter {
    projects_dir: PathBuf,
    sessions_dir: PathBuf,
}

impl ClaudeAdapter {
    /// `~/.claude/projects` + `~/.claude/sessions` under the given home.
    pub fn new(home: &std::path::Path) -> Self {
        let base = home.join(".claude");
        Self {
            projects_dir: base.join("projects"),
            sessions_dir: base.join("sessions"),
        }
    }
}

struct SessionView {
    session_id: String,
    last_active: String,
    status: &'static str,
    summary: String,
    resolved_cwd: String,
    file_path: String,
}

fn to_agent(view: &SessionView, proc: &AgentProc) -> EnrichedAgent {
    let proc_cwd = proc.cwd.as_deref().unwrap_or("");
    EnrichedAgent {
        name: generate_agent_name(proc_cwd, proc.pid),
        agent_type: "claude".into(),
        status: view.status.into(),
        summary: view.summary.clone(),
        pid: proc.pid as u64,
        project_path: if view.resolved_cwd.is_empty() {
            proc_cwd.to_string()
        } else {
            view.resolved_cwd.clone()
        },
        session_id: view.session_id.clone(),
        last_active: view.last_active.clone(),
        pinned: None,
        session_file_path: Some(view.file_path.clone()),
    }
}

/// `toSession` + `mapSessionToAgent` for one matched (proc, sessionFile).
fn map_matched(
    proc: &AgentProc,
    session_file: &SessionFile,
    pid_status: Option<&'static str>,
    waiting_for: Option<&str>,
    now: i64,
) -> Option<EnrichedAgent> {
    let state = parser::read_session(&session_file.file_path)?;
    let status = pid_status.unwrap_or_else(|| parser::determine_status(&state));
    let base = state
        .last_user_message
        .clone()
        .unwrap_or_else(|| "Session started".into());
    let summary = match (status, waiting_for) {
        ("waiting", Some(w)) => format!("{base} — waiting for {w}"),
        _ => base,
    };
    let last_active_ms = state.last_active_ms.unwrap_or(now);
    let view = SessionView {
        session_id: session_file.session_id.clone(),
        last_active: iso_utc(last_active_ms),
        status,
        summary,
        resolved_cwd: session_file.resolved_cwd.clone(),
        file_path: session_file.file_path.clone(),
    };
    Some(to_agent(&view, proc))
}

impl HarnessAdapter for ClaudeAdapter {
    fn type_id(&self) -> &'static str {
        "claude"
    }

    fn can_handle(&self, proc: &AgentProc) -> bool {
        proc.command
            .as_deref()
            .map(|c| crate::shared::matches_executable(c, "claude"))
            .unwrap_or(false)
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // `findHarnessProcesses`: relevant by processNames, then canHandle,
        // dedup by pid (sweep procs are unique already).
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| {
                p.command
                    .as_deref()
                    .map(|c| matches_executable_name(c, &["claude"]))
                    .unwrap_or(false)
            })
            .filter(|p| self.can_handle(p))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let locator = ClaudeLocator::new(&self.projects_dir, &self.sessions_dir);
        let Matches { direct, legacy } = locator.match_running_processes(&processes);

        let mut matched_pids: std::collections::HashSet<i64> = direct
            .iter()
            .map(|d| d.proc.pid)
            .chain(legacy.iter().map(|(p, _)| p.pid))
            .collect();

        let mut agents: Vec<EnrichedAgent> = Vec::new();

        for m in &direct {
            match map_matched(
                m.proc,
                &m.session_file,
                m.pid_status,
                m.waiting_for.as_deref(),
                ctx.now,
            ) {
                Some(a) => agents.push(a),
                None => {
                    matched_pids.remove(&m.proc.pid);
                }
            }
        }

        for (proc, session_file) in &legacy {
            match map_matched(proc, session_file, None, None, ctx.now) {
                Some(a) => agents.push(a),
                None => {
                    matched_pids.remove(&proc.pid);
                }
            }
        }

        for proc in &processes {
            if !matched_pids.contains(&proc.pid) {
                agents.push(process_only_agent(
                    "claude",
                    proc,
                    "Claude Code process running",
                    None,
                    ctx.now,
                ));
            }
        }

        agents
    }
}
