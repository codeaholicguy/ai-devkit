//! CopilotSessionParser port — `events.jsonl` O(1) fold (IncrementalJsonlSummary
//! cold-start semantics via `fold_jsonl_bounded`) plus `workspace.yaml`
//! fallback metadata. Only the `detectAgents` path is ported.

use crate::shared;
use serde_json::Value;
use std::path::Path;

/// `CopilotSession` — the fields `detectAgents`/mapper consume
/// (`sessionStart` only feeds the out-of-scope listSessions path).
pub struct Session {
    pub session_id: String,
    pub project_path: String,
    pub summary: String,
    pub last_active_ms: i64,
    pub last_event_type: Option<String>,
    pub events_file_path: String,
}

/// `CopilotEventState` — O(1) running fold of events.jsonl.
#[derive(Default)]
pub struct EventState {
    pub entry_count: u64,
    pub past_head: bool,
    pub session_id: Option<String>,
    pub project_path: Option<String>,
    pub session_start_ms: Option<i64>,
    pub last_active_ms: Option<i64>,
    pub first_user_message: String,
    pub last_text: String,
    pub last_event_type: Option<String>,
}

/// JS truthiness for `a || b` chains and `!value` checks.
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64() != Some(0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// `extractEventText(entry, verbose=false)` — first truthy of
/// content/message/text/result.content/result.detailedContent, string-only.
fn extract_event_text(entry: &Value) -> String {
    if !truthy(entry.get("data")) {
        return String::new();
    }
    let data = entry.get("data").unwrap_or(&Value::Null);
    let result = data.get("result");
    let raw = [
        data.get("content"),
        data.get("message"),
        data.get("text"),
        result.and_then(|r| r.get("content")),
        result.and_then(|r| r.get("detailedContent")),
    ]
    .into_iter()
    .flatten()
    .find(|v| truthy(Some(*v)));
    raw.and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// `eventReducer.reduce` — entryCount++ only for parseable lines; non-objects
/// count but read no fields; `session.start` overrides id/cwd/start and skips
/// text extraction.
fn reduce(state: EventState, value: Option<&Value>) -> EventState {
    let Some(entry) = value else { return state };
    let mut next = EventState {
        entry_count: state.entry_count + 1,
        ..state
    };
    if !entry.is_object() {
        return next;
    }

    let timestamp_ms = entry
        .get("timestamp")
        .and_then(shared::parse_timestamp_ms);
    if let Some(t) = timestamp_ms {
        next.last_active_ms = Some(t);
    }
    let entry_type = entry.get("type").and_then(Value::as_str);
    if let Some(t) = entry_type.filter(|s| !s.is_empty()) {
        next.last_event_type = Some(t.to_string());
    }

    if entry_type == Some("session.start") {
        let data = entry.get("data").unwrap_or(&Value::Null);
        if let Some(sid) = data.get("sessionId").and_then(Value::as_str) {
            if !sid.is_empty() {
                next.session_id = Some(sid.to_string());
            }
        }
        if let Some(cwd) = data
            .get("context")
            .and_then(|c| c.get("cwd"))
            .and_then(Value::as_str)
        {
            if !cwd.is_empty() {
                next.project_path = Some(cwd.to_string());
            }
        }
        next.session_start_ms = data
            .get("startTime")
            .and_then(shared::parse_timestamp_ms)
            .or(timestamp_ms)
            .or(state.session_start_ms);
        return next;
    }

    let text = extract_event_text(entry);
    if text.is_empty() {
        return next;
    }
    if next.first_user_message.is_empty()
        && !state.past_head
        && entry_type == Some("user.message")
    {
        next.first_user_message = text.clone();
    }
    if matches!(entry_type, Some("user.message") | Some("assistant.message")) {
        next.last_text = text;
    }
    next
}

/// `eventReducer.skip` — keeps identity fields, clears the latest
/// timestamp/type/text so they come from the tail only.
fn skip(state: EventState) -> EventState {
    EventState {
        entry_count: state.entry_count,
        past_head: true,
        session_id: state.session_id,
        project_path: state.project_path,
        session_start_ms: state.session_start_ms,
        last_active_ms: None,
        first_user_message: state.first_user_message,
        last_text: String::new(),
        last_event_type: None,
    }
}

/// `CopilotWorkspace` — naive `key: value` yaml scalars.
#[derive(Default)]
struct Workspace {
    id: Option<String>,
    cwd: Option<String>,
    name: Option<String>,
    created_at_ms: Option<i64>,
    updated_at_ms: Option<i64>,
}

impl Workspace {
    fn has_metadata(&self) -> bool {
        [
            self.id.as_deref(),
            self.cwd.as_deref(),
            self.name.as_deref(),
        ]
        .iter()
        .any(|s| s.is_some_and(|s| !s.is_empty()))
            || self.created_at_ms.is_some()
            || self.updated_at_ms.is_some()
    }
}

/// `readWorkspaceMetadata` — one `key: scalar` per line; '#' comments and
/// lines without ':' skipped; matching quotes stripped.
fn read_workspace_metadata(path: &Path) -> Workspace {
    let Ok(content) = std::fs::read_to_string(path) else {
        return Workspace::default();
    };
    let mut values = std::collections::HashMap::new();
    for raw in content.split('\n') {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some(idx) = line.find(':') else { continue };
        let key = line[..idx].trim().to_string();
        let mut value = line[idx + 1..].trim().to_string();
        let bytes = value.as_bytes();
        if bytes.len() >= 2
            && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
                || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
        {
            value = value[1..value.len() - 1].to_string();
        }
        values.insert(key, value);
    }
    let ts = |k: &str| {
        values
            .get(k)
            .and_then(|s| shared::parse_timestamp_ms(&Value::String(s.clone())))
    };
    Workspace {
        id: values.get("id").cloned(),
        cwd: values.get("cwd").cloned(),
        name: values.get("name").cloned(),
        created_at_ms: ts("created_at"),
        updated_at_ms: ts("updated_at"),
    }
}

fn mtime_ms(path: &Path) -> Option<i64> {
    let m = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(m.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64)
}

/// `readSessionDirIncremental` for a cold read — identical output to the
/// incremental cache's first read: bounded head+tail fold of events.jsonl
/// (None when unreadable → empty state), then `toSession`.
pub fn read_session_dir(session_dir: &Path, fallback_session_id: &str, now_ms: i64) -> Option<Session> {
    let events_file = session_dir.join("events.jsonl");
    let events = shared::fold_jsonl_bounded(
        &events_file.to_string_lossy(),
        EventState::default(),
        reduce,
        skip,
    )
    .unwrap_or_default();

    let workspace = read_workspace_metadata(&session_dir.join("workspace.yaml"));
    if events.entry_count == 0 && !workspace.has_metadata() {
        return None;
    }

    let file_birth = shared::birthtime_ms(&events_file.to_string_lossy());
    let file_mtime = mtime_ms(&events_file);
    let default_start = workspace.created_at_ms.or(file_birth).unwrap_or(now_ms);
    // `sessionStart` (`events.session_start_ms ?? default_start`) only feeds
    // the out-of-scope listSessions path — not computed into the session row.
    let last_active_ms = events
        .last_active_ms
        .or(workspace.updated_at_ms)
        .or(file_mtime)
        .unwrap_or(default_start);

    let summary_raw = [
        events.first_user_message.as_str(),
        events.last_text.as_str(),
        workspace.name.as_deref().unwrap_or(""),
    ]
    .into_iter()
    .find(|s| !s.is_empty())
    .unwrap_or("Copilot session active");
    let summary = shared::truncate(summary_raw, 120);

    let session_id = [
        events.session_id.as_deref(),
        workspace.id.as_deref(),
        Some(fallback_session_id),
    ]
    .into_iter()
    .flatten()
    .find(|s| !s.is_empty())
    .unwrap_or_default()
    .to_string();

    let project_path = [events.project_path.as_deref(), workspace.cwd.as_deref()]
        .into_iter()
        .flatten()
        .find(|s| !s.is_empty())
        .unwrap_or_default()
        .to_string();

    Some(Session {
        session_id,
        project_path,
        summary,
        last_active_ms,
        last_event_type: events.last_event_type,
        events_file_path: events_file.to_string_lossy().into_owned(),
    })
}

/// `determineStatus` — idle(5min) > waiting events > running.
pub fn determine_status(session: &Session, now_ms: i64) -> &'static str {
    if shared::is_idle(session.last_active_ms, now_ms) {
        return "idle";
    }
    if session.last_event_type.as_deref().is_some_and(|t| {
        matches!(
            t,
            "assistant.message" | "assistant.turn_end" | "session.shutdown" | "abort"
        )
    }) {
        return "waiting";
    }
    "running"
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn dir_with(files: &[(&str, &str)]) -> std::path::PathBuf {
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "copilot-parser-test-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for (name, content) in files {
            std::fs::write(dir.join(name), content).unwrap();
        }
        dir
    }

    #[test]
    fn reduce_folds_events() {
        let dir = dir_with(&[(
            "events.jsonl",
            concat!(
                "{\"type\":\"session.start\",\"data\":{\"sessionId\":\"s1\",\"startTime\":\"2026-10-08T10:00:00.000Z\",\"context\":{\"cwd\":\"/p\"}},\"timestamp\":\"2026-10-08T10:00:00.000Z\"}\n",
                "{\"type\":\"user.message\",\"data\":{\"content\":\"hello\"},\"timestamp\":\"2026-10-08T10:01:00.000Z\"}\n",
                "{\"type\":\"assistant.message\",\"data\":{\"content\":\"hi\"},\"timestamp\":\"2026-10-08T10:02:00.000Z\"}\n"
            ),
        )]);
        let s = read_session_dir(&dir, "fallback", 0).unwrap();
        assert_eq!(s.session_id, "s1");
        assert_eq!(s.project_path, "/p");
        assert_eq!(s.summary, "hello");
        assert_eq!(s.last_event_type.as_deref(), Some("assistant.message"));
        assert_eq!(
            determine_status(&s, s.last_active_ms + 60_000),
            "waiting"
        );
        assert_eq!(
            determine_status(&s, s.last_active_ms + 300_001),
            "idle"
        );
    }

    #[test]
    fn workspace_yaml_fallback_when_no_events() {
        let dir = dir_with(&[(
            "workspace.yaml",
            "id: w1\ncwd: /proj\nname: \"my session\"\ncreated_at: 2026-10-08T09:00:00Z\nupdated_at: 2026-10-08T09:05:00Z\n",
        )]);
        let s = read_session_dir(&dir, "fb", 0).unwrap();
        assert_eq!(s.session_id, "w1");
        assert_eq!(s.project_path, "/proj");
        assert_eq!(s.summary, "my session");
        assert_eq!(s.last_event_type, None);
        assert_eq!(determine_status(&s, 0), "running");
    }

    #[test]
    fn empty_dir_yields_no_session() {
        let dir = dir_with(&[]);
        assert!(read_session_dir(&dir, "fb", 0).is_none());
    }

    #[test]
    fn extract_text_prefers_content_then_message() {
        let e = json!({"data":{"content":"  c  ","message":"m"}});
        assert_eq!(extract_event_text(&e), "c");
        let e = json!({"data":{"content":"","message":"m"}});
        assert_eq!(extract_event_text(&e), "m");
        let e = json!({"data":{"result":{"detailedContent":"d"}}});
        assert_eq!(extract_event_text(&e), "d");
        let e = json!({"data":{"content":{}}});
        assert_eq!(extract_event_text(&e), "");
        let e = json!({});
        assert_eq!(extract_event_text(&e), "");
    }
}
