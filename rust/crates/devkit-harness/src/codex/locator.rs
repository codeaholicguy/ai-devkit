//! CodexSessionLocator port — resume/direct matching, uuidv7 date-dir
//! discovery, `session_meta` head parsing, legacy greedy matching, and the
//! 30s unmatched-process negative cache.

use crate::shared::{self, SessionFile};
use devkit_core::discover::AgentProc;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

const PROCESS_START_DAY_WINDOW_DAYS: i64 = 1;
/// Upper bound of bytes read from a session file to find its `session_meta`.
const SESSION_META_HEAD_MAX_BYTES: usize = 64 * 1024;
/// Unmatched processes are re-scanned at least this often.
const UNMATCHED_PROCESS_RECHECK_MS: i64 = 30_000;

pub struct DirectMatch<'a> {
    pub proc: &'a AgentProc,
    pub session_file: SessionFile,
}

pub struct Matches<'a> {
    pub direct: Vec<DirectMatch<'a>>,
    pub legacy: Vec<shared::ProcSessionMatch<'a>>,
    /// Kept for parity bookkeeping — caller uses `legacy` + `fallback`.
    pub sessions: Vec<SessionFile>,
    pub fallback: Vec<&'a AgentProc>,
}

struct UnmatchedEntry {
    checked_at_ms: i64,
    date_dir_signature: String,
}

pub struct CodexSessionLocator {
    sessions_dir: PathBuf,
    /// `(pid, startTime)` → last failed scan, keyed to date-dir mtimes.
    unmatched: std::sync::Mutex<HashMap<String, UnmatchedEntry>>,
}

impl CodexSessionLocator {
    pub fn new(home: &Path) -> Self {
        Self {
            sessions_dir: home.join(".codex").join("sessions"),
            unmatched: std::sync::Mutex::new(HashMap::new()),
        }
    }

    pub fn match_running<'a>(&self, processes: &[&'a AgentProc], now_ms: i64) -> Matches<'a> {
        let mut direct = Vec::new();
        let mut fallback: Vec<&AgentProc> = Vec::new();

        for &proc in processes {
            match extract_resume_session_id(proc.command.as_deref().unwrap_or("")) {
                Some(id) => match self.find_session_file_by_id(&id) {
                    Some(sf) => direct.push(DirectMatch {
                        proc,
                        session_file: sf,
                    }),
                    None => fallback.push(proc),
                },
                None => fallback.push(proc),
            }
        }

        let signatures: HashMap<i64, String> = fallback
            .iter()
            .map(|p| (p.pid, self.date_dir_signature(p, now_ms)))
            .collect();
        let mut unmatched = self.unmatched.lock().unwrap();
        let candidates: Vec<&AgentProc> = fallback
            .iter()
            .copied()
            .filter(|p| {
                let key = process_key(p, now_ms);
                !matches!(unmatched.get(&key), Some(e)
                    if now_ms - e.checked_at_ms < UNMATCHED_PROCESS_RECHECK_MS
                        && e.date_dir_signature
                            == *signatures.get(&p.pid).unwrap_or(&String::new()))
            })
            .collect();

        let sessions = self.discover_live_sessions(&candidates, now_ms);
        let legacy = if !candidates.is_empty() && !sessions.is_empty() {
            shared::match_processes_to_sessions(&candidates, &sessions)
        } else {
            Vec::new()
        };

        // updateUnmatchedProcesses
        let live_keys: HashSet<String> = fallback
            .iter()
            .map(|p| process_key(p, now_ms))
            .collect();
        unmatched.retain(|k, _| live_keys.contains(k));
        let matched_pids: HashSet<i64> = legacy.iter().map(|m| m.proc.pid).collect();
        for &p in &candidates {
            let key = process_key(p, now_ms);
            if matched_pids.contains(&p.pid) {
                unmatched.remove(&key);
            } else {
                unmatched.insert(
                    key,
                    UnmatchedEntry {
                        checked_at_ms: now_ms,
                        date_dir_signature: signatures.get(&p.pid).cloned().unwrap_or_default(),
                    },
                );
            }
        }
        drop(unmatched);

        Matches {
            direct,
            legacy,
            sessions,
            fallback,
        }
    }

    /// `findSessionFileById` — candidate files narrowed by the uuidv7 date
    /// window when the id parses as v7, else all session files.
    pub fn find_session_file_by_id(&self, session_id: &str) -> Option<SessionFile> {
        for file_path in self.candidate_session_files(session_id) {
            let Some(name) = file_path.file_name().map(|n| n.to_string_lossy()) else {
                continue;
            };
            if !name.contains(session_id) {
                continue;
            }
            let Some(meta) = self.read_session_meta(&file_path) else {
                continue;
            };
            if meta.id.as_deref() != Some(session_id) {
                continue;
            }
            let stat_ms = shared::birthtime_ms(&file_path.to_string_lossy());
            return Some(SessionFile {
                session_id: session_id.to_string(),
                file_path: file_path.to_string_lossy().into_owned(),
                project_dir: file_path
                    .parent()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                birthtime_ms: meta.timestamp_ms.or(stat_ms).unwrap_or(0),
                resolved_cwd: meta.cwd,
            });
        }
        None
    }

    fn candidate_session_files(&self, session_id: &str) -> Vec<PathBuf> {
        match parse_uuid_v7_ms(session_id) {
            Some(ms) => {
                let mut dirs = Vec::new();
                for offset in -PROCESS_START_DAY_WINDOW_DAYS..=PROCESS_START_DAY_WINDOW_DAYS {
                    let key = shared::local_day_key(ms + offset * 86_400_000);
                    let dir = self.sessions_dir.join(&key);
                    if dir.is_dir() {
                        dirs.push(dir);
                    }
                }
                self.collect_jsonl_in_dirs(&dirs)
            }
            None => self.collect_all_session_files(),
        }
    }

    /// `discoverLiveSessions` — day-window dirs for each candidate process,
    /// session files stat'ed, `session_meta` overlaid onto cwd+birthtime.
    fn discover_live_sessions(&self, processes: &[&AgentProc], now_ms: i64) -> Vec<SessionFile> {
        if processes.is_empty() || !self.sessions_dir.is_dir() {
            return Vec::new();
        }
        let mut day_keys: HashSet<String> = HashSet::new();
        for p in processes {
            let start = p.start_time_ms.unwrap_or(now_ms);
            for offset in -PROCESS_START_DAY_WINDOW_DAYS..=PROCESS_START_DAY_WINDOW_DAYS {
                day_keys.insert(shared::local_day_key(start + offset * 86_400_000));
            }
        }
        let dirs: Vec<PathBuf> = day_keys
            .iter()
            .map(|k| self.sessions_dir.join(k))
            .filter(|d| d.is_dir())
            .collect();

        let mut files = batch_birthtimes(&dirs);
        for f in &mut files {
            if let Some(meta) = self.read_session_meta(Path::new(&f.file_path)) {
                f.resolved_cwd = meta.cwd;
                if let Some(ts) = meta.timestamp_ms {
                    f.birthtime_ms = ts;
                }
            }
        }
        files
    }

    /// First line of a session file parsed as `session_meta`, with the
    /// truncated-head regex fallback (`parseTruncatedSessionMeta`).
    fn read_session_meta(&self, path: &Path) -> Option<SessionMetaHead> {
        let (text, _bytes, _complete, truncated) =
            shared::read_file_head(&path.to_string_lossy(), SESSION_META_HEAD_MAX_BYTES)?;
        let line = text.trim().to_string();
        if line.is_empty() {
            return None;
        }
        match serde_json::from_str::<Value>(&line) {
            Ok(v) => {
                if v.get("type").and_then(Value::as_str) != Some("session_meta") {
                    return None;
                }
                let p = v.get("payload")?;
                Some(SessionMetaHead {
                    id: p.get("id").and_then(Value::as_str).map(str::to_string),
                    cwd: p
                        .get("cwd")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    timestamp_ms: p
                        .get("timestamp")
                        .and_then(shared::parse_timestamp_ms),
                })
            }
            Err(_) if truncated => parse_truncated_session_meta(&line),
            Err(_) => None,
        }
    }

    /// Day-window dirs' mtimes — the signature that invalidates the negative
    /// cache when session files appear/disappear.
    fn date_dir_signature(&self, proc: &AgentProc, now_ms: i64) -> String {
        let start = proc.start_time_ms.unwrap_or(now_ms);
        (-PROCESS_START_DAY_WINDOW_DAYS..=PROCESS_START_DAY_WINDOW_DAYS)
            .map(|offset| {
                let key = shared::local_day_key(start + offset * 86_400_000);
                let dir = self.sessions_dir.join(&key);
                let mtime = std::fs::metadata(&dir)
                    .ok()
                    .filter(|m| m.is_dir())
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .map(|ms| ms.to_string())
                    .unwrap_or_else(|| "-".into());
                format!("{key}={mtime}")
            })
            .collect::<Vec<_>>()
            .join("|")
    }

    fn collect_jsonl_in_dirs(&self, dirs: &[PathBuf]) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for dir in dirs {
            for name in shared::list_dir_names(dir) {
                if name.ends_with(".jsonl") {
                    out.push(dir.join(&name));
                }
            }
        }
        out
    }

    fn collect_all_session_files(&self) -> Vec<PathBuf> {
        let mut out = Vec::new();
        let mut stack = vec![self.sessions_dir.clone()];
        while let Some(dir) = stack.pop() {
            for name in shared::list_dir_names(&dir) {
                let p = dir.join(&name);
                if p.is_dir() {
                    stack.push(p);
                } else if p.to_string_lossy().ends_with(".jsonl") {
                    out.push(p);
                }
            }
        }
        out
    }
}

struct SessionMetaHead {
    id: Option<String>,
    cwd: String,
    timestamp_ms: Option<i64>,
}

/// `batchGetSessionFileBirthtimes` — enumerate `.jsonl` files, stat birthtime,
/// sessionId = filename minus extension.
fn batch_birthtimes(dirs: &[PathBuf]) -> Vec<SessionFile> {
    let mut out = Vec::new();
    for dir in dirs {
        for name in shared::list_dir_names(dir) {
            if !name.ends_with(".jsonl") {
                continue;
            }
            let file_path = dir.join(&name).to_string_lossy().into_owned();
            let Some(bt) = shared::birthtime_ms(&file_path) else {
                continue;
            };
            out.push(SessionFile {
                session_id: name.trim_end_matches(".jsonl").to_string(),
                file_path,
                project_dir: dir.to_string_lossy().into_owned(),
                birthtime_ms: bt,
                resolved_cwd: String::new(),
            });
        }
    }
    out
}

fn process_key(proc: &AgentProc, now_ms: i64) -> String {
    format!("{}:{}", proc.pid, proc.start_time_ms.unwrap_or(now_ms))
}

/// `(?:^|\s)resume\s+([0-9a-f-]{36})(?:\s|$)` — case-insensitive.
fn extract_resume_session_id(command: &str) -> Option<String> {
    let bytes = command.as_bytes();
    let mut i = 0usize;
    while i + 6 <= bytes.len() {
        if i + 6 <= bytes.len()
            && command[i..i + 6].eq_ignore_ascii_case("resume")
            && (i == 0 || bytes[i - 1].is_ascii_whitespace())
            && i + 6 < bytes.len()
            && bytes[i + 6].is_ascii_whitespace()
        {
            let mut j = i + 6;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            let start = j;
            while j < bytes.len()
                && (bytes[j].is_ascii_hexdigit() || bytes[j] == b'-')
                && j - start < 36
            {
                j += 1;
            }
            if j - start == 36 && (j == bytes.len() || bytes[j].is_ascii_whitespace()) {
                return Some(command[start..j].to_string());
            }
        }
        i += 1;
    }
    None
}

/// uuidv7 → embedded epoch ms (first 48 bits), or None.
pub fn parse_uuid_v7_ms(session_id: &str) -> Option<i64> {
    let b = session_id.as_bytes();
    if b.len() != 36 || b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
        return None;
    }
    if b[14] != b'7' {
        return None;
    }
    let hex: String = session_id[..8].chars().chain(session_id[9..13].chars()).collect();
    let ms = i64::from_str_radix(&hex, 16).ok()?;
    if ms <= 0 {
        return None;
    }
    Some(ms)
}

/// `parseTruncatedSessionMeta` — id/cwd/timestamp precede the bulky payload
/// fields, so they are pulled from the payload prefix of an over-long line.
fn parse_truncated_session_meta(line: &str) -> Option<SessionMetaHead> {
    if !line.contains("\"type\":\"session_meta\"")
        && !line.contains("\"type\": \"session_meta\"")
    {
        return None;
    }
    let payload_start = find_payload_start(line)?;
    let payload = &line[payload_start..];
    Some(SessionMetaHead {
        id: extract_json_string_field(payload, "id"),
        cwd: extract_json_string_field(payload, "cwd").unwrap_or_default(),
        timestamp_ms: extract_json_string_field(payload, "timestamp")
            .and_then(|s| shared::parse_timestamp_ms(&Value::String(s))),
    })
}

fn find_payload_start(line: &str) -> Option<usize> {
    let needle = "\"payload\"";
    let mut idx = line.find(needle)? + needle.len();
    let bytes = line.as_bytes();
    while idx < bytes.len() && bytes[idx].is_ascii_whitespace() {
        idx += 1;
    }
    if idx < bytes.len() && bytes[idx] == b':' {
        idx += 1;
    }
    while idx < bytes.len() && bytes[idx].is_ascii_whitespace() {
        idx += 1;
    }
    if idx < bytes.len() && bytes[idx] == b'{' {
        Some(idx)
    } else {
        None
    }
}

/// `extractJsonStringField` — first `"field": "<json string>"` in a fragment.
pub fn extract_json_string_field(fragment: &str, field: &str) -> Option<String> {
    let needle = format!("\"{field}\"");
    let mut idx = fragment.find(&needle)? + needle.len();
    let bytes = fragment.as_bytes();
    while idx < bytes.len() && bytes[idx].is_ascii_whitespace() {
        idx += 1;
    }
    if idx >= bytes.len() || bytes[idx] != b':' {
        return None;
    }
    idx += 1;
    while idx < bytes.len() && bytes[idx].is_ascii_whitespace() {
        idx += 1;
    }
    if idx >= bytes.len() || bytes[idx] != b'"' {
        return None;
    }
    // Find the closing quote honoring backslash escapes, then JSON-parse.
    let mut end = idx + 1;
    while end < bytes.len() {
        match bytes[end] {
            b'\\' => end += 2,
            b'"' => break,
            _ => end += 1,
        }
    }
    if end >= bytes.len() {
        return None;
    }
    serde_json::from_str::<Value>(&fragment[idx..=end])
        .ok()?
        .as_str()
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_id_extracted() {
        assert_eq!(
            extract_resume_session_id("codex resume 0199abcd-1234-7bcd-8def-0123456789ab"),
            Some("0199abcd-1234-7bcd-8def-0123456789ab".into())
        );
        assert_eq!(extract_resume_session_id("codex"), None);
        assert_eq!(extract_resume_session_id("codex resumed abc"), None);
    }

    #[test]
    fn uuid_v7_parses_date() {
        // 0x0199ab12 = 2025-10-08-ish
        let ms = parse_uuid_v7_ms("0199ab12-3456-7bcd-8def-0123456789ab").unwrap();
        assert_eq!(ms, 0x0199ab123456);
        assert_eq!(parse_uuid_v7_ms("0199ab12-3456-6bcd-8def-0123456789ab"), None);
        assert_eq!(parse_uuid_v7_ms("not-a-uuid"), None);
    }

    #[test]
    fn truncated_meta_extracts_prefix_fields() {
        let line = r#"{"timestamp":"x","type":"session_meta","payload":{"id":"abc","timestamp":"2026-10-08T10:00:00Z","cwd":"/p","instructions":"#;
        let meta = parse_truncated_session_meta(line).unwrap();
        assert_eq!(meta.id.as_deref(), Some("abc"));
        assert_eq!(meta.cwd, "/p");
    }

    #[test]
    fn json_string_field_unescapes() {
        assert_eq!(
            extract_json_string_field(r#"{"id":"a\"b"}"#, "id"),
            Some("a\"b".into())
        );
        assert_eq!(extract_json_string_field(r#"{"id":5}"#, "id"), None);
    }
}
