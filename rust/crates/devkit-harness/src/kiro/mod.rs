//! Port of `packages/agent-manager/src/harnesses/kiro` — Kiro CLI detection.
//!
//! Flow (mirrors `detectRunningAgents`):
//! 1. pool-filter the snapshot to the process names (`kiro-cli`, `kiro`,
//!    `kiro-cli-chat`, `node`, `bun` — helpers stay in `relevant` so the
//!    lock-pid ancestor walk can traverse them), then canHandle + dedupe
//! 2. `matchRunningProcesses`: `<id>.lock` files → outermost Kiro ancestor
//!    of the lock holder, else the sole Kiro process on the holder's tty
//! 3. each match whose `<id>.jsonl` transcript exists maps to an agent —
//!    one proc may hold several locks and so produce several agents
//! 4. processes with no lock → process-only agents

mod locator;
mod parser;

use crate::shared;
use crate::{EnrichedAgent, HarnessAdapter, SweepContext};
use devkit_core::discover::AgentProc;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// `processNames` — the pool `findHarnessProcesses` filters the snapshot to.
const PROCESS_NAMES: &[&str] = &["kiro-cli", "kiro", "kiro-cli-chat", "node", "bun"];

pub struct KiroAdapter {
    sessions_dir: PathBuf,
}

impl KiroAdapter {
    pub fn new(home: &Path) -> Self {
        Self {
            sessions_dir: home.join(".kiro").join("sessions").join("cli"),
        }
    }

    /// Sessions-dir override for fixture replay (no `~` involved).
    pub fn at_sessions_dir(dir: impl Into<PathBuf>) -> Self {
        Self {
            sessions_dir: dir.into(),
        }
    }

    /// `isKiroExecutable` — `kiro-cli`/`kiro` directly, or as a script run
    /// by node/bun (`node /path/kiro-cli.js`).
    fn is_kiro_executable(command: &str) -> bool {
        let trimmed = command.trim();
        let executable = shared::executable_path(trimmed);
        if executable.is_empty() {
            return false;
        }
        let name = kiro_basename(&executable);
        if name == "kiro-cli" || name == "kiro" {
            return true;
        }
        if name != "node" && name != "bun" {
            return false;
        }
        // Script runtime: first non-flag token starts the script path.
        let rest = trimmed.get(executable.len()..).unwrap_or("").trim();
        let tokens: Vec<&str> = rest.split_whitespace().collect();
        let Some(idx) = tokens.iter().position(|t| !t.starts_with('-')) else {
            return false;
        };
        let script = shared::executable_path(&tokens[idx..].join(" "));
        let script_name = kiro_basename(&script);
        script_name == "kiro-cli" || script_name == "kiro"
    }

    fn can_handle_proc(&self, proc: &AgentProc) -> bool {
        proc.command
            .as_deref()
            .map(Self::is_kiro_executable)
            .unwrap_or(false)
    }

    /// `mapSessionToAgent` — name from projectPath, status from transcript
    /// summary, lastActive = metadata/last timestamp/mtime.
    fn map_session_to_agent(
        &self,
        session: &parser::KiroSession,
        proc: &AgentProc,
        now: i64,
    ) -> EnrichedAgent {
        let summary = [
            session.last_user_message.as_deref().unwrap_or(""),
            session.title.as_str(),
            "Kiro session active",
        ]
        .into_iter()
        .find(|s| !s.is_empty())
        .unwrap();
        EnrichedAgent {
            name: shared::generate_agent_name(&session.project_path, proc.pid),
            agent_type: "kiro".into(),
            status: parser::status(session, now).into(),
            summary: shared::truncate(summary, 120),
            pid: proc.pid as u64,
            project_path: session.project_path.clone(),
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(session.last_active_ms),
            pinned: None,
            session_file_path: Some(session.transcript_path.clone()),
        }
    }
}

/// `kiroBasename` — basename after '\'→'/', lowercased, `.exe`/`.js` stripped.
fn kiro_basename(executable: &str) -> String {
    let b = shared::path_basename(executable);
    b.strip_suffix(".exe")
        .or_else(|| b.strip_suffix(".js"))
        .unwrap_or(&b)
        .to_string()
}

impl HarnessAdapter for KiroAdapter {
    fn type_id(&self) -> &'static str {
        "kiro"
    }

    fn can_handle(&self, proc: &AgentProc) -> bool {
        self.can_handle_proc(proc)
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // `findHarnessProcesses`: `relevant` = process-names pool (helpers
        // included — the ppid walk needs them); `processes` = canHandle'd,
        // first-wins by pid.
        let relevant: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| {
                p.command
                    .as_deref()
                    .map(|c| shared::matches_executable_name(c, PROCESS_NAMES))
                    .unwrap_or(false)
            })
            .collect();
        let mut seen = HashSet::new();
        let processes: Vec<&AgentProc> = relevant
            .iter()
            .copied()
            .filter(|p| self.can_handle(p) && seen.insert(p.pid))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let mut agents = Vec::new();
        let mut matched_pids = HashSet::new();
        for m in locator::match_running_processes(
            &self.sessions_dir,
            &relevant,
            &processes,
            |p| self.can_handle_proc(p),
        ) {
            let cwd = m.process.cwd.as_deref().unwrap_or("");
            let Some(session) = parser::read_session(&self.sessions_dir, &m.session_id, cwd)
            else {
                continue;
            };
            agents.push(self.map_session_to_agent(&session, m.process, ctx.now));
            matched_pids.insert(m.process.pid);
        }
        for proc in &processes {
            if !matched_pids.contains(&proc.pid) {
                agents.push(shared::process_only_agent(
                    "kiro",
                    proc,
                    "Kiro process running",
                    None,
                    ctx.now,
                ));
            }
        }
        agents
    }
}
