//! PiSessionParser port — bounded head/tail JSONL summary of a pi session
//! file plus status derivation. Conversation APIs stay TS-side.

use crate::shared;
use serde_json::Value;

/// First-complete-lines metadata read (`readSessionHead`, 64KiB cap).
pub const HEAD_MAX_BYTES: usize = 64 * 1024;
const HEAD_CHUNK_BYTES: usize = 4 * 1024;

/// Folded session state — mirrors `PiSummaryState`.
#[derive(Default)]
pub struct SummaryState {
    pub entry_count: usize,
    /// True once a bounded cold start skipped the middle: later lines are
    /// not the session's first, so first-* fields stop accepting values.
    pub past_head: bool,
    pub session_id: Option<String>,
    pub project_path: Option<String>,
    pub first_timestamp_ms: Option<i64>,
    pub last_timestamp_ms: Option<i64>,
    pub last_user_message: Option<String>,
    pub last_role: Option<String>,
}

/// Built `PiSession` — timestamps as epoch ms for mapper use.
pub struct Session {
    pub session_id: String,
    pub project_path: String,
    pub summary: String,
    pub last_active_ms: i64,
    pub last_role: Option<String>,
}

fn as_record(v: &Value) -> Option<&serde_json::Map<String, Value>> {
    v.as_object()
}

fn first_string(values: &[Option<&Value>]) -> Option<String> {
    values
        .iter()
        .flatten()
        .filter_map(|v| v.as_str())
        .find(|s| !s.is_empty())
        .map(str::to_string)
}

fn nested<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    as_record(v).and_then(|o| o.get(key))
}

fn message_record(entry: &Value) -> Option<&Value> {
    entry.get("message").filter(|v| v.is_object())
}

/// `roleLikeType` — `type` only counts when it is itself a role keyword.
fn is_role_like(s: &str) -> bool {
    matches!(
        s.to_lowercase().as_str(),
        "user" | "human" | "assistant" | "ai" | "pi" | "system"
    )
}

/// `entryRole` — entry.type joins the chain only when it is role-like;
/// a non-role type must not shadow payload/data roles.
fn entry_role(entry: &Value) -> Option<&'static str> {
    let message = message_record(entry);
    let payload = entry.get("payload");
    let data = entry.get("data");
    let mut candidates = vec![
        entry.get("role"),
        message.and_then(|m| m.get("role")),
    ];
    if let Some(t) = entry.get("type") {
        if t.as_str().is_some_and(is_role_like) {
            candidates.push(Some(t));
        }
    }
    candidates.extend([
        payload.and_then(|p| p.get("role")),
        payload.and_then(|p| p.get("type")),
        data.and_then(|d| d.get("role")),
        data.and_then(|d| d.get("type")),
    ]);
    let raw = first_string(&candidates)?;
    match raw.to_lowercase().as_str() {
        "user" | "human" => Some("user"),
        "assistant" | "ai" | "pi" => Some("assistant"),
        "system" => Some("system"),
        _ => None,
    }
}

/// `contentToString` — string | array of parts | {content|text|value}.
fn content_to_string(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|i| content_to_string(Some(i)))
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(""),
        Some(Value::Object(o)) => content_to_string(
            o.get("content").or_else(|| o.get("text")).or_else(|| o.get("value")),
        ),
        _ => String::new(),
    }
}

/// `entryContent`
fn entry_content(entry: &Value) -> String {
    let message = message_record(entry);
    let payload = entry.get("payload");
    let data = entry.get("data");
    for c in [
        entry.get("content"),
        entry.get("text"),
        message.and_then(|m| m.get("content")),
        message.and_then(|m| m.get("text")),
        message.and_then(|m| m.get("message")),
        entry.get("message"),
        payload.and_then(|p| p.get("content")),
        payload.and_then(|p| p.get("text")),
        payload.and_then(|p| p.get("message")),
        data.and_then(|d| d.get("content")),
        data.and_then(|d| d.get("text")),
        data.and_then(|d| d.get("message")),
    ] {
        let text = content_to_string(c);
        if !text.is_empty() {
            return text;
        }
    }
    String::new()
}

/// `entryTimestamp`
fn entry_timestamp(entry: &Value) -> Option<String> {
    first_string(&[
        entry.get("timestamp"),
        nested(entry, "payload").and_then(|p| p.get("timestamp")),
        nested(entry, "data").and_then(|d| d.get("timestamp")),
        entry.get("createdAt"),
        entry.get("created_at"),
    ])
}

/// `entrySessionId`
fn entry_session_id(entry: &Value) -> Option<String> {
    let payload = entry.get("payload");
    let data = entry.get("data");
    first_string(&[
        entry.get("sessionId"),
        entry.get("session_id"),
        entry.get("id"),
        payload.and_then(|p| p.get("sessionId")),
        payload.and_then(|p| p.get("session_id")),
        payload.and_then(|p| p.get("id")),
        data.and_then(|d| d.get("sessionId")),
        data.and_then(|d| d.get("session_id")),
        data.and_then(|d| d.get("id")),
    ])
}

/// `entryCwd`
fn entry_cwd(entry: &Value) -> Option<String> {
    let payload = entry.get("payload");
    let data = entry.get("data");
    first_string(&[
        entry.get("cwd"),
        entry.get("projectPath"),
        entry.get("project_path"),
        payload.and_then(|p| p.get("cwd")),
        payload.and_then(|p| p.get("projectPath")),
        payload.and_then(|p| p.get("project_path")),
        data.and_then(|d| d.get("cwd")),
        data.and_then(|d| d.get("projectPath")),
        data.and_then(|d| d.get("project_path")),
    ])
}

/// `entryToMessage(entry, includeSystem=true)` → (role, trimmed content).
fn entry_to_message(entry: &Value) -> Option<(String, String)> {
    let role = entry_role(entry)?;
    let content = entry_content(entry).trim().to_string();
    if content.is_empty() {
        return None;
    }
    Some((role.to_string(), content))
}

fn reduce(state: SummaryState, value: Option<&Value>) -> SummaryState {
    let Some(entry) = value.filter(|v| v.is_object()) else {
        return state;
    };
    let in_head = !state.past_head;
    let mut next = SummaryState {
        entry_count: state.entry_count + 1,
        ..state
    };
    if in_head {
        if next.session_id.is_none() {
            next.session_id = entry_session_id(entry);
        }
        if next.project_path.is_none() {
            next.project_path = entry_cwd(entry);
        }
    }
    if let Some(ts) = entry_timestamp(entry)
        .map(Value::String)
        .as_ref()
        .and_then(shared::parse_timestamp_ms)
    {
        if in_head && next.first_timestamp_ms.is_none() {
            next.first_timestamp_ms = Some(ts);
        }
        next.last_timestamp_ms = Some(ts);
    }
    if let Some((role, content)) = entry_to_message(entry) {
        next.last_role = Some(role.clone());
        if role == "user" {
            next.last_user_message = Some(content);
        }
    }
    next
}

fn skip(state: SummaryState) -> SummaryState {
    SummaryState {
        entry_count: state.entry_count,
        past_head: true,
        session_id: state.session_id,
        project_path: state.project_path,
        first_timestamp_ms: state.first_timestamp_ms,
        ..Default::default()
    }
}

/// `sessionIdFromFile` — basename minus `.jsonl`, after the last `_`.
pub fn session_id_from_file(file_path: &str) -> String {
    let base = std::path::Path::new(file_path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    match base.rfind('_') {
        Some(i) => base[i + 1..].to_string(),
        None => base,
    }
}

/// `readSessionIncremental` (cold start) — bounded fold; None when
/// unreadable or the file has no entries.
pub fn read_session(path: &str, fallback_cwd: &str) -> Option<Session> {
    let state = shared::fold_jsonl_bounded(path, SummaryState::default(), reduce, skip)?;
    if state.entry_count == 0 {
        return None;
    }
    let needs_stat = state.first_timestamp_ms.is_none() || state.last_timestamp_ms.is_none();
    let (birth_ms, mtime_ms) = if needs_stat {
        let meta = std::fs::metadata(path).ok();
        let to_ms = |r: std::io::Result<std::time::SystemTime>| {
            r.ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
        };
        let created = meta.as_ref().and_then(|m| to_ms(m.created()));
        let modified = meta.as_ref().and_then(|m| to_ms(m.modified()));
        (created, modified)
    } else {
        (None, None)
    };
    let session_start = state
        .first_timestamp_ms
        .or(birth_ms)
        .or(mtime_ms)
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64
        });
    let last_active = state.last_timestamp_ms.or(mtime_ms).unwrap_or(session_start);
    Some(Session {
        session_id: state
            .session_id
            .unwrap_or_else(|| session_id_from_file(path)),
        project_path: state.project_path.unwrap_or_else(|| fallback_cwd.to_string()),
        summary: state
            .last_user_message
            .map(|m| shared::truncate(&m, 120))
            .unwrap_or_else(|| "Pi session active".into()),
        last_active_ms: last_active,
        last_role: state.last_role,
    })
}

/// `readSessionHead` — session id + project path from the first complete
/// lines, stopping when both are found or at `maxBytes`. Null if unreadable.
pub struct SessionHead {
    pub session_id: Option<String>,
    pub project_path: Option<String>,
    pub bytes_read: usize,
    pub complete: bool,
}

pub fn read_session_head(path: &str, max_bytes: usize) -> Option<SessionHead> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut head = SessionHead {
        session_id: None,
        project_path: None,
        bytes_read: 0,
        complete: false,
    };
    let mut buf = vec![0u8; max_bytes];
    let mut line_start = 0usize;
    while head.bytes_read < max_bytes {
        let n = f
            .read(&mut buf[head.bytes_read..(head.bytes_read + HEAD_CHUNK_BYTES).min(max_bytes)])
            .ok()?;
        if n == 0 {
            head.complete = true;
            break;
        }
        let end = head.bytes_read + n;
        while let Some(off) = buf[line_start..end].iter().position(|&b| b == b'\n') {
            let nl_abs = line_start + off;
            let line = buf[line_start..nl_abs].to_vec();
            line_start = nl_abs + 1;
            apply_head_line(&mut head, &line);
            head.bytes_read = end;
            if head.session_id.is_some() && head.project_path.is_some() {
                return Some(head);
            }
        }
        head.bytes_read = end;
    }
    // The unterminated last line is only trusted when it ends the file.
    if head.complete && line_start < head.bytes_read {
        let line = buf[line_start..head.bytes_read].to_vec();
        apply_head_line(&mut head, &line);
    }
    Some(head)
}

fn apply_head_line(head: &mut SessionHead, line: &[u8]) {
    let Ok(text) = std::str::from_utf8(line) else { return };
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    let Ok(v) = serde_json::from_str::<Value>(trimmed) else {
        return;
    };
    if !v.is_object() {
        return;
    }
    if head.session_id.is_none() {
        head.session_id = entry_session_id(&v);
    }
    if head.project_path.is_none() {
        head.project_path = entry_cwd(&v);
    }
}

/// `determineStatus` — idle > assistant→waiting > running.
pub fn determine_status(session: &Session, now_ms: i64) -> &'static str {
    if shared::is_idle(session.last_active_ms, now_ms) {
        return "idle";
    }
    match session.last_role.as_deref() {
        Some("assistant") => "waiting",
        _ => "running",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    fn write_tmp(lines: &[&str]) -> String {
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!(
            "devkit-pi-parser-{}-{n}.jsonl",
            std::process::id()
        ));
        let mut f = std::fs::File::create(&path).unwrap();
        for l in lines {
            writeln!(f, "{l}").unwrap();
        }
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn empty_file_is_none() {
        let p = write_tmp(&[]);
        assert!(read_session(&p, "/cwd").is_none());
    }

    #[test]
    fn head_fields_from_first_entry_only() {
        let p = write_tmp(&[
            r#"{"sessionId":"s1","cwd":"/proj","timestamp":"2026-10-08T10:00:00Z"}"#,
            r#"{"sessionId":"other","cwd":"/elsewhere","timestamp":"2026-10-08T10:01:00Z","role":"user","content":"hi"}"#,
        ]);
        let s = read_session(&p, "/cwd").unwrap();
        assert_eq!(s.session_id, "s1");
        assert_eq!(s.project_path, "/proj");
        assert_eq!(s.summary, "hi");
        assert_eq!(s.last_role.as_deref(), Some("user"));
    }

    #[test]
    fn assistant_tail_maps_waiting() {
        let p = write_tmp(&[
            r#"{"sessionId":"s2","cwd":"/proj","timestamp":"2026-10-08T10:00:00Z"}"#,
            r#"{"timestamp":"2026-10-08T10:01:00Z","role":"assistant","content":[{"text":"done"}]}"#,
        ]);
        let s = read_session(&p, "/cwd").unwrap();
        assert_eq!(determine_status(&s, s.last_active_ms + 60_000), "waiting");
    }

    #[test]
    fn role_like_type_filters_non_role_types() {
        // `type: "foo"` must not shadow a payload role.
        let e: Value = serde_json::from_str(
            r#"{"type":"event","payload":{"role":"user"},"content":"x"}"#,
        )
        .unwrap();
        assert_eq!(entry_role(&e), Some("user"));
        let e2: Value =
            serde_json::from_str(r#"{"type":"assistant","payload":{"role":"user"}}"#).unwrap();
        assert_eq!(entry_role(&e2), Some("assistant"));
    }

    #[test]
    fn filename_id_fallback() {
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let real = std::env::temp_dir()
            .join(format!(
                "2026-06-10T08-58-20-754Z_sessabc-{}-{n}.jsonl",
                std::process::id()
            ))
            .to_string_lossy()
            .into_owned();
        std::fs::write(
            &real,
            "{\"timestamp\":\"2026-10-08T10:00:00Z\",\"role\":\"user\",\"content\":\"x\"}\n",
        )
        .unwrap();
        let s = read_session(&real, "/cwd").unwrap();
        let expected_suffix = format!("sessabc-{}-{n}", std::process::id());
        assert_eq!(s.session_id, expected_suffix);
        assert_eq!(s.project_path, "/cwd");
    }
}
