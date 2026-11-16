//! OMP adapter port for devkitd discovery.
//!
//! OMP writes the same JSONL message envelope as Pi, but uses `~/.omp/agent`
//! and a home-relative project bucket. The Pi parser is reused because the
//! record contract is intentionally compatible.

use crate::pi::parser;
use crate::shared::{self, generate_agent_name, process_only_agent, SessionFile};
use crate::start_profiles::MatchSpec;
use crate::{HarnessAdapter, SweepContext};
use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::{Path, PathBuf};

pub struct OmpAdapter {
    sessions_dirs: Vec<PathBuf>,
    home: PathBuf,
}

impl OmpAdapter {
    pub fn new(home: &Path) -> Self {
        Self {
            sessions_dirs: resolve_session_dirs(home),
            home: home.to_path_buf(),
        }
    }

    fn discover_sessions(&self, processes: &[&AgentProc]) -> Vec<SessionFile> {
        let mut dirs = HashMap::<String, String>::new();
        for sessions_dir in &self.sessions_dirs {
            for proc in processes {
                let (Some(cwd), Some(_start)) = (proc.cwd.as_deref(), proc.start_time_ms) else {
                    continue;
                };
                let dir = sessions_dir.join(encode_project_dir(&self.home, cwd));
                if dir.is_dir() {
                    dirs.entry(dir.to_string_lossy().into_owned())
                        .or_insert_with(|| cwd.to_string());
                }
            }
        }

        let mut sessions = Vec::new();
        for (dir, fallback_cwd) in dirs {
            for name in shared::list_dir_names(Path::new(&dir)) {
                if !name.ends_with(".jsonl") {
                    continue;
                }
                let path = Path::new(&dir).join(&name);
                let Some(birthtime_ms) = shared::birthtime_ms(&path.to_string_lossy()) else {
                    continue;
                };
                let head =
                    parser::read_session_head(&path.to_string_lossy(), parser::HEAD_MAX_BYTES);
                sessions.push(SessionFile {
                    session_id: head
                        .as_ref()
                        .and_then(|h| h.session_id.clone())
                        .unwrap_or_else(|| parser::session_id_from_file(&path.to_string_lossy())),
                    file_path: path.to_string_lossy().into_owned(),
                    project_dir: dir.clone(),
                    birthtime_ms,
                    resolved_cwd: head
                        .and_then(|h| h.project_path)
                        .unwrap_or(fallback_cwd.clone()),
                });
            }
        }
        sessions
    }
}

fn resolve_session_dirs(home: &Path) -> Vec<PathBuf> {
    if let Some(agent_dir) = env::var_os("PI_CODING_AGENT_DIR") {
        return vec![PathBuf::from(agent_dir).join("sessions")];
    }

    let config_dir = env::var_os("PI_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".omp"));
    let config_root = if config_dir.is_absolute() {
        config_dir
    } else {
        home.join(config_dir)
    };
    let mut dirs = vec![config_root.join("agent/sessions")];
    add_profile_session_dirs(
        &mut dirs,
        &config_root.join("profiles"),
        Some(["agent", "sessions"]),
    );

    if cfg!(target_os = "linux") || cfg!(target_os = "macos") {
        if let Some(data_home) = env::var_os("XDG_DATA_HOME") {
            let xdg_root = PathBuf::from(data_home).join("omp");
            dirs.push(xdg_root.join("sessions"));
            add_profile_session_dirs(&mut dirs, &xdg_root.join("profiles"), Some(["sessions"]));
        }
    }

    dirs.sort();
    dirs.dedup();
    dirs
}

fn add_profile_session_dirs<const N: usize>(
    dirs: &mut Vec<PathBuf>,
    profiles_root: &Path,
    suffix: Option<[&str; N]>,
) {
    let Ok(entries) = std::fs::read_dir(profiles_root) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let mut path = entry.path();
        if let Some(parts) = suffix {
            for part in parts {
                path.push(part);
            }
        }
        dirs.push(path);
    }
}

impl HarnessAdapter for OmpAdapter {
    fn type_id(&self) -> &'static str {
        "omp"
    }

    fn can_handle(&self, proc: &AgentProc) -> bool {
        proc.command
            .as_deref()
            .map(|command| MatchSpec::Omp.matches(command))
            .unwrap_or(false)
    }

    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        let processes: Vec<&AgentProc> = ctx
            .processes
            .iter()
            .filter(|proc| self.can_handle(proc))
            .collect();
        if processes.is_empty() {
            return Vec::new();
        }

        let sessions = self.discover_sessions(&processes);
        let matches = shared::match_processes_to_sessions(&processes, &sessions);
        let mut matched_pids = HashSet::new();
        let mut agents = Vec::new();

        for matched in matches {
            let proc = matched.proc;
            let session_file = &sessions[matched.session_idx];
            if let Some(session) =
                parser::read_session(&session_file.file_path, proc.cwd.as_deref().unwrap_or(""))
            {
                matched_pids.insert(proc.pid);
                let status = parser::determine_status(&session, ctx.now);
                let summary = if session.summary == "Pi session active" {
                    "OMP session active".to_string()
                } else {
                    session.summary
                };
                let project_path = if session.project_path.is_empty() {
                    proc.cwd.clone().unwrap_or_default()
                } else {
                    session.project_path.clone()
                };
                agents.push(EnrichedAgent {
                    name: generate_agent_name(&project_path, proc.pid),
                    agent_type: "omp".into(),
                    status: status.into(),
                    summary,
                    pid: proc.pid as u64,
                    project_path,
                    session_id: session_file.session_id.clone(),
                    last_active: shared::iso_utc(session.last_active_ms),
                    pinned: None,
                    session_file_path: Some(session_file.file_path.clone()),
                });
            }
        }

        for proc in processes {
            if !matched_pids.contains(&proc.pid) {
                agents.push(process_only_agent(
                    "omp",
                    proc,
                    "OMP process running",
                    None,
                    ctx.now,
                ));
            }
        }
        agents
    }
}

fn encode_project_dir(home: &Path, cwd: &str) -> String {
    let cwd_path = Path::new(cwd);
    if let Ok(relative) = cwd_path.strip_prefix(home) {
        if !relative.as_os_str().is_empty() {
            return format!("-{}", relative.to_string_lossy().replace(['/', '\\'], "-"));
        }
    }
    let absolute = cwd.trim_start_matches(['/', '\\']);
    format!("--{}--", absolute.replace(['/', '\\'], "-"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn omp_commands_are_precise() {
        let proc = AgentProc {
            pid: 1,
            ppid: None,
            command: Some(
                "/home/me/.bun/bin/bun /home/me/.npm/@oh-my-pi/pi-coding-agent/dist/cli.js".into(),
            ),
            cwd: None,
            session_file: None,
            tty: None,
            start_time_ms: None,
        };
        assert!(OmpAdapter::new(Path::new("/home/me")).can_handle(&proc));
        assert!(
            !OmpAdapter::new(Path::new("/home/me")).can_handle(&AgentProc {
                command: Some("bun /repo/tools/cli.js".into()),
                ..proc
            })
        );
    }

    #[test]
    fn omp_project_bucket_is_home_relative() {
        assert_eq!(
            encode_project_dir(Path::new("/home/me"), "/home/me/Documents/repo"),
            "-Documents-repo"
        );
        assert_eq!(
            encode_project_dir(Path::new("/home/me"), "/srv/app"),
            "--srv-app--"
        );
    }
}
