//! Port of `ClaudeSessionLocator` — the three-stage process→session match:
//! `--resume`, `~/.claude/sessions/<pid>.json`, legacy cwd+birthtime.

use crate::shared::{match_processes_to_sessions, SessionFile};
use devkit_core::discover::AgentProc;
use std::path::{Path, PathBuf};

/// `PID_FILE_STALENESS_MS` — |procStart − pidfile.startedAt| beyond which the
/// pid file belongs to a recycled PID.
const PID_FILE_STALENESS_MS: i64 = 60_000;

#[derive(Debug)]
struct PidFileEntry {
    session_id: String,
    cwd: String,
    started_at: f64,
    status: Option<String>,
    waiting_for: Option<String>,
}

pub struct DirectMatch<'a> {
    pub proc: &'a AgentProc,
    pub session_file: SessionFile,
    pub pid_status: Option<&'static str>,
    pub waiting_for: Option<String>,
}

pub struct Matches<'a> {
    pub direct: Vec<DirectMatch<'a>>,
    /// (proc, SessionFile) pairs in TS `MatchResult` order (delta asc).
    pub legacy: Vec<(&'a AgentProc, SessionFile)>,
}

/// `getProjectDir` — every non-alphanumeric char becomes '-'.
fn encoded_project_dir(projects_dir: &Path, cwd: &str) -> PathBuf {
    let encoded: String = cwd
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    projects_dir.join(encoded)
}

fn stat_birthtime_ms(path: &Path) -> Option<i64> {
    let meta = std::fs::metadata(path).ok()?;
    let bt = meta.created().ok()?;
    let ms = bt.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64;
    Some(ms)
}

pub struct ClaudeLocator<'a> {
    projects_dir: &'a Path,
    sessions_dir: &'a Path,
}

impl<'a> ClaudeLocator<'a> {
    pub fn new(projects_dir: &'a Path, sessions_dir: &'a Path) -> Self {
        Self {
            projects_dir,
            sessions_dir,
        }
    }

    /// `matchRunningProcesses` — resume → pid-file → legacy, in that order.
    pub fn match_running_processes<'p>(&self, processes: &[&'p AgentProc]) -> Matches<'p> {
        let (resume_direct, no_resume) = self.try_resume_matching(processes);
        let (pid_direct, fallback) = self.try_pid_file_matching(no_resume);
        let legacy_sessions = self.discover_live_sessions(&fallback);
        let legacy: Vec<(&'p AgentProc, SessionFile)> =
            if !fallback.is_empty() && !legacy_sessions.is_empty() {
                match_processes_to_sessions(&fallback, &legacy_sessions)
                    .into_iter()
                    .map(|m| (m.proc, legacy_sessions[m.session_idx].clone()))
                    .collect()
            } else {
                Vec::new()
            };
        Matches {
            direct: resume_direct.into_iter().chain(pid_direct).collect(),
            legacy,
        }
    }

    /// `discoverLiveSessions` — for each unique proc.cwd whose encoded
    /// projects dir exists, enumerate `.jsonl` files with birthtimes.
    fn discover_live_sessions(&self, processes: &[&AgentProc]) -> Vec<SessionFile> {
        let mut dir_to_cwd: Vec<(PathBuf, String)> = Vec::new();
        for proc in processes {
            let Some(cwd) = proc.cwd.as_deref() else {
                continue;
            };
            if cwd.is_empty() {
                continue;
            }
            let dir = encoded_project_dir(self.projects_dir, cwd);
            if dir_to_cwd.iter().any(|(d, _)| *d == dir) {
                continue;
            }
            if dir.is_dir() {
                dir_to_cwd.push((dir, cwd.to_string()));
            }
        }

        let mut out = Vec::new();
        for (dir, cwd) in dir_to_cwd {
            for name in crate::shared::list_dir_names(&dir) {
                if !name.ends_with(".jsonl") {
                    continue;
                }
                let file_path = dir.join(&name);
                let Some(birthtime_ms) = stat_birthtime_ms(&file_path) else {
                    continue;
                };
                if birthtime_ms <= 0 {
                    continue;
                }
                out.push(SessionFile {
                    session_id: name.trim_end_matches(".jsonl").to_string(),
                    file_path: file_path.to_string_lossy().into_owned(),
                    project_dir: dir.to_string_lossy().into_owned(),
                    birthtime_ms,
                    resolved_cwd: cwd.clone(),
                });
            }
        }
        out
    }

    /// `extractResumeSessionId` — `--resume\s+([0-9a-f-]{36})` case-insensitive.
    fn extract_resume_session_id(command: &str) -> Option<String> {
        let lower = command.to_lowercase();
        let idx = lower.find("--resume")?;
        let after = &command[idx + 8..];
        let trimmed = after.trim_start();
        if trimmed.len() == after.len() {
            return None; // \s+ required at least one whitespace
        }
        let run: String = trimmed
            .chars()
            .take_while(|c| c.is_ascii_hexdigit() || *c == '-')
            .collect();
        if run.len() < 36 {
            return None;
        }
        Some(run[..36].to_string())
    }

    /// `readMatchingPidFile` — `<sessionsDir>/<pid>.json` or null on any
    /// failure/staleness.
    fn read_matching_pid_file(&self, pid: i64, proc_start_ms: Option<i64>) -> Option<PidFileEntry> {
        let path = self.sessions_dir.join(format!("{pid}.json"));
        let text = std::fs::read_to_string(path).ok()?;
        let v: serde_json::Value = serde_json::from_str(&text).ok()?;
        let entry = PidFileEntry {
            session_id: v.get("sessionId")?.as_str()?.to_string(),
            cwd: v.get("cwd")?.as_str()?.to_string(),
            started_at: v.get("startedAt")?.as_f64()?,
            status: v.get("status").and_then(|s| s.as_str()).map(String::from),
            waiting_for: v
                .get("waitingFor")
                .and_then(|s| s.as_str())
                .map(String::from),
        };
        if let Some(start) = proc_start_ms {
            if (start as f64 - entry.started_at).abs() > PID_FILE_STALENESS_MS as f64 {
                return None;
            }
        }
        Some(entry)
    }

    fn map_pid_status(status: Option<&str>) -> Option<&'static str> {
        match status {
            Some("running") => Some("running"),
            Some("waiting") => Some("waiting"),
            Some("idle") => Some("idle"),
            _ => None,
        }
    }

    /// `tryResumeMatching` — `claude --resume <uuid>` command matches.
    fn try_resume_matching<'p>(
        &self,
        processes: &[&'p AgentProc],
    ) -> (Vec<DirectMatch<'p>>, Vec<&'p AgentProc>) {
        let mut direct = Vec::new();
        let mut fallback = Vec::new();

        for &proc in processes {
            let session_id = proc
                .command
                .as_deref()
                .and_then(Self::extract_resume_session_id);
            let (Some(session_id), Some(cwd)) = (session_id, proc.cwd.as_deref()) else {
                fallback.push(proc);
                continue;
            };
            let project_dir = encoded_project_dir(self.projects_dir, cwd);
            let jsonl_path = project_dir.join(format!("{session_id}.jsonl"));
            let Some(birthtime_ms) = stat_birthtime_ms(&jsonl_path) else {
                fallback.push(proc);
                continue;
            };
            let pid_entry = self.read_matching_pid_file(proc.pid, proc.start_time_ms);
            direct.push(DirectMatch {
                proc,
                session_file: SessionFile {
                    session_id,
                    file_path: jsonl_path.to_string_lossy().into_owned(),
                    project_dir: project_dir.to_string_lossy().into_owned(),
                    birthtime_ms,
                    resolved_cwd: cwd.to_string(),
                },
                pid_status: Self::map_pid_status(
                    pid_entry.as_ref().and_then(|e| e.status.as_deref()),
                ),
                waiting_for: pid_entry.and_then(|e| e.waiting_for),
            });
        }
        (direct, fallback)
    }

    /// `tryPidFileMatching` — authoritative `<sessions>/<pid>.json` matches.
    fn try_pid_file_matching<'p>(
        &self,
        processes: Vec<&'p AgentProc>,
    ) -> (Vec<DirectMatch<'p>>, Vec<&'p AgentProc>) {
        let mut direct = Vec::new();
        let mut fallback = Vec::new();

        for proc in processes {
            let Some(entry) = self.read_matching_pid_file(proc.pid, proc.start_time_ms) else {
                fallback.push(proc);
                continue;
            };
            let project_dir = encoded_project_dir(self.projects_dir, &entry.cwd);
            let jsonl_path = project_dir.join(format!("{}.jsonl", entry.session_id));
            if !jsonl_path.exists() {
                fallback.push(proc);
                continue;
            }
            direct.push(DirectMatch {
                proc,
                session_file: SessionFile {
                    session_id: entry.session_id,
                    file_path: jsonl_path.to_string_lossy().into_owned(),
                    project_dir: project_dir.to_string_lossy().into_owned(),
                    birthtime_ms: entry.started_at as i64,
                    resolved_cwd: entry.cwd,
                },
                pid_status: Self::map_pid_status(entry.status.as_deref()),
                waiting_for: entry.waiting_for,
            });
        }
        (direct, fallback)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_session_id_extraction() {
        let id = "abcdef12-3456-7890-abcd-ef1234567890";
        assert_eq!(
            ClaudeLocator::extract_resume_session_id(&format!("claude --resume {id}")),
            Some(id.into())
        );
        assert_eq!(
            ClaudeLocator::extract_resume_session_id(&format!("/usr/bin/claude --resume {id} --x")),
            Some(id.into())
        );
        // Exactly-36 run: longer runs still capture the first 36 (regex parity).
        assert_eq!(
            ClaudeLocator::extract_resume_session_id(&format!("claude --resume {id}aa")),
            Some(id.into())
        );
        assert_eq!(
            ClaudeLocator::extract_resume_session_id("claude --resume short"),
            None
        );
        assert_eq!(
            ClaudeLocator::extract_resume_session_id("claude --resume"),
            None
        );
        assert_eq!(ClaudeLocator::extract_resume_session_id("claude"), None);
    }

    #[test]
    fn encoding_replaces_non_alnum() {
        assert_eq!(
            encoded_project_dir(Path::new("/p"), "/Users/foo/my_proj"),
            PathBuf::from("/p/-Users-foo-my-proj")
        );
    }
}
