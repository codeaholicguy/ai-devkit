//! Port of `MuseSessionLocator` — runtime-file PID matching with a
//! birthtime staleness guard, the dated-archive walk, and the legacy
//! cwd+birthtime fallback.

use crate::shared::{self, SessionFile};
use devkit_core::discover::AgentProc;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Max |process start − transcript birth| before a pid match is recycled.
const PID_STALENESS_MS: i64 = 60_000;

/// A live Muse process paired with its transcript — through the runtime
/// file (authoritative) or the legacy cwd+birthtime join. Consumers map both
/// identically, so one shape serves the two strategies.
pub struct SessionMatch<'a> {
    pub process: &'a AgentProc,
    pub session_file: SessionFile,
}

/// Runtime entry: `~/.local/share/muse/runtime/muse/sessions/<id>.json`.
struct RuntimeEntry {
    session_id: String,
    pid: i64,
}

fn is_session_id(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 36 {
        return false;
    }
    for (i, c) in b.iter().enumerate() {
        let hex = c.is_ascii_hexdigit();
        let dash = *c == b'-' && (i == 8 || i == 13 || i == 18 || i == 23);
        if !hex && !dash {
            return false;
        }
    }
    true
}

fn is_safe_segment(s: &str) -> bool {
    !s.is_empty() && !s.contains('/') && !s.contains('\\') && !s.contains('\0')
}

fn parse_pid_hint(value: &serde_json::Value) -> Option<i64> {
    value
        .as_str()
        .and_then(|s| s.strip_prefix("pid="))
        .and_then(|n| n.parse::<i64>().ok())
}

fn parse_runtime_entry(path: &Path) -> Option<RuntimeEntry> {
    let content = std::fs::read_to_string(path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&content).ok()?;
    let obj = parsed.as_object()?;
    let session_id = obj.get("session_id")?.as_str()?;
    if !is_session_id(session_id) {
        return None;
    }
    let pid = parse_pid_hint(obj.get("process_generation_hint")?)?;
    Some(RuntimeEntry {
        session_id: session_id.to_string(),
        pid,
    })
}

/// Dated directories `sessions/yyyy/mm/dd`, each level pattern-guarded.
fn list_day_dirs(archive_dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for yyyy in shared::list_dir_names(archive_dir) {
        if yyyy.len() != 4 || !yyyy.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let y_dir = archive_dir.join(&yyyy);
        for mm in shared::list_dir_names(&y_dir) {
            if mm.len() != 2 || !mm.bytes().all(|b| b.is_ascii_digit()) {
                continue;
            }
            let m_dir = y_dir.join(&mm);
            for dd in shared::list_dir_names(&m_dir) {
                if dd.len() != 2 || !dd.bytes().all(|b| b.is_ascii_digit()) {
                    continue;
                }
                let d_dir = m_dir.join(&dd);
                if d_dir.is_dir() {
                    out.push(d_dir);
                }
            }
        }
    }
    out
}

/// Exact transcript lookup by session id across dated dirs.
pub fn find_transcript_by_id(archive_dir: &Path, session_id: &str) -> Option<PathBuf> {
    if !is_safe_segment(session_id) || !is_session_id(session_id) {
        return None;
    }
    list_day_dirs(archive_dir)
        .into_iter()
        .map(|day| day.join(session_id).join("session.jsonl"))
        .find(|p| p.is_file())
}

/// Head-read a transcript for its recorded workspace root (bounded, cheap).
/// Reuses the parser's frame unwrap and metadata rule — one rule, one place.
fn read_workspace_root_head(path: &Path) -> Option<String> {
    let (text, _, _, _) = shared::read_file_head(&path.to_string_lossy(), 8192)?;
    for line in text.split('\n') {
        if !line.contains("runtime.session.metadata") {
            continue;
        }
        let outer: serde_json::Value = serde_json::from_str(line).ok()?;
        for record in super::parser::unwrap_outer_owned(&outer) {
            if let Some(root) = super::parser::record_workspace_root(&record) {
                return Some(root);
            }
        }
    }
    None
}

fn transcript_session_file(path: PathBuf, resolved_cwd: String) -> Option<SessionFile> {
    let birth = shared::birthtime_ms(&path.to_string_lossy())?;
    Some(SessionFile {
        session_id: path.parent()?.file_name()?.to_string_lossy().into_owned(),
        file_path: path.to_string_lossy().into_owned(),
        project_dir: path
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        birthtime_ms: birth,
        resolved_cwd,
    })
}

/// Recent transcripts for legacy cwd+birthtime matching (last two day dirs).
fn discover_live_sessions(archive_dir: &Path, cwds: &HashSet<String>) -> Vec<SessionFile> {
    if cwds.is_empty() {
        return Vec::new();
    }
    let mut days = list_day_dirs(archive_dir);
    days.sort();
    let mut out = Vec::new();
    for day in days.iter().rev().take(2) {
        let mut names = shared::list_dir_names(day);
        names.sort();
        for name in names {
            if !is_session_id(&name) {
                continue;
            }
            let path = day.join(&name).join("session.jsonl");
            if !path.is_file() {
                continue;
            }
            let Some(root) = read_workspace_root_head(&path) else {
                continue;
            };
            if !cwds.contains(&root) {
                continue;
            }
            if let Some(file) = transcript_session_file(path, root) {
                out.push(file);
            }
        }
    }
    out
}

/// Pair live processes with transcripts: runtime-file matching first
/// (authoritative, staleness-guarded), then the legacy cwd+birthtime join.
pub fn match_running_processes<'a>(
    runtime_dir: &Path,
    archive_dir: &Path,
    processes: &[&'a AgentProc],
) -> (Vec<SessionMatch<'a>>, Vec<&'a AgentProc>) {
    let by_pid: HashMap<i64, &AgentProc> = processes.iter().map(|p| (p.pid, *p)).collect();
    let mut matched = Vec::new();
    let mut used: HashSet<i64> = HashSet::new();

    let mut runtime_files = shared::list_dir_names(runtime_dir);
    runtime_files.sort();
    for name in runtime_files {
        if !name.ends_with(".json") {
            continue;
        }
        let Some(entry) = parse_runtime_entry(&runtime_dir.join(&name)) else {
            continue;
        };
        let (Some(proc), false) = (by_pid.get(&entry.pid), used.contains(&entry.pid)) else {
            continue;
        };
        let Some(transcript) = find_transcript_by_id(archive_dir, &entry.session_id) else {
            continue;
        };
        let (Some(birth), Some(start)) = (
            shared::birthtime_ms(&transcript.to_string_lossy()),
            proc.start_time_ms,
        ) else {
            continue;
        };
        if (start - birth).abs() > PID_STALENESS_MS {
            continue;
        }
        let Some(session_file) =
            transcript_session_file(transcript, proc.cwd.clone().unwrap_or_default())
        else {
            continue;
        };
        used.insert(proc.pid);
        matched.push(SessionMatch {
            process: proc,
            session_file,
        });
    }

    let remaining: Vec<&AgentProc> = processes
        .iter()
        .filter(|p| !used.contains(&p.pid))
        .copied()
        .collect();
    let cwds: HashSet<String> = remaining
        .iter()
        .filter_map(|p| p.cwd.clone())
        .filter(|c| !c.is_empty())
        .collect();
    let legacy_sessions = discover_live_sessions(archive_dir, &cwds);
    for m in shared::match_processes_to_sessions(&remaining, &legacy_sessions) {
        if let Some(session_file) = legacy_sessions.get(m.session_idx) {
            used.insert(m.proc.pid);
            matched.push(SessionMatch {
                process: m.proc,
                session_file: session_file.clone(),
            });
        }
    }
    let fallback: Vec<&AgentProc> = remaining
        .into_iter()
        .filter(|p| !used.contains(&p.pid))
        .collect();
    (matched, fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_id_shape_validation() {
        assert!(is_session_id("11111111-1111-1111-1111-111111111111"));
        assert!(!is_session_id("not-a-uuid"));
        assert!(!is_session_id("../evil"));
        assert!(!is_session_id("11111111-1111-1111-1111-11111111111x"));
        assert!(!is_safe_segment("a/b"));
        assert!(is_safe_segment("11111111-1111-1111-1111-111111111111"));
    }

    #[test]
    fn pid_hint_parsing() {
        assert_eq!(parse_pid_hint(&serde_json::json!("pid=16174")), Some(16174));
        assert_eq!(parse_pid_hint(&serde_json::json!("nonsense")), None);
        assert_eq!(parse_pid_hint(&serde_json::Value::Null), None);
    }
}
