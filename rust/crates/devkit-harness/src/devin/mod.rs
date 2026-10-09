//! DevinAdapter port — `packages/agent-manager/src/harnesses/devin`.
//!
//! `devin` process detection (utility subcommands and `devin acp` backend
//! children excluded) + session attribution via `session_locks/*.lock`
//! (session slug → holder PID; a TUI matches through its backend child's
//! ppid) with `sessions.working_directory` fallback in
//! `~/.local/share/devin/cli/sessions.db`.

mod locator;
mod parser;

use crate::shared;
use crate::{HarnessAdapter, SweepContext};
use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

/// `devin` invocations that are utilities, not agent sessions. `acp` is
/// deliberately absent: a standalone `devin acp` serves an external client
/// and is itself an agent.
const UTILITY_SUBCOMMANDS: &[&str] = &[
    "auth", "cloud", "desktop", "doctor", "forward", "help", "list", "ls", "mcp", "migrate",
    "models", "plugins", "rm", "rules", "sandbox", "setup", "skills", "ssh", "uninstall",
    "update", "version",
];

/// Flags that always consume the next argv token as their value.
const REQUIRED_VALUE_FLAGS: &[&str] = &["--prompt-file", "--config", "--permission-mode", "--model"];

/// Flags whose value is optional: the next token is consumed only when it
/// isn't itself a flag (commander `[<VALUE>]` semantics).
const OPTIONAL_VALUE_FLAGS: &[&str] =
    &["-p", "--print", "-r", "--resume", "--export", "--respect-workspace-trust"];

/// `firstPositionalToken` — first positional argv token after argv[0].
/// Flag values are skipped (so `devin -p "update deps"` isn't mistaken
/// for the `update` subcommand); `--` ends the search.
fn first_positional_token(command: &str) -> Option<String> {
    let argv0 = shared::executable_path(command);
    let trimmed = command.trim();
    // argv0 joins command tokens with single spaces; when the original
    // spacing differs the byte len may not land on a boundary — treat a
    // failed slice as "no tokens" rather than panic (JS just mis-slices).
    let rest = trimmed.get(argv0.len()..).unwrap_or("").trim();
    let tokens: Vec<&str> = rest.split_whitespace().collect();
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        if token == "--" {
            return None;
        }
        if !token.starts_with('-') {
            return Some(token.to_string());
        }
        // `token.split("=", 1)[0]` — a `--flag=value` token never skips
        // the next argv entry; only a bare flag might.
        if !token.contains('=')
            && (REQUIRED_VALUE_FLAGS.contains(&token)
                || (OPTIONAL_VALUE_FLAGS.contains(&token)
                    && !tokens.get(i + 1).is_some_and(|t| t.starts_with('-'))))
        {
            i += 1;
        }
        i += 1;
    }
    None
}

/// `isUtilitySubcommand` gate inside `canHandle`.
fn is_utility(command: &str) -> bool {
    first_positional_token(command).is_some_and(|t| UTILITY_SUBCOMMANDS.contains(&t.to_lowercase().as_str()))
}

pub struct DevinAdapter {
    db_path: PathBuf,
    locks_dir: PathBuf,
}

impl DevinAdapter {
    /// Env-aware constructor — `$XDG_DATA_HOME`-aware sessions.db and the
    /// sibling `session_locks/` dir, like the TS locator defaults.
    pub fn new(home: &std::path::Path) -> Self {
        Self::at_db(locator::resolve_db_path(home))
    }

    /// Explicit db path — locks dir is `session_locks/` next to it.
    pub fn at_db(db_path: PathBuf) -> Self {
        let locks_dir = db_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new(""))
            .join("session_locks");
        Self { db_path, locks_dir }
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
        } else if session.last_activity_at_ms != 0 {
            session.last_activity_at_ms
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
            agent_type: "devin".into(),
            status: determine_status(stats, last_active_ms, now_ms).into(),
            summary: if !stats.summary.is_empty() {
                stats.summary.clone()
            } else {
                session
                    .title
                    .clone()
                    .filter(|t| !t.is_empty())
                    .unwrap_or_else(|| "Devin session active".into())
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

impl HarnessAdapter for DevinAdapter {
    fn type_id(&self) -> &'static str {
        "devin"
    }

    /// `canHandle` — argv0 `devin`/`devin.exe` and not a utility subcommand.
    fn can_handle(&self, proc: &AgentProc) -> bool {
        let command = proc.command.as_deref().unwrap_or("");
        shared::matches_executable(command, "devin") && !is_utility(command)
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        // `findHarnessProcesses`: processNames pool filter, then canHandle
        // deduped by pid (first wins).
        let mut seen = HashSet::new();
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| shared::matches_executable_name(p.command.as_deref().unwrap_or(""), &["devin"]))
            .filter(|p| self.can_handle(p) && seen.insert(p.pid))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let db = locator::open_db(&self.db_path);
        let process_by_pid: HashMap<i64, &AgentProc> =
            processes.iter().map(|p| (p.pid, *p)).collect();

        // Locks map a session to its holder PID (the `devin acp` backend);
        // a TUI is matched through its backend child's ppid. Only locks
        // whose holder is a live devin proc in this snapshot count —
        // later entries overwrite (JS Map last-wins, readdir order).
        let mut session_by_pid: HashMap<i64, String> = HashMap::new();
        for lock in locator::list_active_locks(&self.locks_dir) {
            let Some(holder) = process_by_pid.get(&lock.pid) else {
                continue;
            };
            if !self.can_handle(holder) {
                continue;
            }
            session_by_pid.insert(lock.pid, lock.session_id.clone());
            if let Some(ppid) = holder.ppid {
                session_by_pid.insert(ppid, lock.session_id.clone());
            }
        }

        let mut agents = Vec::new();
        for proc in processes {
            // A `devin acp` spawned by another devin proc is the session's
            // backend, not a separate agent — skipped entirely.
            if is_acp_backend_child(proc, &process_by_pid) {
                continue;
            }
            let slug = session_by_pid.get(&proc.pid);
            let session = db.as_ref().and_then(|db| match slug {
                Some(slug) => locator::find_session_by_id(db, slug),
                None => proc
                    .cwd
                    .as_deref()
                    .and_then(|cwd| locator::find_session_for_directory(db, cwd)),
            });
            match (session, db.as_ref()) {
                (Some(session), Some(db)) => {
                    let stats = parser::get_session_stats(db, &session.session_id);
                    agents.push(self.map_session(&session, &stats, proc, ctx.now));
                }
                _ => agents.push(shared::process_only_agent(
                    "devin",
                    proc,
                    "Devin process running",
                    None,
                    ctx.now,
                )),
            }
        }
        agents
    }
}

/// `isAcpBackendChild` — `acp` first positional + a live devin parent in
/// the snapshot → the proc is a backend, skipped entirely.
fn is_acp_backend_child(proc: &AgentProc, process_by_pid: &HashMap<i64, &AgentProc>) -> bool {
    if first_positional_token(proc.command.as_deref().unwrap_or(""))
        .is_none_or(|t| t.to_lowercase() != "acp")
    {
        return false;
    }
    let Some(ppid) = proc.ppid else { return false };
    process_by_pid.contains_key(&ppid)
}

/// `determineStatus` — idle(5min) > lastRole==="assistant" (waiting) >
/// running.
fn determine_status(stats: &parser::SessionStats, last_active_ms: i64, now_ms: i64) -> &'static str {
    if shared::is_idle(last_active_ms, now_ms) {
        return "idle";
    }
    if stats.last_role.as_deref() == Some("assistant") {
        "waiting"
    } else {
        "running"
    }
}
