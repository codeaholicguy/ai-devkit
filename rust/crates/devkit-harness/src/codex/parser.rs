//! CodexSessionParser port — bounded head/tail JSONL summary of a rollout
//! file plus status derivation. Conversation APIs stay TS-side.

use crate::shared;
use serde_json::Value;

/// Folded session state — mirrors `CodexSummaryState`.
#[derive(Default)]
pub struct SummaryState {
    pub seen_first_line: bool,
    /// Set only when the first line is a valid `session_meta` entry.
    pub meta: Option<Meta>,
    pub last_entry_timestamp: Option<String>,
    pub last_payload_type: Option<String>,
    /// Truncated text of the last entry with displayable content.
    pub summary: Option<String>,
}

pub struct Meta {
    pub id: String,
    pub cwd: Option<String>,
    pub timestamp: Option<String>,
}

/// Built `CodexSession` — timestamps as epoch ms for mapper use.
pub struct Session {
    pub session_id: String,
    pub project_path: String,
    pub summary: String,
    #[allow(dead_code)]
    pub session_start_ms: i64,
    pub last_active_ms: i64,
    pub last_payload_type: Option<String>,
}

fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    v.get(key)
}

fn payload(entry: &Value) -> Option<&Value> {
    entry.get("payload")
}

/// `normalizedPayloadType`
fn normalized_payload_type(entry: &Value) -> Option<String> {
    let p = payload(entry);
    let payload_type = p.and_then(|p| get(p, "type")).and_then(Value::as_str);
    let entry_type = get(entry, "type").and_then(Value::as_str);

    if entry_type == Some("response_item") && payload_type == Some("message") {
        return match p.and_then(|p| get(p, "role")).and_then(Value::as_str) {
            Some("assistant") => Some("agent_message".into()),
            Some("user") => Some("user_message".into()),
            _ => payload_type.map(str::to_string),
        };
    }
    if entry_type == Some("event_msg") && payload_type == Some("item_completed") {
        let item_type = p
            .and_then(|p| get(p, "item"))
            .and_then(|i| get(i, "type"))
            .and_then(Value::as_str);
        return match item_type {
            Some("AgentMessage") => Some("agent_message".into()),
            Some("UserMessage") => Some("user_message".into()),
            other => other.or(payload_type).map(str::to_string),
        };
    }
    payload_type.map(str::to_string)
}

/// `extractContentText` — string or `[{text}]` blocks → joined text.
fn extract_content_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|p| get(p, "text").and_then(Value::as_str))
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string(),
        _ => String::new(),
    }
}

/// `toConversationMessage` (verbose=false) — content-bearing entries only.
fn conversation_message(entry: &Value) -> Option<(String, String)> {
    if get(entry, "type").and_then(Value::as_str) == Some("session_meta") {
        return None;
    }
    let entry_type = get(entry, "type").and_then(Value::as_str);
    let p = payload(entry);
    let payload_type = p.and_then(|p| get(p, "type")).and_then(Value::as_str);

    if entry_type == Some("response_item") && payload_type == Some("message") {
        let role = match p.and_then(|p| get(p, "role")).and_then(Value::as_str) {
            Some("user") => "user",
            Some("assistant") => "assistant",
            _ => return None, // verbose=false → system dropped
        };
        let text = extract_content_text(p.and_then(|p| get(p, "content")));
        if text.is_empty() {
            return None;
        }
        return Some((role.into(), text));
    }

    if entry_type == Some("event_msg") && payload_type == Some("item_completed") {
        let item = p.and_then(|p| get(p, "item"));
        let role = match item.and_then(|i| get(i, "type")).and_then(Value::as_str) {
            Some("AgentMessage") => "assistant",
            Some("UserMessage") => "user",
            _ => return None,
        };
        let text = extract_content_text(item.and_then(|i| get(i, "content")));
        if text.is_empty() {
            return None;
        }
        return Some((role.into(), text));
    }

    let payload_type = payload_type?;
    let role = match payload_type {
        "user_message" => "user",
        "agent_message" | "task_complete" => "assistant",
        _ => return None,
    };
    let text = p
        .and_then(|p| get(p, "message"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|t| !t.is_empty())?;
    Some((role.into(), text.to_string()))
}

/// `extractEntryText` — legacy `payload.message`, else conversation text.
fn extract_entry_text(entry: Option<&Value>) -> String {
    let Some(entry) = entry else { return String::new() };
    if let Some(m) = payload(entry)
        .and_then(|p| get(p, "message"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|t| !t.is_empty())
    {
        return m.to_string();
    }
    conversation_message(entry)
        .map(|(_, t)| t.trim().to_string())
        .unwrap_or_default()
}

/// `readSessionIncremental` (cold start) — bounded fold; None when unreadable
/// or when the first line is not a `session_meta` with a payload id.
pub fn read_session(path: &str) -> Option<Session> {
    let state = shared::fold_jsonl_bounded(
        path,
        SummaryState::default(),
        reduce,
        |state| SummaryState {
            seen_first_line: true,
            meta: state.meta,
            ..Default::default()
        },
    )?;
    to_session(state, || {
        std::fs::metadata(path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    })
}

fn reduce(state: SummaryState, value: Option<&Value>) -> SummaryState {
    let mut next = SummaryState {
        seen_first_line: true,
        meta: state.meta,
        last_entry_timestamp: state.last_entry_timestamp,
        last_payload_type: state.last_payload_type,
        summary: state.summary,
    };
    let entry = value.filter(|v| v.is_object());

    if !state.seen_first_line {
        if let Some(e) = entry {
            if get(e, "type").and_then(Value::as_str) == Some("session_meta") {
                if let Some(p) = payload(e) {
                    if let Some(id) = get(p, "id").and_then(Value::as_str) {
                        next.meta = Some(Meta {
                            id: id.to_string(),
                            cwd: get(p, "cwd").and_then(Value::as_str).map(str::to_string),
                            timestamp: get(p, "timestamp")
                                .and_then(Value::as_str)
                                .map(str::to_string),
                        });
                    }
                }
            }
        }
    }
    if entry.is_none() || next.meta.is_none() {
        return next;
    }
    let entry = entry.unwrap();

    if get(entry, "type").and_then(Value::as_str).is_some() {
        next.last_entry_timestamp = get(entry, "timestamp")
            .and_then(Value::as_str)
            .map(str::to_string);
        next.last_payload_type = normalized_payload_type(entry);
    }
    let text = extract_entry_text(Some(entry));
    if !text.is_empty() {
        next.summary = Some(shared::truncate(&text, 120));
    }
    next
}

fn to_session(state: SummaryState, file_mtime_ms: impl FnOnce() -> i64) -> Option<Session> {
    let meta = state.meta?;
    let meta_ts = meta
        .timestamp
        .as_deref()
        .map(|s| Value::String(s.to_string()));
    let last_entry_ts = state
        .last_entry_timestamp
        .as_deref()
        .map(|s| Value::String(s.to_string()));
    let last_active = last_entry_ts
        .as_ref()
        .and_then(shared::parse_timestamp_ms)
        .or_else(|| meta_ts.as_ref().and_then(shared::parse_timestamp_ms))
        .unwrap_or_else(file_mtime_ms);
    let session_start = meta_ts
        .as_ref()
        .and_then(shared::parse_timestamp_ms)
        .unwrap_or(last_active);
    Some(Session {
        session_id: meta.id,
        project_path: meta.cwd.unwrap_or_default(),
        summary: state.summary.unwrap_or_else(|| "Codex session active".into()),
        session_start_ms: session_start,
        last_active_ms: last_active,
        last_payload_type: state.last_payload_type,
    })
}

/// `determineStatus`
pub fn determine_status(session: &Session, now_ms: i64) -> &'static str {
    if shared::is_idle(session.last_active_ms, now_ms) {
        return "idle";
    }
    match session.last_payload_type.as_deref() {
        Some("agent_message" | "task_complete" | "turn_aborted") => "waiting",
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
            "devkit-codex-parser-{}-{n}.jsonl",
            std::process::id()
        ));
        let mut f = std::fs::File::create(&path).unwrap();
        for l in lines {
            writeln!(f, "{l}").unwrap();
        }
        path.to_string_lossy().into_owned()
    }

    fn meta_line(id: &str, cwd: &str, ts: &str) -> String {
        format!(
            r#"{{"timestamp":"{ts}","type":"session_meta","payload":{{"id":"{id}","cwd":"{cwd}","timestamp":"{ts}"}}}}"#
        )
    }

    #[test]
    fn session_meta_required() {
        let p = write_tmp(&[r#"{"type":"event_msg","payload":{"type":"user_message","message":"hi"}}"#]);
        assert!(read_session(&p).is_none());
    }

    #[test]
    fn agent_message_tail_maps_waiting() {
        let p = write_tmp(&[
            &meta_line("s1", "/proj", "2026-10-08T10:00:00Z"),
            r#"{"timestamp":"2026-10-08T10:01:00Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"done"}]}}"#,
        ]);
        let s = read_session(&p).unwrap();
        assert_eq!(s.session_id, "s1");
        assert_eq!(s.summary, "done");
        assert_eq!(determine_status(&s, s.last_active_ms + 60_000), "waiting");
    }

    #[test]
    fn running_when_last_payload_is_user_message() {
        let p = write_tmp(&[
            &meta_line("s2", "/proj", "2026-10-08T10:00:00Z"),
            r#"{"timestamp":"2026-10-08T10:01:00Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"do it"}]}}"#,
        ]);
        let s = read_session(&p).unwrap();
        assert_eq!(determine_status(&s, s.last_active_ms + 60_000), "running");
        assert_eq!(s.summary, "do it");
    }

    #[test]
    fn idle_after_five_minutes() {
        let p = write_tmp(&[
            &meta_line("s3", "/proj", "2026-10-08T10:00:00Z"),
            r#"{"timestamp":"2026-10-08T10:01:00Z","type":"event_msg","payload":{"type":"task_complete","message":"bye"}}"#,
        ]);
        let s = read_session(&p).unwrap();
        assert_eq!(determine_status(&s, s.last_active_ms + 6 * 60_000), "idle");
    }

    #[test]
    fn legacy_message_field_wins_summary() {
        let p = write_tmp(&[
            &meta_line("s4", "/proj", "2026-10-08T10:00:00Z"),
            r#"{"timestamp":"2026-10-08T10:01:00Z","type":"event_msg","payload":{"type":"task_started","message":"legacy text"}}"#,
        ]);
        let s = read_session(&p).unwrap();
        assert_eq!(s.summary, "legacy text");
    }

    #[test]
    fn file_without_meta_first_line_returns_none_even_with_later_meta() {
        let p = write_tmp(&[
            r#"{"type":"event_msg","payload":{"type":"user_message","message":"hi"}}"#,
            &meta_line("s5", "/proj", "2026-10-08T10:00:00Z"),
        ]);
        assert!(read_session(&p).is_none());
    }
}
