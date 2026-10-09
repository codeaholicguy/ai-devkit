//! Port of `KiroSessionParser` — the bounded JSONL summary fold behind
//! `readSessionIncremental`, the `<id>.json` metadata read, and
//! `determineStatus`. Conversation/tail reads are not ported.

use crate::shared;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

/// `KiroSummaryState` — O(1) fold state, never the entries.
#[derive(Default)]
struct KiroSummary {
    past_head: bool,
    first_user_message: Option<String>,
    last_user_message: Option<String>,
    first_ts_ms: Option<i64>,
    last_ts_ms: Option<i64>,
    last_event_kind: Option<String>,
    last_assistant_has_tool_use: bool,
}

/// What `detect` needs from a session (`KiroSession`, minus fields absent
/// from the wire output).
pub struct KiroSession {
    pub session_id: String,
    pub project_path: String,
    pub transcript_path: String,
    pub title: String,
    pub last_user_message: Option<String>,
    pub last_active_ms: i64,
    pub last_event_kind: Option<String>,
    pub last_assistant_has_tool_use: bool,
}

struct Metadata {
    session_id: Option<String>,
    cwd: Option<String>,
    title: Option<String>,
    updated_at: Option<i64>,
}

/// `readSessionIncremental` — transcript must exist; an unreadable one
/// yields an empty summary (TS `{}`), never drops the session.
pub fn read_session(
    sessions_dir: &Path,
    session_id: &str,
    fallback_cwd: &str,
) -> Option<KiroSession> {
    let transcript = sessions_dir.join(format!("{session_id}.jsonl"));
    let meta = std::fs::metadata(&transcript).ok()?;
    if !meta.is_file() {
        return None;
    }
    let transcript_s = transcript.to_string_lossy().into_owned();
    let state = shared::fold_jsonl_bounded(
        &transcript_s,
        KiroSummary::default(),
        reduce,
        |s: KiroSummary| KiroSummary {
            past_head: true,
            first_user_message: s.first_user_message,
            first_ts_ms: s.first_ts_ms,
            ..KiroSummary::default()
        },
    )
    .unwrap_or_default();

    let metadata = read_metadata(&sessions_dir.join(format!("{session_id}.json")));
    let last_active_ms = metadata
        .updated_at
        .or(state.last_ts_ms)
        .or_else(|| {
            meta.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
        })
        .unwrap_or(0);

    Some(KiroSession {
        session_id: metadata.session_id.unwrap_or_else(|| session_id.to_string()),
        project_path: match metadata.cwd {
            Some(cwd) if !cwd.is_empty() => cwd,
            _ => fallback_cwd.to_string(),
        },
        transcript_path: transcript_s,
        title: metadata.title.unwrap_or_default(),
        last_user_message: state.last_user_message,
        last_active_ms,
        last_event_kind: state.last_event_kind,
        last_assistant_has_tool_use: state.last_assistant_has_tool_use,
    })
}

/// `determineStatus`: past the 5-min idle mark → idle; else an assistant
/// reply without a tool call → waiting; everything else → running.
pub fn status(session: &KiroSession, now_ms: i64) -> &'static str {
    if shared::is_idle(session.last_active_ms, now_ms) {
        "idle"
    } else if session.last_event_kind.as_deref() == Some("AssistantMessage")
        && !session.last_assistant_has_tool_use
    {
        "waiting"
    } else {
        "running"
    }
}

/// `summaryReducer.reduce` — non-object lines ignored; every object line
/// resets the latest-event fields even when it is not a message.
fn reduce(mut state: KiroSummary, value: Option<&Value>) -> KiroSummary {
    let Some(entry) = value.and_then(|v| v.as_object()) else {
        return state;
    };
    let kind = entry.get("kind").and_then(|v| v.as_str());
    state.last_event_kind = kind.map(|k| k.to_string());
    state.last_assistant_has_tool_use =
        kind == Some("AssistantMessage") && has_content_kind(entry, "toolUse");

    if let Some(ts) = entry_timestamp_ms(entry) {
        state.last_ts_ms = Some(ts);
        if state.first_ts_ms.is_none() && !state.past_head {
            state.first_ts_ms = Some(ts);
        }
    }

    // `entryToMessage(entry, false)` — only a non-empty Prompt is a user msg.
    if kind == Some("Prompt") {
        let content = text_content(entry);
        if !content.is_empty() {
            state.last_user_message = Some(content.clone());
            if state.first_user_message.is_none() && !state.past_head {
                state.first_user_message = Some(content);
            }
        }
    }
    state
}

/// `contentBlocks` — `data.content` array, object blocks only.
fn content_blocks(entry: &Map<String, Value>) -> &[Value] {
    entry
        .get("data")
        .and_then(|d| d.get("content"))
        .and_then(|c| c.as_array())
        .map(|a| a.as_slice())
        .unwrap_or(&[])
}

fn has_content_kind(entry: &Map<String, Value>, kind: &str) -> bool {
    content_blocks(entry)
        .iter()
        .any(|b| b.get("kind").and_then(|k| k.as_str()) == Some(kind))
}

/// `textContent` — `kind === "text"` blocks' string `data`, joined.
fn text_content(entry: &Map<String, Value>) -> String {
    content_blocks(entry)
        .iter()
        .filter(|b| b.get("kind").and_then(|k| k.as_str()) == Some("text"))
        .map(|b| b.get("data").and_then(|d| d.as_str()).unwrap_or(""))
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("")
}

/// `entryTimestamp` folded to ms — the line's own non-empty string
/// timestamp, else `data.meta.timestamp` (epoch s/ms or ISO).
fn entry_timestamp_ms(entry: &Map<String, Value>) -> Option<i64> {
    if let Some(s) = entry
        .get("timestamp")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return shared::parse_iso_ms(s);
    }
    shared::parse_timestamp_ms(
        entry
            .get("data")
            .and_then(|d| d.get("meta"))
            .and_then(|m| m.get("timestamp"))?,
    )
}

/// `readMetadata` — unparseable/absent metadata keeps every field at its
/// fallback (filename-derived id, empty cwd/title).
fn read_metadata(path: &PathBuf) -> Metadata {
    let parsed = std::fs::read_to_string(path)
        .ok()
        .and_then(|c| serde_json::from_str::<Value>(&c).ok());
    let Some(obj) = parsed.as_ref().and_then(|v| v.as_object()) else {
        return Metadata {
            session_id: None,
            cwd: None,
            title: None,
            updated_at: None,
        };
    };
    let first_str = |keys: &[&str]| {
        keys.iter()
            .filter_map(|k| obj.get(*k).and_then(|v| v.as_str()))
            .find(|s| !s.is_empty())
            .map(|s| s.to_string())
    };
    Metadata {
        session_id: first_str(&["session_id", "sessionId"]),
        cwd: first_str(&["cwd"]),
        title: first_str(&["title"]),
        // `created_at`/`createdAt` feed only sessionStart, which is not in
        // the wire output — parsed but not carried (mirrors `??` fallback:
        // null/absent skips to the camelCase key).
        updated_at: obj
            .get("updated_at")
            .filter(|v| !v.is_null())
            .or_else(|| obj.get("updatedAt"))
            .and_then(shared::parse_timestamp_ms),
    }
}
