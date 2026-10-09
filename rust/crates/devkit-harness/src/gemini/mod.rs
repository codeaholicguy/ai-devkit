//! `GeminiCliAdapter` port — `type = "gemini_cli"`.
//!
//! Detect pipeline mirrors TS order:
//! 1. `canHandle` any-token basename scan (`gemini`/`gemini.exe`/`gemini.js`)
//! 2. wrapper-pid set over the candidate pool
//! 3. registry cache rows (`type='gemini_cli'`, parseable sessionFilePath)
//! 4. locator discovery + greedy matching + parse; matched wrappers fold
//!    into their child's agent (name taken from the wrapper's registry row)
//! 5. process-only fallback ("Gemini CLI process running")
//! 6. `deduplicateSessionAgents` keyed on file path / session id, highest
//!    pid wins in place

mod locator;
mod parser;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;

use crate::shared;
use crate::{HarnessAdapter, SweepContext};
use locator::GeminiSessionLocator;
use parser::GeminiSession;

pub struct GeminiAdapter {
    home: PathBuf,
    locator: GeminiSessionLocator,
}

impl GeminiAdapter {
    pub fn new(home: &Path) -> Self {
        Self {
            home: home.to_path_buf(),
            locator: GeminiSessionLocator::new(home),
        }
    }

    /// `isGeminiExecutable` — any whitespace-separated token whose basename
    /// is a gemini entrypoint (node-script distribution puts it in argv[1..]).
    fn is_gemini_executable(command: &str) -> bool {
        command.split_whitespace().any(|token| {
            matches!(
                shared::path_basename(token).as_str(),
                "gemini" | "gemini.exe" | "gemini.js"
            )
        })
    }

    fn map_session(
        &self,
        session: &GeminiSession,
        proc: &AgentProc,
        file_path: &str,
        now: i64,
    ) -> EnrichedAgent {
        let project_path = if session.project_path.is_empty() {
            proc.cwd.clone().unwrap_or_default()
        } else {
            session.project_path.clone()
        };
        EnrichedAgent {
            name: shared::generate_agent_name(&project_path, proc.pid),
            agent_type: "gemini_cli".into(),
            status: parser::determine_status(session, now).into(),
            summary: if session.summary.is_empty() {
                "Gemini CLI session active".into()
            } else {
                session.summary.clone()
            },
            pid: proc.pid as u64,
            project_path,
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(session.last_active_ms),
            pinned: None,
            session_file_path: Some(file_path.to_string()),
        }
    }

    /// `applyWrapperRegistryName` — a wrapper (parent in the same terminal)
    /// with a same-type registry row lends its name to the child's agent.
    fn apply_wrapper_name(
        agent: &mut EnrichedAgent,
        proc: &AgentProc,
        processes: &[&AgentProc],
        reg_by_pid: &HashMap<i64, &shared::RegistryRow>,
    ) {
        let Some(wrapper_pid) = shared::find_wrapper_pid(processes, proc) else {
            return;
        };
        let Some(entry) = reg_by_pid.get(&wrapper_pid) else {
            return;
        };
        if entry.agent_type == "gemini_cli" {
            agent.name = entry.name.clone();
        }
    }

    /// `deduplicateSessionAgents` — one row per session file/id, highest pid.
    fn deduplicate(agents: Vec<EnrichedAgent>) -> Vec<EnrichedAgent> {
        let key_of = |a: &EnrichedAgent| -> Option<String> {
            if let Some(p) = &a.session_file_path {
                return Some(format!("file:{p}"));
            }
            if !a.session_id.is_empty() && !a.session_id.starts_with("pid-") {
                return Some(format!("session:{}", a.session_id));
            }
            None
        };
        let mut by_session: HashMap<String, usize> = HashMap::new();
        let mut result: Vec<EnrichedAgent> = Vec::new();
        for agent in agents {
            let Some(key) = key_of(&agent) else {
                result.push(agent);
                continue;
            };
            match by_session.get(&key) {
                None => {
                    by_session.insert(key, result.len());
                    result.push(agent);
                }
                Some(&idx) => {
                    if agent.pid > result[idx].pid {
                        result[idx] = agent;
                    }
                }
            }
        }
        result
    }
}

impl HarnessAdapter for GeminiAdapter {
    fn type_id(&self) -> &'static str {
        "gemini_cli"
    }

    fn can_handle(&self, proc: &AgentProc) -> bool {
        proc.command
            .as_deref()
            .map(Self::is_gemini_executable)
            .unwrap_or(false)
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // `findHarnessProcesses`: the `node` process-name pool first (a bare
        // `gemini` argv0 proc is dropped before canHandle), then
        // canHandle-filtered, first-wins by pid.
        let mut seen = HashSet::new();
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| {
                p.command
                    .as_deref()
                    .map(|c| shared::matches_executable_name(c, &["node"]))
                    .unwrap_or(false)
                    && self.can_handle(p)
                    && seen.insert(p.pid)
            })
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let wrapper_set = shared::wrapper_pids(&processes, &[]);
        let reg_rows = shared::registry_agent_rows(&self.home);
        let reg_by_pid: HashMap<i64, &shared::RegistryRow> =
            reg_rows.iter().map(|r| (r.pid, r)).collect();

        // Registry-cache stage (skipped for wrappers).
        let mut cached: Vec<EnrichedAgent> = Vec::new();
        let mut remaining: Vec<&AgentProc> = Vec::new();
        for proc in &processes {
            let entry = reg_by_pid.get(&proc.pid);
            let cacheable = !wrapper_set.contains(&proc.pid)
                && entry.is_some_and(|e| {
                    e.agent_type == "gemini_cli" && !e.session_file_path.is_empty()
                });
            if !cacheable {
                remaining.push(proc);
                continue;
            }
            let path = &entry.unwrap().session_file_path;
            match parser::parse_session(path, ctx.now) {
                Some(s) => cached.push(self.map_session(&s, proc, path, ctx.now)),
                None => remaining.push(proc),
            }
        }
        if remaining.is_empty() {
            return Self::deduplicate(cached);
        }

        let candidates: Vec<&AgentProc> = remaining
            .iter()
            .copied()
            .filter(|p| !wrapper_set.contains(&p.pid))
            .collect();
        let sessions = self.locator.discover_sessions(&candidates);

        let mut agents: Vec<EnrichedAgent> = Vec::new();
        if sessions.is_empty() {
            for proc in &candidates {
                let mut a = shared::process_only_agent(
                    "gemini_cli",
                    proc,
                    "Gemini CLI process running",
                    None,
                    ctx.now,
                );
                Self::apply_wrapper_name(&mut a, proc, &processes, &reg_by_pid);
                agents.push(a);
            }
        } else {
            let matches = shared::match_processes_to_sessions(&candidates, &sessions);
            let mut matched_pids: HashSet<i64> = HashSet::new();
            let mut matched_procs: Vec<&AgentProc> = Vec::new();
            for m in &matches {
                let file = &sessions[m.session_idx].file_path;
                match parser::parse_session(file, ctx.now) {
                    Some(s) => {
                        let mut a = self.map_session(&s, m.proc, file, ctx.now);
                        Self::apply_wrapper_name(&mut a, m.proc, &processes, &reg_by_pid);
                        agents.push(a);
                        matched_pids.insert(m.proc.pid);
                        matched_procs.push(m.proc);
                    }
                    None => continue,
                }
            }
            let matched_wrapper_pids = shared::wrapper_pids(&candidates, &matched_procs);
            for proc in &candidates {
                if matched_pids.contains(&proc.pid) || matched_wrapper_pids.contains(&proc.pid) {
                    continue;
                }
                let mut a = shared::process_only_agent(
                    "gemini_cli",
                    proc,
                    "Gemini CLI process running",
                    None,
                    ctx.now,
                );
                Self::apply_wrapper_name(&mut a, proc, &processes, &reg_by_pid);
                agents.push(a);
            }
        }

        Self::deduplicate(cached.into_iter().chain(agents).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gemini_executable_tokens() {
        assert!(GeminiAdapter::is_gemini_executable("gemini"));
        assert!(GeminiAdapter::is_gemini_executable("node /opt/gemini.js --yolo"));
        assert!(GeminiAdapter::is_gemini_executable("C:\\tools\\gemini.exe chat"));
        assert!(!GeminiAdapter::is_gemini_executable("geminis"));
        assert!(!GeminiAdapter::is_gemini_executable("node server.js"));
    }

    #[test]
    fn dedupe_keeps_highest_pid_in_place() {
        let a = |pid: u64, sid: &str| EnrichedAgent {
            name: format!("a-{pid}"),
            agent_type: "gemini_cli".into(),
            status: "running".into(),
            summary: String::new(),
            pid,
            project_path: String::new(),
            session_id: sid.into(),
            last_active: String::new(),
            pinned: None,
            session_file_path: None,
        };
        let out = GeminiAdapter::deduplicate(vec![a(1, "s1"), a(2, "s1"), a(3, "s2")]);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].pid, 2);
        assert_eq!(out[1].pid, 3);
    }
}
