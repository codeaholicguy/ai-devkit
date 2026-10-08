//! Port of `AntigravitySessionParser` — the bounded JSONL fold behind
//! `readSessionIncremental` and `determineStatus`. Conversation reads and
//! the incremental cache are not ported.

use crate::shared;
use serde_json::{Map, Value};

/// `AntigravitySummaryState`.
#[derive(Default)]
struct Summary {
    past_head: bool,
    first_user_message: Option<String>,
    last_user_message: Option<String>,
    last_role: Option<&'static str>,
    last_active_ms: Option<i64>,
}

/// `AntigravitySession` (wire-relevant fields only).
pub struct Session {
    pub session_id: String,
    pub project_path: String,
    pub transcript_path: String,
    pub last_active_ms: i64,
    pub last_user_message: Option<String>,
    pub last_role: Option<&'static str>,
}

/// `readSessionIncremental` — stat must succeed (a directory still
/// counts, matching TS `!stat`); unreadable transcript → empty summary.
pub fn read_session(conversation_id: &str, transcript_path: &str, cwd: &str) -> Option<Session> {
    let meta = std::fs::metadata(transcript_path).ok()?;
    let state = shared::fold_jsonl_bounded(
        transcript_path,
        Summary::default(),
        reduce,
        |s: Summary| Summary {
            past_head: true,
            first_user_message: s.first_user_message,
            ..Summary::default()
        },
    )
    .unwrap_or_default();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Some(Session {
        session_id: conversation_id.to_string(),
        project_path: cwd.to_string(),
        transcript_path: transcript_path.to_string(),
        last_active_ms: state.last_active_ms.unwrap_or(mtime),
        last_user_message: state.last_user_message,
        last_role: state.last_role,
    })
}

/// `determineStatus`: past the idle mark → idle; last turn assistant →
/// waiting; else running.
pub fn status(session: &Session, now_ms: i64) -> &'static str {
    if shared::is_idle(session.last_active_ms, now_ms) {
        "idle"
    } else if session.last_role == Some("assistant") {
        "waiting"
    } else {
        "running"
    }
}

/// `summaryReducer.reduce` — `created_at` keeps the MAX seen (not the
/// last line's); first/last user request and the last user/assistant
/// role come from `recordToMessage` rules.
fn reduce(mut state: Summary, value: Option<&Value>) -> Summary {
    let Some(record) = value.and_then(|v| v.as_object()) else {
        return state;
    };
    if let Some(ms) = record
        .get("created_at")
        .and_then(shared::parse_timestamp_ms)
    {
        if state.last_active_ms.is_none_or(|m| ms > m) {
            state.last_active_ms = Some(ms);
        }
    }
    match record_to_message(record) {
        Some(("user", content)) => {
            if state.first_user_message.is_none() && !state.past_head {
                state.first_user_message = Some(content.clone());
            }
            state.last_user_message = Some(content);
            state.last_role = Some("user");
        }
        Some(("assistant", _)) => state.last_role = Some("assistant"),
        _ => {}
    }
    state
}

/// `recordToMessage(record, false)` — USER_INPUT → user (via
/// `extractUserRequest`), non-empty PLANNER_RESPONSE → assistant;
/// everything else is execution detail (verbose-only in TS).
fn record_to_message(record: &Map<String, Value>) -> Option<(&'static str, String)> {
    let text = shared::flatten_text_blocks(record.get("content").unwrap_or(&Value::Null));
    if record.get("type").and_then(|t| t.as_str()) == Some("USER_INPUT") {
        return extract_user_request(&text).map(|r| ("user", r));
    }
    if text.is_empty() {
        return None;
    }
    if record.get("type").and_then(|t| t.as_str()) == Some("PLANNER_RESPONSE") {
        return Some(("assistant", text));
    }
    None
}

/// `extractUserRequest` — the text inside the first
/// `<USER_REQUEST>…</USER_REQUEST>` pair, trimmed (may be ""); without a
/// wrapper, the whole trimmed text or None.
fn extract_user_request(text: &str) -> Option<String> {
    const OPEN: &str = "<USER_REQUEST>";
    const CLOSE: &str = "</USER_REQUEST>";
    if let Some(start) = text.find(OPEN) {
        let body_start = start + OPEN.len();
        if let Some(end) = text[body_start..].find(CLOSE) {
            return Some(text[body_start..body_start + end].trim().to_string());
        }
    }
    let t = text.trim();
    (!t.is_empty()).then(|| t.to_string())
}
