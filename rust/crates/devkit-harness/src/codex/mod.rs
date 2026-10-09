//! CodexAdapter port — helper-subcommand filtering, session mapping file,
//! in-memory registry cache, locator matching, process-only fallback.

mod locator;
mod parser;

use crate::shared;
use crate::{HarnessAdapter, SweepContext};
use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Codex subcommands that never own a local agent session (app-server,
/// sandbox, MCP/exec servers, short-lived management commands).
const CODEX_HELPER_SUBCOMMANDS: &[&str] = &[
    "agents",
    "app",
    "app-server",
    "apply",
    "a",
    "archive",
    "cloud",
    "cloud-tasks",
    "completion",
    "debug",
    "delete",
    "doctor",
    "exec-server",
    "features",
    "help",
    "login",
    "logout",
    "mcp",
    "mcp-server",
    "migrate-rollouts",
    "plugin",
    "queue",
    "remote-control",
    "responses-api-proxy",
    "sandbox",
    "stdio-to-uds",
    "unarchive",
    "update",
];

/// All root subcommand names — a variadic flag's values stop at these.
const CODEX_SUBCOMMANDS: &[&str] = &[
    "agents",
    "app",
    "app-server",
    "apply",
    "a",
    "archive",
    "cloud",
    "cloud-tasks",
    "completion",
    "debug",
    "delete",
    "doctor",
    "exec-server",
    "features",
    "help",
    "login",
    "logout",
    "mcp",
    "mcp-server",
    "migrate-rollouts",
    "plugin",
    "queue",
    "remote-control",
    "responses-api-proxy",
    "sandbox",
    "stdio-to-uds",
    "unarchive",
    "update",
    "e",
    "exec",
    "execpolicy",
    "fork",
    "resume",
    "review",
    "tcp-tunnel",
];

/// Global flags consuming the following argument as their value.
const CODEX_VALUE_FLAGS: &[&str] = &[
    "-c",
    "--config",
    "-m",
    "--model",
    "-p",
    "--profile",
    "-s",
    "--sandbox",
    "-a",
    "--ask-for-approval",
    "-C",
    "--cd",
    "--add-dir",
    "--enable",
    "--disable",
    "--local-provider",
    "--remote",
    "--remote-auth-token-env",
];

/// Global flags taking one or more values (clap `num_args = 1..`).
const CODEX_VARIADIC_VALUE_FLAGS: &[&str] = &["-i", "--image"];

const CODEX_APP_SERVER_DAEMON_DIR: &str = "app-server-daemon";

fn is_helper_command(command: &str) -> bool {
    let trimmed = command.trim();
    let executable = shared::executable_path(trimmed);
    let args: Vec<&str> = trimmed[executable.len()..]
        .split_whitespace()
        .collect();
    if executable
        .replace('\\', "/")
        .split('/')
        .any(|part| part == CODEX_APP_SERVER_DAEMON_DIR)
    {
        return true;
    }
    match first_positional_argument(&args) {
        Some(sub) => CODEX_HELPER_SUBCOMMANDS.contains(&sub.as_str()),
        None => false,
    }
}

/// First bare positional arg, honoring clap's flag-value consumption rules.
fn first_positional_argument(args: &[&str]) -> Option<String> {
    let mut index = 0;
    while index < args.len() {
        let arg = args[index];
        if arg == "--" {
            return None;
        }
        if !arg.starts_with('-') {
            return Some(arg.to_string());
        }
        if arg.contains('=') {
            index += 1;
            continue;
        }
        if CODEX_VALUE_FLAGS.contains(&arg) {
            index += 2;
        } else if CODEX_VARIADIC_VALUE_FLAGS.contains(&arg) {
            index += 1;
            while index < args.len() && is_variadic_flag_value(args[index]) {
                index += 1;
            }
        } else {
            index += 1;
        }
    }
    None
}

fn is_variadic_flag_value(arg: &str) -> bool {
    !arg.starts_with('-') && !CODEX_SUBCOMMANDS.contains(&arg)
}

/// `~/.codex/ai-devkit/sessions.json` — pid→session filePath written by the
/// CLI when it launches managed codex sessions.
struct SessionMapping {
    mapping_path: PathBuf,
    sessions_dir: PathBuf,
}

impl SessionMapping {
    fn match_processes<'a>(&self, processes: &[&'a AgentProc]) -> Vec<(&'a AgentProc, String)> {
        let mapping = self.read();
        if mapping.is_empty() {
            return Vec::new();
        }
        let mut out = Vec::new();
        for &proc in processes {
            let Some(file_path) = mapping.get(&proc.pid) else {
                continue;
            };
            if !self.is_trusted(file_path) || !Path::new(file_path).exists() {
                continue;
            }
            out.push((proc, file_path.clone()));
        }
        out
    }

    fn read(&self) -> HashMap<i64, String> {
        let Ok(content) = std::fs::read_to_string(&self.mapping_path) else {
            return HashMap::new();
        };
        let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(&content) else {
            return HashMap::new();
        };
        obj.iter()
            .filter_map(|(k, v)| {
                let pid = to_pid_json(k)?;
                v.as_str().filter(|s| !s.is_empty()).map(|s| (pid, s.to_string()))
            })
            .collect()
    }

    /// Paths must resolve under the sessions dir (path.resolve semantics).
    fn is_trusted(&self, file_path: &str) -> bool {
        let root = normalize_path(&self.sessions_dir);
        let resolved = normalize_path(Path::new(file_path));
        resolved == root || resolved.starts_with(&format!("{root}/"))
    }
}

fn to_pid_json(key: &str) -> Option<i64> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    key.parse::<i64>().ok().filter(|p| *p > 0)
}

/// path.resolve equivalence for the trust check (lexical normalize).
fn normalize_path(p: &Path) -> String {
    let mut out: Vec<String> = Vec::new();
    for comp in p.components() {
        match comp {
            std::path::Component::RootDir => out.clear(),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::Normal(s) => out.push(s.to_string_lossy().into_owned()),
            std::path::Component::Prefix(_) => {}
        }
    }
    format!("/{}", out.join("/"))
}

pub struct CodexAdapter {
    home: PathBuf,
    sessions_dir: PathBuf,
    locator: locator::CodexSessionLocator,
}

impl CodexAdapter {
    pub fn new(home: &Path) -> Self {
        Self {
            home: home.to_path_buf(),
            sessions_dir: home.join(".codex").join("sessions"),
            locator: locator::CodexSessionLocator::new(home),
        }
    }

    fn map_session(
        &self,
        session: &parser::Session,
        proc: &AgentProc,
        file_path: &str,
        now_ms: i64,
    ) -> EnrichedAgent {
        let project = if session.project_path.is_empty() {
            proc.cwd.clone().unwrap_or_default()
        } else {
            session.project_path.clone()
        };
        EnrichedAgent {
            name: shared::generate_agent_name(&project, proc.pid),
            agent_type: "codex".into(),
            status: parser::determine_status(session, now_ms).into(),
            summary: session.summary.clone(),
            pid: proc.pid as u64,
            project_path: project,
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(session.last_active_ms),
            pinned: None,
            session_file_path: Some(file_path.to_string()),
        }
    }
}

impl HarnessAdapter for CodexAdapter {
    fn type_id(&self) -> &'static str {
        "codex"
    }

    fn can_handle(&self, proc: &AgentProc) -> bool {
        let cmd = proc.command.as_deref().unwrap_or("");
        shared::matches_executable(cmd, "codex") && !is_helper_command(cmd)
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        let mut seen = HashSet::new();
        let procs: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|p| self.can_handle(p) && seen.insert(p.pid))
            .collect();
        if procs.is_empty() {
            return Vec::new();
        }

        // Mirrors the TS stage chain — each stage's `fallback` feeds the next,
        // and the output order is mapping, cache, direct, legacy, then
        // process-only rows (direct fallback first, then locator survivors).
        let mut agents = Vec::new();
        let mut done_pids: HashSet<i64> = HashSet::new();
        // pid→sessionFilePath from `<home>/.ai-devkit/agents.db` — the TS
        // adapter reads AgentRegistry here (rows persist across runs).
        let registry = shared::registry_session_paths(&self.home, "codex");

        // 1. sessions.json mapping
        let mapping = SessionMapping {
            mapping_path: self.home.join(".codex").join("ai-devkit").join("sessions.json"),
            sessions_dir: self.sessions_dir.clone(),
        };
        let mapped: HashMap<i64, String> = mapping
            .match_processes(&procs)
            .into_iter()
            .map(|(p, f)| (p.pid, f))
            .collect();
        let mut fallback: Vec<&AgentProc> = Vec::new();
        for &proc in &procs {
            match mapped.get(&proc.pid) {
                Some(file_path) => match parser::read_session(file_path) {
                    Some(session) => {
                        agents.push(self.map_session(&session, proc, file_path, ctx.now));
                        done_pids.insert(proc.pid);
                    }
                    None => fallback.push(proc),
                },
                None => fallback.push(proc),
            }
        }

        // 2. registry cache
        let mut cache_fallback: Vec<&AgentProc> = Vec::new();
        for proc in fallback {
            let file_path = registry.get(&proc.pid).cloned();
            let session = file_path
                .as_deref()
                .filter(|p| Path::new(p).exists())
                .and_then(|p| parser::read_session(p).map(|s| (p.to_string(), s)));
            match session {
                Some((file_path, session)) => {
                    agents.push(self.map_session(&session, proc, &file_path, ctx.now));
                    done_pids.insert(proc.pid);
                }
                None => cache_fallback.push(proc),
            }
        }

        // 3. locator: resume/direct, then legacy greedy
        let matches = self.locator.match_running(&cache_fallback, ctx.now);
        let mut direct_fallback: Vec<&AgentProc> = Vec::new();
        for m in &matches.direct {
            match parser::read_session(&m.session_file.file_path) {
                Some(session) => {
                    agents.push(self.map_session(
                        &session,
                        m.proc,
                        &m.session_file.file_path,
                        ctx.now,
                    ));

                    done_pids.insert(m.proc.pid);
                }
                None => direct_fallback.push(m.proc),
            }
        }
        for m in &matches.legacy {
            let file = &matches.sessions[m.session_idx];
            if let Some(session) = parser::read_session(&file.file_path) {
                agents.push(self.map_session(&session, m.proc, &file.file_path, ctx.now));

                done_pids.insert(m.proc.pid);
            }
        }

        // 4. process-only: direct parse failures, then locator survivors.
        // `matches.fallback` excludes every proc that produced a direct match.
        for &proc in direct_fallback.iter().chain(matches.fallback.iter()) {
            if done_pids.contains(&proc.pid) {
                continue;
            }
            agents.push(shared::process_only_agent(
                "codex",
                proc,
                "Codex process running",
                None,
                ctx.now,
            ));
            done_pids.insert(proc.pid);
        }
        agents
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_subcommands_excluded() {
        for cmd in [
            "codex app-server",
            "codex mcp-server",
            "codex sandbox",
            "codex cloud",
            "codex login",
            "/opt/codex/app-server-daemon/bin",
        ] {
            assert!(is_helper_command(cmd), "{cmd}");
        }
        for cmd in [
            "codex",
            "codex resume 0199abcd-1234-7bcd-8def-0123456789ab",
            "codex exec do things",
            "codex fork",
            "codex review",
        ] {
            assert!(!is_helper_command(cmd), "{cmd}");
        }
    }

    #[test]
    fn flags_do_not_shadow_subcommand() {
        assert!(is_helper_command("codex --model o3 mcp-server"));
        assert!(is_helper_command("codex -m o3 --image a.png b.png sandbox"));
        assert!(!is_helper_command("codex --model o3 exec hi"));
        assert!(!is_helper_command("codex -- foo"));
    }

    #[test]
    fn variadic_image_consumes_until_subcommand() {
        // `sandbox` is a known subcommand → stops variadic consumption.
        assert!(is_helper_command("codex --image a.png b.png sandbox"));
        // `foo` is not a subcommand → swallowed as image value.
        assert!(!is_helper_command("codex --image a.png b.png foo"));
    }

    #[test]
    fn pid_parsing() {
        assert_eq!(to_pid_json("123"), Some(123));
        assert_eq!(to_pid_json("0"), None);
        assert_eq!(to_pid_json("-1"), None);
        assert_eq!(to_pid_json("abc"), None);
        assert_eq!(to_pid_json(""), None);
    }
}
