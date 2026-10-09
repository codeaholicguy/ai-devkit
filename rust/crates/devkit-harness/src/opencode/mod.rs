//! OpenCodeAdapter port — `packages/agent-manager/src/harnesses/opencode`.
//!
//! `opencode` process detection + session attribution via
//! `~/.local/share/opencode/opencode.db` (or `$XDG_DATA_HOME`): each proc's
//! cwd maps to the newest `session` row for that directory; stats (last
//! role / heartbeat / completion / first user text) come from message+part
//! queries. Missing db, cwd, or session row → process-only fallback.

mod locator;
mod parser;

use crate::shared;
use crate::{HarnessAdapter, SweepContext};
use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use std::collections::HashSet;
use std::path::PathBuf;

pub struct OpenCodeAdapter {
    db_path: PathBuf,
}

impl OpenCodeAdapter {
    /// Env-aware constructor — resolves `$XDG_DATA_HOME` like the TS
    /// adapter's default `resolveDbPath`.
    pub fn new(home: &std::path::Path) -> Self {
        Self::at_db(locator::resolve_db_path(home))
    }

    /// Explicit db path — fixture replay pins the canonical
    /// `~/.local/share/opencode/opencode.db` so ambient `XDG_DATA_HOME`
    /// cannot leak the real store into a test.
    pub fn at_db(db_path: PathBuf) -> Self {
        Self { db_path }
    }

    /// `mapSessionToAgent`.
    fn map_session(
        &self,
        session: &locator::Session,
        stats: &parser::SessionStats,
        proc: &AgentProc,
        now_ms: i64,
    ) -> EnrichedAgent {
        let last_active_ms = if stats.last_time_updated_ms > 0 {
            stats.last_time_updated_ms
        } else {
            session.time_created_ms
        };
        let directory = if !session.directory.is_empty() {
            session.directory.clone()
        } else {
            proc.cwd.clone().unwrap_or_default()
        };
        EnrichedAgent {
            name: shared::generate_agent_name(&directory, proc.pid),
            agent_type: "opencode".into(),
            status: determine_status(stats, last_active_ms, now_ms).into(),
            summary: if stats.summary.is_empty() {
                "OpenCode session active".into()
            } else {
                stats.summary.clone()
            },
            pid: proc.pid as u64,
            project_path: directory,
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(last_active_ms),
            pinned: None,
            session_file_path: Some(format!(
                "{}{}{}",
                self.db_path.display(),
                locator::SESSION_REF_SEP,
                session.session_id
            )),
        }
    }
}

impl HarnessAdapter for OpenCodeAdapter {
    fn type_id(&self) -> &'static str {
        "opencode"
    }

    /// `canHandle` — `matchesExecutable(command, "opencode")`.
    fn can_handle(&self, proc: &AgentProc) -> bool {
        shared::matches_executable(proc.command.as_deref().unwrap_or(""), "opencode")
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // `findHarnessProcesses`: processNames pool filter, then canHandle
        // deduped by pid (first wins).
        let mut seen = HashSet::new();
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| {
                shared::matches_executable_name(
                    p.command.as_deref().unwrap_or(""),
                    &["opencode"],
                )
            })
            .filter(|p| self.can_handle(p) && seen.insert(p.pid))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let Some(db) = locator::open_db(&self.db_path) else {
            return processes
                .into_iter()
                .map(|proc| {
                    shared::process_only_agent(
                        "opencode",
                        proc,
                        "OpenCode process running",
                        None,
                        ctx.now,
                    )
                })
                .collect();
        };

        let mut agents = Vec::new();
        for proc in processes {
            let session = proc
                .cwd
                .as_deref()
                .and_then(|cwd| locator::find_session_for_directory(&db, cwd));
            match session {
                Some(session) => {
                    let stats = parser::get_session_stats(&db, &session.session_id);
                    agents.push(self.map_session(&session, &stats, proc, ctx.now));
                }
                None => agents.push(shared::process_only_agent(
                    "opencode",
                    proc,
                    "OpenCode process running",
                    None,
                    ctx.now,
                )),
            }
        }
        agents
    }
}

/// `determineStatus` — idle(5min) short-circuits; last assistant role:
/// not-completed → running, completed → waiting; anything else running.
/// (TS's `lastAssistantErrored` flag is likewise unused there.)
fn determine_status(stats: &parser::SessionStats, last_active_ms: i64, now_ms: i64) -> &'static str {
    if shared::is_idle(last_active_ms, now_ms) {
        return "idle";
    }
    match stats.last_role.as_deref() {
        Some("assistant") if !stats.last_assistant_completed => "running",
        Some("assistant") => "waiting",
        _ => "running",
    }
}
