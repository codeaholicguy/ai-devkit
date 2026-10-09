//! Port of `packages/agent-manager/src/harnesses/antigravity` — Google's
//! `agy` CLI detection.
//!
//! Flow (mirrors `detectRunningAgents`):
//! 1. pool-filter the snapshot to `agy`, canHandle + first-wins dedupe
//! 2. `matchRunningProcesses`: join each proc's cwd against
//!    `cache/last_conversations.json` under the antigravity-cli home
//! 3. registered cwd → read `brain/<id>/.system_generated/logs/
//!    transcript.jsonl`; missing transcript → process-only agent

mod locator;
mod parser;

use crate::shared;
use crate::{EnrichedAgent, HarnessAdapter, SweepContext};
use devkit_core::discover::AgentProc;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// `processNames` — the pool `findHarnessProcesses` filters to.
const PROCESS_NAMES: &[&str] = &["agy"];

pub struct AntigravityCliAdapter {
    base_dir: PathBuf,
}

impl AntigravityCliAdapter {
    /// `ANTIGRAVITY_CLI_HOME || ~/.gemini/antigravity-cli`.
    pub fn new(home: &Path) -> Self {
        let base_dir = std::env::var_os("ANTIGRAVITY_CLI_HOME")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".gemini").join("antigravity-cli"));
        Self { base_dir }
    }

    /// Base-dir override for fixture replay (no env involved).
    pub fn at_base_dir(dir: impl Into<PathBuf>) -> Self {
        Self {
            base_dir: dir.into(),
        }
    }

    /// `mapSessionToAgent` — name from the registry cwd; summary is the
    /// last user request, untruncated (no `truncate` in the TS mapper).
    fn map_session_to_agent(
        &self,
        session: &parser::Session,
        proc: &AgentProc,
        now: i64,
    ) -> EnrichedAgent {
        EnrichedAgent {
            name: shared::generate_agent_name(&session.project_path, proc.pid),
            agent_type: "antigravity_cli".into(),
            status: parser::status(session, now).into(),
            summary: session
                .last_user_message
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Antigravity CLI session active".into()),
            pid: proc.pid as u64,
            project_path: session.project_path.clone(),
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(session.last_active_ms),
            pinned: None,
            session_file_path: Some(session.transcript_path.clone()),
        }
    }
}

impl HarnessAdapter for AntigravityCliAdapter {
    fn type_id(&self) -> &'static str {
        "antigravity_cli"
    }

    fn can_handle(&self, proc: &AgentProc) -> bool {
        proc.command
            .as_deref()
            .map(|c| shared::matches_executable(c, "agy"))
            .unwrap_or(false)
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // `findHarnessProcesses`: `agy` pool filter, then canHandle,
        // first-wins by pid.
        let mut seen = HashSet::new();
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| {
                p.command
                    .as_deref()
                    .map(|c| shared::matches_executable_name(c, PROCESS_NAMES))
                    .unwrap_or(false)
            })
            .filter(|p| self.can_handle(p) && seen.insert(p.pid))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let mut agents = Vec::new();
        for m in locator::match_running_processes(&self.base_dir, &processes) {
            let session = m.conversation.as_ref().and_then(|c| {
                parser::read_session(&c.conversation_id, &c.transcript_path, &m.cwd)
            });
            match session {
                Some(s) => agents.push(self.map_session_to_agent(&s, m.process, ctx.now)),
                None => agents.push(shared::process_only_agent(
                    "antigravity_cli",
                    m.process,
                    "Antigravity CLI process running",
                    Some(&m.cwd),
                    ctx.now,
                )),
            }
        }
        agents
    }
}
