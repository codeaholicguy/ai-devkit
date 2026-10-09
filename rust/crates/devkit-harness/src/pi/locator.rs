//! PiSessionLocator port — project-dir grouping by encoded cwd, filename
//! timestamp window, bounded head reads, legacy greedy matching.
//! TS keeps cross-call head/noMatchDir caches for cost; detect output is
//! identical without them so the port scans fresh each sweep.

use crate::shared::{self, SessionFile};
use devkit_core::discover::AgentProc;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::parser;

/// `--<cwd with / → ->--`, e.g. `/Users/x/proj` → `--Users-x-proj--`.
fn encode_project_dir(cwd: &str) -> String {
    // path.resolve(cwd) — strip the leading '/', join '-' on separators.
    let normalized = cwd.trim_end_matches('/');
    let stripped = normalized.strip_prefix('/').unwrap_or(normalized);
    format!("--{}--", stripped.replace('/', "-"))
}

/// `YYYY-MM-DDTHH-MM-SS-mmmZ_` prefix → epoch ms (UTC).
fn file_name_timestamp_ms(file_name: &str) -> Option<i64> {
    let b = file_name.as_bytes();
    // ^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_
    if b.len() < 25 {
        return None;
    }
    let iso = format!(
        "{}T{}:{}:{}.{}Z",
        &file_name[0..10],
        &file_name[11..13],
        &file_name[14..16],
        &file_name[17..19],
        &file_name[20..23]
    );
    // Guard the literal separators the regex anchors.
    if &file_name[4..5] != "-"
        || &file_name[7..8] != "-"
        || &file_name[10..11] != "T"
        || &file_name[13..14] != "-"
        || &file_name[16..17] != "-"
        || &file_name[19..20] != "-"
        || &file_name[23..24] != "Z"
        || &file_name[24..25] != "_"
    {
        return None;
    }
    if !file_name[0..10]
        .chars()
        .chain(file_name[11..23].chars())
        .all(|c| c.is_ascii_digit() || c == '-')
    {
        return None;
    }
    shared::parse_iso_ms(&iso)
}

pub struct PiSessionLocator {
    sessions_dir: PathBuf,
}

impl PiSessionLocator {
    pub fn new(home: &Path) -> Self {
        Self {
            sessions_dir: home.join(".pi").join("agent").join("sessions"),
        }
    }

    /// `matchRunningProcesses` — legacy matches + sessions + the survivor
    /// fallback (every process, since locator matches don't consume it).
    pub fn match_running<'a>(
        &self,
        processes: &[&'a AgentProc],
    ) -> (
        Vec<shared::ProcSessionMatch<'a>>,
        Vec<SessionFile>,
        Vec<&'a AgentProc>,
    ) {
        if processes.is_empty() {
            return (Vec::new(), Vec::new(), Vec::new());
        }
        let sessions = self.discover_sessions(processes);
        if sessions.is_empty() {
            return (Vec::new(), sessions, processes.to_vec());
        }
        (
            shared::match_processes_to_sessions(processes, &sessions),
            sessions,
            processes.to_vec(),
        )
    }

    /// `discoverSessionsInDirs` — per-project-dir scan: files in window of a
    /// process start (birthtime OR filename timestamp), head-read for id+cwd.
    fn discover_sessions(&self, processes: &[&AgentProc]) -> Vec<SessionFile> {
        if !self.sessions_dir.is_dir() {
            return Vec::new();
        }
        // Group processes by their project dir, preserving first-seen order.
        let mut scans: HashMap<String, Vec<&AgentProc>> = HashMap::new();
        let mut order: Vec<String> = Vec::new();
        for &proc in processes {
            let (Some(cwd), Some(_)) = (proc.cwd.as_deref(), proc.start_time_ms) else {
                continue;
            };
            let dir = self.sessions_dir.join(encode_project_dir(cwd));
            let key = dir.to_string_lossy().into_owned();
            if !dir.is_dir() {
                continue;
            }
            if !scans.contains_key(&key) {
                order.push(key.clone());
            }
            scans.entry(key).or_default().push(proc);
        }

        let mut sessions = Vec::new();
        for dir_key in order {
            let procs = &scans[&dir_key];
            let cwd = procs[0].cwd.as_deref().unwrap_or_default();
            let starts: Vec<i64> = procs.iter().filter_map(|p| p.start_time_ms).collect();
            for name in crate::shared::list_dir_names(std::path::Path::new(&dir_key)) {
                if !name.ends_with(".jsonl") {
                    continue;
                }
                let path = std::path::Path::new(&dir_key).join(&name);
                let file_path = path.to_string_lossy().into_owned();
                let Ok(meta) = path.metadata() else {
                    continue;
                };
                if !meta.is_file() {
                    continue;
                }
                let to_ms = |r: std::io::Result<std::time::SystemTime>| {
                    r.ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0)
                };
                let birthtime_ms = {
                    let b = to_ms(meta.created());
                    if b != 0 {
                        b
                    } else {
                        to_ms(meta.modified())
                    }
                };
                let created_ms = file_name_timestamp_ms(&name);
                let in_window = starts.iter().any(|s| {
                    (s - birthtime_ms).abs() <= shared::MATCH_TOLERANCE_MS
                        || created_ms.is_some_and(|c| {
                            (s - c).abs() <= shared::MATCH_TOLERANCE_MS
                        })
                });
                if !in_window {
                    continue;
                }
                let head = parser::read_session_head(&file_path, parser::HEAD_MAX_BYTES);
                sessions.push(SessionFile {
                    session_id: head
                        .as_ref()
                        .and_then(|h| h.session_id.clone())
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| parser::session_id_from_file(&file_path)),
                    file_path,
                    project_dir: dir_key.clone(),
                    birthtime_ms,
                    resolved_cwd: head
                        .and_then(|h| h.project_path)
                        .unwrap_or_else(|| cwd.to_string()),
                });
            }
        }
        sessions
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_project_dir() {
        assert_eq!(encode_project_dir("/Users/x/proj"), "--Users-x-proj--");
        assert_eq!(encode_project_dir("/a"), "--a--");
    }

    #[test]
    fn parses_filename_timestamp() {
        let ms = file_name_timestamp_ms("2026-06-10T08-58-20-754Z_abc.jsonl").unwrap();
        assert_eq!(ms, 1781081900754);
        assert_eq!(file_name_timestamp_ms("plain.jsonl"), None);
        assert_eq!(file_name_timestamp_ms("2026-06-10T08-58-20-754_abc.jsonl"), None);
    }
}
