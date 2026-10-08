//! GrokSessionParser port — chat_history.jsonl O(1) summary fold
//! (IncrementalJsonlSummary cold-start semantics via `fold_jsonl_bounded`).
//! Only the `detectAgents` path is ported.

use crate::shared;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// `chat_history.jsonl` inside each session dir.
pub const CHAT_HISTORY_FILE: &str = "chat_history.jsonl";

/// `GrokSession` — the fields `detectAgents`/mapper consume.
pub struct Session {
    pub session_id: String,
    pub project_path: String,
    pub session_file_path: String,
    pub last_active_ms: i64,
    pub last_user_message: Option<String>,
    pub last_role: Option<String>,
}

/// `GrokSummaryState` — first/last real prompt and last turn role.
#[derive(Default)]
struct SummaryState {
    past_head: bool,
    first_user_message: Option<String>,
    last_user_message: Option<String>,
    last_role: Option<String>,
}

/// `extractUserQuery` — text inside `<user_query>…</user_query>`, or None
/// for context injections (no real prompt).
fn extract_user_query(text: &str) -> Option<String> {
    const OPEN: &str = "<user_query>";
    const CLOSE: &str = "</user_query>";
    let open = text.find(OPEN)? + OPEN.len();
    let close = text[open..].find(CLOSE)? + open;
    Some(text[open..close].trim().to_string())
}

/// `toMessage(value, verbose=false)` — record → (role, content); context
/// injections, empty assistant text and non-message types fold to None.
fn to_message(value: &Value) -> Option<(&'static str, String)> {
    if !value.is_object() {
        return None;
    }
    let text = shared::flatten_text_blocks(value.get("content").unwrap_or(&Value::Null));
    match value.get("type").and_then(Value::as_str) {
        Some("user") => extract_user_query(&text).map(|q| ("user", q)),
        Some("assistant") if !text.is_empty() => Some(("assistant", text)),
        _ => None,
    }
}

/// `summaryReducer.reduce` — user turns track first/last prompt and set the
/// role; assistant turns only move the role.
fn reduce(mut state: SummaryState, value: Option<&Value>) -> SummaryState {
    let Some((role, content)) = value.and_then(to_message) else {
        return state;
    };
    if role == "user" {
        state.last_user_message = Some(content.clone());
        state.last_role = Some("user".into());
        if state.first_user_message.is_none() && !state.past_head {
            state.first_user_message = Some(content);
        }
    } else {
        state.last_role = Some(role.into());
    }
    state
}

/// `summaryReducer.skip` — keep the head's first prompt only.
fn skip(state: SummaryState) -> SummaryState {
    SummaryState {
        past_head: true,
        first_user_message: state.first_user_message,
        ..SummaryState::default()
    }
}

fn mtime_ms(path: &Path) -> Option<i64> {
    let m = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(m.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64)
}

/// `readSessionIncremental` for a cold read: bounded fold of
/// chat_history.jsonl; a present-but-empty transcript still surfaces a
/// session (with no summary); a missing transcript yields None.
pub fn read_session(session_dir: &Path, default_cwd: &str) -> Option<Session> {
    let chat_path = session_dir.join(CHAT_HISTORY_FILE);
    let chat_mtime = mtime_ms(&chat_path)?;
    let state = shared::fold_jsonl_bounded(
        &chat_path.to_string_lossy(),
        SummaryState::default(),
        reduce,
        skip,
    )
    .unwrap_or_default();
    Some(Session {
        session_id: session_dir
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        project_path: default_cwd.to_string(),
        session_file_path: chat_path.to_string_lossy().into_owned(),
        last_active_ms: chat_mtime,
        last_user_message: state.last_user_message,
        last_role: state.last_role,
    })
}

/// `determineStatus` — idle(5min) > last turn assistant (waiting) > running.
pub fn determine_status(session: &Session, now_ms: i64) -> &'static str {
    if shared::is_idle(session.last_active_ms, now_ms) {
        return "idle";
    }
    if session.last_role.as_deref() == Some("assistant") {
        return "waiting";
    }
    "running"
}

/// Group dir for a cwd: `sessions/<encodeURIComponent(cwd)>/`.
pub fn group_dir_for(sessions_dir: &Path, cwd: &str) -> PathBuf {
    sessions_dir.join(shared::encode_uri_component(cwd))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn user_query_extraction() {
        assert_eq!(
            extract_user_query("pre <user_query>  hello world  </user_query> post"),
            Some("hello world".into())
        );
        assert_eq!(extract_user_query("<user_query></user_query>"), Some("".into()));
        assert_eq!(extract_user_query("<user_info>ctx</user_info>"), None);
        assert_eq!(extract_user_query("<user_query>unclosed"), None);
    }

    #[test]
    fn to_message_roles() {
        let u = json!({"type":"user","content":"<user_query>hi</user_query>"});
        assert_eq!(to_message(&u), Some(("user", "hi".into())));
        let ctx = json!({"type":"user","content":"<user_info>x</user_info>"});
        assert_eq!(to_message(&ctx), None);
        let a = json!({"type":"assistant","content":[{"text":"one"},{"text":"two"}]});
        assert_eq!(to_message(&a), Some(("assistant", "onetwo".into())));
        let empty = json!({"type":"assistant","content":""});
        assert_eq!(to_message(&empty), None);
        let sys = json!({"type":"system","content":"s"});
        assert_eq!(to_message(&sys), None);
        let nonobj = json!("text");
        assert_eq!(to_message(&nonobj), None);
    }
}
