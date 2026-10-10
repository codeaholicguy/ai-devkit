//! Port of `packages/agent-manager/src/harnesses/muse` — Meta Muse Code
//! detection.
//!
//! Flow (mirrors `detectRunningAgents`):
//! 1. pool-filter the snapshot to `muse` (exact) and `muse-*` launchers,
//!    canHandle + first-wins dedupe
//! 2. `match_running_processes`: runtime-file PID join (authoritative,
//!    staleness-guarded), then the legacy cwd+birthtime join
//! 3. transcript → `map_session_to_agent`; missing/unreadable transcript →
//!    process-only agent

mod locator;
mod parser;

use crate::shared;
use crate::{EnrichedAgent, HarnessAdapter, SweepContext};
use devkit_core::discover::AgentProc;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub struct MuseAdapter {
    store_dir: PathBuf,
}

impl MuseAdapter {
    /// `~/.local/share/muse` under `home`.
    pub fn new(home: &Path) -> Self {
        Self {
            store_dir: home.join(".local").join("share").join("muse"),
        }
    }

    fn runtime_dir(&self) -> PathBuf {
        self.store_dir
            .join("runtime")
            .join("muse")
            .join("sessions")
    }

    fn archive_dir(&self) -> PathBuf {
        self.store_dir.join("sessions")
    }

    /// `canHandle` — basename is exactly `muse`/`muse.exe` or a versioned
    /// `muse-bin-*` launcher. Deliberately narrower than the pool filter
    /// below: the pool is recall, this is precision (mirrors TS).
    fn is_muse_command(command: &str) -> bool {
        let base = shared::executable_basename(command);
        let base = base.strip_suffix(".exe").unwrap_or(&base).to_lowercase();
        base == "muse" || base.starts_with("muse-bin-")
    }

    /// `mapSessionToAgent` — project-based name, last prompt summary,
    /// parser status (no idle override, matching TS).
    fn map_session_to_agent(
        &self,
        session: &parser::Session,
        proc: &AgentProc,
    ) -> EnrichedAgent {
        let cwd = proc.cwd.clone().unwrap_or_default();
        EnrichedAgent {
            name: shared::generate_agent_name(&cwd, proc.pid),
            agent_type: "muse".into(),
            status: parser::status(session).into(),
            summary: session
                .last_user_message
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Session started".into()),
            pid: proc.pid as u64,
            project_path: if session.project_path.is_empty() {
                cwd
            } else {
                session.project_path.clone()
            },
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(session.last_active_ms),
            pinned: None,
            session_file_path: Some(session.transcript_path.clone()),
        }
    }
}

impl HarnessAdapter for MuseAdapter {
    fn type_id(&self) -> &'static str {
        "muse"
    }

    fn can_handle(&self, proc: &AgentProc) -> bool {
        proc.command
            .as_deref()
            .map(Self::is_muse_command)
            .unwrap_or(false)
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // Pool filter is recall (exact `muse` or any `muse-*` launcher);
        // canHandle below stays the precision gate.
        let mut seen = HashSet::new();
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| {
                p.command.as_deref().map(|c| {
                    shared::matches_executable_name(c, &["muse"])
                        || shared::matches_executable_prefix(c, "muse")
                })
                .unwrap_or(false)
            })
            .filter(|p| self.can_handle(p) && seen.insert(p.pid))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let runtime_dir = self.runtime_dir();
        let archive_dir = self.archive_dir();
        let (matched, fallback) =
            locator::match_running_processes(&runtime_dir, &archive_dir, &processes);

        let mut agents = Vec::new();
        let mut mapped: HashSet<i64> = HashSet::new();
        let mut unmapped: HashSet<i64> = HashSet::new();
        for m in &matched {
            let session = parser::read_session(
                &m.session_file.session_id,
                &m.session_file.file_path,
                &m.session_file.resolved_cwd,
            );
            match session {
                Some(s) => {
                    mapped.insert(m.process.pid);
                    agents.push(self.map_session_to_agent(&s, m.process));
                }
                None => {
                    unmapped.insert(m.process.pid);
                }
            }
        }

        // Like TS: unmatched processes plus matches whose transcript fails
        // to parse become process-only rows.
        for proc in fallback
            .into_iter()
            .chain(processes.iter().copied().filter(|p| unmapped.contains(&p.pid)))
        {
            if mapped.contains(&proc.pid) {
                continue;
            }
            agents.push(shared::process_only_agent(
                "muse",
                proc,
                "Muse process running",
                None,
                ctx.now,
            ));
        }
        agents
    }
}
