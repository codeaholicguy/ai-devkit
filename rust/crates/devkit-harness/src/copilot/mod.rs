//! CopilotAdapter port — `inuse.<pid>.lock` session attribution,
//! events.jsonl/workspace.yaml enrichment, wrapper registry naming,
//! process-only fallback.

mod locator;
mod parser;

use crate::shared;
use crate::{HarnessAdapter, SweepContext};
use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

pub struct CopilotAdapter {
    home: PathBuf,
    locator: locator::CopilotSessionLocator,
}

impl CopilotAdapter {
    pub fn new(home: &std::path::Path) -> Self {
        Self {
            home: home.to_path_buf(),
            locator: locator::CopilotSessionLocator::new(home),
        }
    }

    /// `mapSessionToAgent`.
    fn map_session(session: &parser::Session, proc: &AgentProc, now_ms: i64) -> EnrichedAgent {
        let project_path = if session.project_path.is_empty() {
            proc.cwd.clone().unwrap_or_default()
        } else {
            session.project_path.clone()
        };
        EnrichedAgent {
            name: shared::generate_agent_name(&project_path, proc.pid),
            agent_type: "copilot".into(),
            status: parser::determine_status(session, now_ms).into(),
            summary: if session.summary.is_empty() {
                "Copilot session active".into()
            } else {
                session.summary.clone()
            },
            pid: proc.pid as u64,
            project_path,
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(session.last_active_ms),
            pinned: None,
            session_file_path: Some(session.events_file_path.clone()),
        }
    }

    /// `applyWrapperRegistryName` — the agent takes its wrapper's registry
    /// name when the wrapper's row is for this harness type.
    fn apply_wrapper_registry_name(
        agent: &mut EnrichedAgent,
        proc: &AgentProc,
        processes: &[&AgentProc],
        registry_by_pid: &HashMap<i64, shared::RegistryRow>,
    ) {
        if let Some(wrapper_pid) = shared::find_wrapper_pid(processes, proc) {
            if let Some(entry) = registry_by_pid.get(&wrapper_pid) {
                if entry.agent_type == "copilot" {
                    agent.name = entry.name.clone();
                }
            }
        }
    }
}

impl HarnessAdapter for CopilotAdapter {
    fn type_id(&self) -> &'static str {
        "copilot"
    }

    /// `canHandle` — `matchesExecutable(command, "copilot")`.
    fn can_handle(&self, proc: &AgentProc) -> bool {
        shared::matches_executable(proc.command.as_deref().unwrap_or(""), "copilot")
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // `findHarnessProcesses`: processNames pool filter, then canHandle
        // deduped by pid (first wins).
        let mut seen = HashSet::new();
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| {
                shared::matches_executable_name(p.command.as_deref().unwrap_or(""), &["copilot"])
            })
            .filter(|p| self.can_handle(p) && seen.insert(p.pid))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let proc_by_pid: HashMap<i64, &AgentProc> =
            processes.iter().map(|p| (p.pid, *p)).collect();
        let registry_by_pid: HashMap<i64, shared::RegistryRow> =
            shared::registry_agent_rows(&self.home)
                .into_iter()
                .map(|r| (r.pid, r))
                .collect();
        let mut matched_pids = HashSet::new();
        let mut matched_processes: Vec<&AgentProc> = Vec::new();
        let mut agents = Vec::new();

        for lock in self.locator.discover_active_locks(&processes) {
            let Some(&proc) = proc_by_pid.get(&lock.pid) else {
                continue;
            };
            let Some(session) =
                parser::read_session_dir(&lock.session_dir, &lock.session_id, ctx.now)
            else {
                continue;
            };
            let mut agent = Self::map_session(&session, proc, ctx.now);
            Self::apply_wrapper_registry_name(&mut agent, proc, &processes, &registry_by_pid);
            agents.push(agent);
            matched_pids.insert(proc.pid);
            matched_processes.push(proc);
        }

        let wrapper_pids = shared::wrapper_pids(&processes, &matched_processes);
        for proc in &processes {
            if !matched_pids.contains(&proc.pid) && !wrapper_pids.contains(&proc.pid) {
                let mut agent = shared::process_only_agent(
                    "copilot",
                    proc,
                    "Copilot process running",
                    None,
                    ctx.now,
                );
                Self::apply_wrapper_registry_name(&mut agent, proc, &processes, &registry_by_pid);
                agents.push(agent);
            }
        }

        agents
    }
}
