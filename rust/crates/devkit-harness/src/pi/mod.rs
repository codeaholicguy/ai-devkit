//! PiAdapter port — registry cache, sessions.json tracker, project-dir
//! locator matching, process-only fallback.

mod locator;
mod parser;

use crate::shared;
use crate::{HarnessAdapter, SweepContext};
use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// `isPiExecutable` — any whitespace token whose basename is pi/pi.exe/pi.js.
fn is_pi_executable(command: &str) -> bool {
    command
        .split_whitespace()
        .any(|tok| matches!(shared::path_basename(tok).as_str(), "pi" | "pi.exe" | "pi.js"))
}

/// `~/.pi/agent/sessions.json` — pid→session filePath written when the CLI
/// launches managed pi sessions.
struct SessionTracker {
    tracker_path: PathBuf,
    sessions_dir: PathBuf,
}

impl SessionTracker {
    fn match_processes<'a>(
        &self,
        processes: &[&'a AgentProc],
    ) -> (Vec<(&'a AgentProc, String)>, Vec<&'a AgentProc>) {
        let tracker = self.read();
        let mut matches = Vec::new();
        let mut fallback = Vec::new();
        if tracker.is_empty() {
            return (matches, processes.to_vec());
        }
        for &proc in processes {
            match tracker.get(&proc.pid) {
                Some(file_path)
                    if self.is_trusted(file_path) && Path::new(file_path).exists() =>
                {
                    matches.push((proc, file_path.clone()));
                }
                _ => fallback.push(proc),
            }
        }
        (matches, fallback)
    }

    fn read(&self) -> HashMap<i64, String> {
        let Ok(content) = std::fs::read_to_string(&self.tracker_path) else {
            return HashMap::new();
        };
        let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(&content) else {
            return HashMap::new();
        };
        obj.iter()
            .filter_map(|(k, v)| {
                let pid = to_pid(k)?;
                v.as_str().filter(|s| !s.is_empty()).map(|s| (pid, s.to_string()))
            })
            .collect()
    }

    /// `isTrustedSessionPath` — path.resolve containment under sessionsDir.
    fn is_trusted(&self, file_path: &str) -> bool {
        let root = normalize_path(&self.sessions_dir);
        let resolved = normalize_path(Path::new(file_path));
        resolved == root || resolved.starts_with(&format!("{root}/"))
    }
}

fn to_pid(key: &str) -> Option<i64> {
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

pub struct PiAdapter {
    home: PathBuf,
    sessions_dir: PathBuf,
    locator: locator::PiSessionLocator,
}

impl PiAdapter {
    pub fn new(home: &Path) -> Self {
        Self {
            home: home.to_path_buf(),
            sessions_dir: home.join(".pi").join("agent").join("sessions"),
            locator: locator::PiSessionLocator::new(home),
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
            agent_type: "pi".into(),
            status: parser::determine_status(session, now_ms).into(),
            summary: if session.summary.is_empty() {
                "Pi session active".into()
            } else {
                session.summary.clone()
            },
            pid: proc.pid as u64,
            project_path: project,
            session_id: session.session_id.clone(),
            last_active: shared::iso_utc(session.last_active_ms),
            pinned: None,
            session_file_path: Some(file_path.to_string()),
        }
    }

    /// `mapSessionFileMatches` — parse each matched file; parse failures go
    /// to the returned fallback (after this stage's misses, per TS).
    fn map_file_matches<'a>(
        &self,
        matches: &[(&'a AgentProc, String)],
        now_ms: i64,
    ) -> (Vec<EnrichedAgent>, Vec<&'a AgentProc>, HashSet<i64>) {
        let mut agents = Vec::new();
        let mut fallback = Vec::new();
        let mut matched = HashSet::new();
        for (proc, file_path) in matches {
            match parser::read_session(file_path, proc.cwd.as_deref().unwrap_or("")) {
                Some(session) => {
                    agents.push(self.map_session(&session, proc, file_path, now_ms));
                    matched.insert(proc.pid);
                }
                None => fallback.push(*proc),
            }
        }
        (agents, fallback, matched)
    }
}

impl HarnessAdapter for PiAdapter {
    fn type_id(&self) -> &'static str {
        "pi"
    }

    fn can_handle(&self, proc: &AgentProc) -> bool {
        is_pi_executable(proc.command.as_deref().unwrap_or(""))
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

        let mut agents = Vec::new();
        let registry = shared::registry_session_paths(&self.home, "pi");

        // 1. registry cache — misses first, then parse failures (TS order).
        let mut misses: Vec<&AgentProc> = Vec::new();
        let mut cache_matches: Vec<(&AgentProc, String)> = Vec::new();
        for &proc in &procs {
            match registry.get(&proc.pid) {
                Some(file_path) if Path::new(file_path).exists() => {
                    cache_matches.push((proc, file_path.clone()));
                }
                _ => misses.push(proc),
            }
        }
        let (cache_agents, cache_parse_fail, _) = self.map_file_matches(&cache_matches, ctx.now);
        agents.extend(cache_agents);
        let mut stage_fallback: Vec<&AgentProc> = misses;
        stage_fallback.extend(cache_parse_fail);

        // 2. tracker sessions.json
        let tracker = SessionTracker {
            tracker_path: self.home.join(".pi").join("agent").join("sessions.json"),
            sessions_dir: self.sessions_dir.clone(),
        };
        let (tracker_matches, tracker_fallback) = tracker.match_processes(&stage_fallback);
        let (tracker_agents, tracker_parse_fail, _) =
            self.map_file_matches(&tracker_matches, ctx.now);
        agents.extend(tracker_agents);
        let mut stage_fallback = tracker_fallback;
        stage_fallback.extend(tracker_parse_fail);

        // 3. locator legacy matching
        let (legacy_matches, sessions, locator_fallback) =
            self.locator.match_running(&stage_fallback);
        let legacy_pairs: Vec<(&AgentProc, String)> = legacy_matches
            .iter()
            .map(|m| (m.proc, sessions[m.session_idx].file_path.clone()))
            .collect();
        let (legacy_agents, _, legacy_matched) = self.map_file_matches(&legacy_pairs, ctx.now);
        agents.extend(legacy_agents);

        // 4. process-only for locator survivors not legacy-matched
        for &proc in &locator_fallback {
            if legacy_matched.contains(&proc.pid) {
                continue;
            }
            agents.push(shared::process_only_agent(
                "pi",
                proc,
                "Pi process running",
                None,
                ctx.now,
            ));
        }
        agents
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pi_executable_tokens() {
        assert!(is_pi_executable("pi"));
        assert!(is_pi_executable("node /usr/bin/pi.js"));
        assert!(is_pi_executable("/opt/pi/bin/pi -v"));
        assert!(is_pi_executable("pi.exe"));
        assert!(!is_pi_executable("pilot"));
        assert!(!is_pi_executable("pico pi-file"));
    }

    #[test]
    fn pid_parsing() {
        assert_eq!(to_pid("42"), Some(42));
        assert_eq!(to_pid("0"), None);
        assert_eq!(to_pid("x"), None);
    }
}
