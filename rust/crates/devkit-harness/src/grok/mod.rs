//! GrokCliAdapter port — active_sessions.json pid→cwd resolution,
//! latest-mtime session-dir pick, chat_history.jsonl summary,
//! process-only fallback. Grok does not consult AgentRegistry or wrappers.

mod locator;
mod parser;

use crate::shared;
use crate::{HarnessAdapter, SweepContext};
use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use std::collections::HashSet;

pub struct GrokAdapter {
    locator: locator::GrokSessionLocator,
}

impl GrokAdapter {
    pub fn new(home: &std::path::Path) -> Self {
        Self {
            locator: locator::GrokSessionLocator::new(home),
        }
    }

    /// `mapSessionToAgent`.
    fn map_session(session: &parser::Session, proc: &AgentProc, now_ms: i64) -> EnrichedAgent {
        EnrichedAgent {
            name: shared::generate_agent_name(&session.project_path, proc.pid),
            agent_type: "grok_cli".into(),
            status: parser::determine_status(session, now_ms).into(),
            summary: session
                .last_user_message
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Grok CLI session active".into()),
            pid: proc.pid as u64,
            project_path: session.project_path.clone(),
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(session.last_active_ms),
            pinned: None,
            session_file_path: Some(session.session_file_path.clone()),
        }
    }
}

impl HarnessAdapter for GrokAdapter {
    fn type_id(&self) -> &'static str {
        "grok_cli"
    }

    /// `canHandle` — `matchesExecutable(command, "grok")`.
    fn can_handle(&self, proc: &AgentProc) -> bool {
        shared::matches_executable(proc.command.as_deref().unwrap_or(""), "grok")
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // `findHarnessProcesses`: processNames pool filter, then canHandle
        // deduped by pid (first wins).
        let mut seen = HashSet::new();
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| {
                shared::matches_executable_name(p.command.as_deref().unwrap_or(""), &["grok"])
            })
            .filter(|p| self.can_handle(p) && seen.insert(p.pid))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let mut agents = Vec::new();
        for m in self.locator.match_running(&processes) {
            let session = m
                .session_dir
                .as_deref()
                .and_then(|dir| parser::read_session(dir, &m.cwd));
            match session {
                Some(s) => agents.push(Self::map_session(&s, m.proc, ctx.now)),
                None => agents.push(shared::process_only_agent(
                    "grok_cli",
                    m.proc,
                    "Grok CLI process running",
                    Some(&m.cwd),
                    ctx.now,
                )),
            }
        }
        agents
    }
}
