//! Gemini session parsing — port of `GeminiSessionParser` (detect path
//! only: `parseSession`/`buildSession`/`determineStatus`/`extractSummary`).
//!
//! Two formats: legacy `session-*.json` single documents, and
//! `session-*.jsonl` append-only logs (Gemini CLI 0.46+) replayed like
//! `loadConversationRecord`: records with `id` upsert messages by id,
//! `{"$set":{}}` merges metadata (a `$set.messages` array replaces all
//! messages), `{"$rewindTo":id}` drops that message and every later one
//! (all messages when the id is unknown), and records carrying both
//! `sessionId`/`projectHash` merge metadata.

use serde_json::Value;

use crate::shared;

const SUMMARY_FALLBACK: &str = "Gemini CLI session active";
const SUMMARY_MAX_LENGTH: usize = 120;

/// The parsed subset of a session file needed for agent mapping.
pub struct GeminiSession {
    pub session_id: String,
    pub project_path: String,
    pub summary: String,
    pub last_active_ms: i64,
    pub last_message_type: Option<String>,
}

/// `parseSession(undefined, filePath)` — stat + read + parse.
/// `None` when the file is missing/unreadable, unparseable, or lacks a
/// non-empty `sessionId`.
pub fn parse_session(file_path: &str, now_ms: i64) -> Option<GeminiSession> {
    let meta = std::fs::metadata(file_path).ok()?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    let content = std::fs::read_to_string(file_path).ok()?;
    build_session(&content, file_path, mtime_ms, now_ms)
}

fn build_session(
    content: &str,
    file_path: &str,
    mtime_ms: Option<i64>,
    now_ms: i64,
) -> Option<GeminiSession> {
    let parsed = parse_session_content(content, file_path)?;
    let session_id = parsed.session_id.filter(|s| !s.is_empty())?;

    let messages = parsed.messages;
    let last = messages.last();
    let last_active_ms = parsed
        .last_updated
        .as_ref()
        .and_then(shared::parse_timestamp_ms)
        .or_else(|| {
            last.and_then(|e| e.get("timestamp"))
                .and_then(shared::parse_timestamp_ms)
        })
        .or(mtime_ms)
        .unwrap_or(now_ms);

    GeminiSession {
        session_id,
        project_path: parsed
            .directories
            .as_ref()
            .and_then(|d| d.first())
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        summary: extract_summary(&messages),
        last_active_ms,
        last_message_type: last
            .and_then(|e| e.get("type"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    }
    .into()
}

/// `determineStatus` — idle(5min) > waiting(last turn assistant-side) > running.
pub fn determine_status(session: &GeminiSession, now_ms: i64) -> &'static str {
    if shared::is_idle(session.last_active_ms, now_ms) {
        return "idle";
    }
    match session.last_message_type.as_deref() {
        Some("gemini") | Some("assistant") => "waiting",
        _ => "running",
    }
}

/// Normalized view of either session format (`GeminiSessionFile`).
#[derive(Default)]
struct SessionDoc {
    session_id: Option<String>,
    #[allow(dead_code)]
    start_time: Option<Value>,
    last_updated: Option<Value>,
    directories: Option<Vec<Value>>,
    messages: Vec<Value>,
}

fn parse_session_content(content: &str, file_path: &str) -> Option<SessionDoc> {
    if file_path.ends_with(".jsonl") {
        replay_session_log(content)
    } else {
        parse_session_doc(content)
    }
}

fn parse_session_doc(content: &str) -> Option<SessionDoc> {
    let v: Value = serde_json::from_str(content).ok()?;
    Some(doc_from_meta(&v))
}

fn doc_from_meta(v: &Value) -> SessionDoc {
    SessionDoc {
        session_id: v.get("sessionId").and_then(|s| s.as_str()).map(String::from),
        start_time: v.get("startTime").cloned(),
        last_updated: v.get("lastUpdated").cloned(),
        directories: v.get("directories").and_then(|d| d.as_array()).cloned(),
        messages: v
            .get("messages")
            .and_then(|m| m.as_array())
            .cloned()
            .unwrap_or_default(),
    }
}

/// Insertion-ordered id→message map matching JS `Map` semantics
/// (set on an existing key keeps its position).
struct MessageMap {
    order: Vec<String>,
    entries: std::collections::HashMap<String, Value>,
}

impl MessageMap {
    fn new() -> Self {
        Self {
            order: Vec::new(),
            entries: std::collections::HashMap::new(),
        }
    }
    fn upsert(&mut self, record: &Value) {
        let Some(id) = record.get("id").and_then(|v| v.as_str()) else {
            return;
        };
        if self.entries.insert(id.to_string(), record.clone()).is_none() {
            self.order.push(id.to_string());
        }
    }
    fn upsert_all(&mut self, entries: Option<&Value>) {
        let Some(arr) = entries.and_then(|v| v.as_array()) else {
            return;
        };
        for entry in arr {
            self.upsert(entry);
        }
    }
    /// `$rewindTo`: drop the id and everything inserted after it; an
    /// unknown id clears all.
    fn rewind_to(&mut self, id: &str) {
        match self.order.iter().position(|o| o == id) {
            Some(pos) => {
                for removed in self.order.drain(pos..) {
                    self.entries.remove(&removed);
                }
            }
            None => {
                self.order.clear();
                self.entries.clear();
            }
        }
    }
    fn clear(&mut self) {
        self.order.clear();
        self.entries.clear();
    }
    fn values(self) -> Vec<Value> {
        self.order
            .into_iter()
            .filter_map(|id| self.entries.get(&id).cloned())
            .collect()
    }
}

fn replay_session_log(content: &str) -> Option<SessionDoc> {
    let mut metadata = serde_json::Map::new();
    let mut messages = MessageMap::new();

    for line in content.split('\n') {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if !record.is_object() {
            continue;
        }

        if let Some(rewind) = record.get("$rewindTo").and_then(|v| v.as_str()) {
            messages.rewind_to(rewind);
        } else if record.get("id").and_then(|v| v.as_str()).is_some() {
            messages.upsert(&record);
        } else if let Some(set) = record.get("$set").filter(|v| v.is_object()) {
            if set
                .get("messages")
                .map(|m| m.is_array())
                .unwrap_or(false)
            {
                messages.clear();
                messages.upsert_all(set.get("messages"));
            }
            for (k, v) in set.as_object().unwrap() {
                metadata.insert(k.clone(), v.clone());
            }
        } else if record
            .get("sessionId")
            .and_then(|v| v.as_str())
            .is_some()
            && record
                .get("projectHash")
                .and_then(|v| v.as_str())
                .is_some()
        {
            for (k, v) in record.as_object().unwrap() {
                metadata.insert(k.clone(), v.clone());
            }
            messages.upsert_all(record.get("messages"));
        }
    }

    // `typeof metadata.sessionId !== "string"` → null (empty passes here,
    // then fails the truthy check in buildSession — same as TS).
    if !metadata.get("sessionId").and_then(|v| v.as_str()).is_some() {
        return None;
    }
    let mut doc = doc_from_meta(&Value::Object(metadata));
    doc.messages = messages.values();
    Some(doc)
}

/// `resolveContent` — string stays, Part[] joins `text` fields.
fn resolve_content(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

/// `messageText` — displayContent wins when present.
fn message_text(entry: &Value) -> String {
    let display = resolve_content(entry.get("displayContent"));
    if !display.is_empty() {
        return display;
    }
    resolve_content(entry.get("content"))
}

/// `extractSummary` — last user turn's text, truncated; fallback constant.
fn extract_summary(messages: &[Value]) -> String {
    for entry in messages.iter().rev() {
        if entry.get("type").and_then(|v| v.as_str()) != Some("user") {
            continue;
        }
        let text = message_text(entry).trim().to_string();
        if !text.is_empty() {
            return shared::truncate(&text, SUMMARY_MAX_LENGTH);
        }
    }
    SUMMARY_FALLBACK.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replays_upsert_rewind_and_set() {
        let log = concat!(
            r#"{"sessionId":"s1","projectHash":"abc","startTime":"2026-10-09T07:00:00Z","lastUpdated":"2026-10-09T07:10:00Z","directories":["/p"]}"#,
            "\n",
            r#"{"id":"m1","type":"user","content":[{"text":"first ask"}],"timestamp":"2026-10-09T07:01:00Z"}"#,
            "\n",
            r#"{"id":"m2","type":"gemini","content":"answer","timestamp":"2026-10-09T07:02:00Z"}"#,
            "\n",
            r#"{"id":"m3","type":"user","content":[{"text":"later ask"}],"timestamp":"2026-10-09T07:05:00Z"}"#,
            "\n",
            r#"{"$rewindTo":"m3"}"#,
            "\n",
            r#"{"id":"m3b","type":"gemini","displayContent":"rewritten","timestamp":"2026-10-09T07:06:00Z"}"#,
            "\n"
        );
        let dir = std::env::temp_dir().join(format!("gem-log-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("session-a.jsonl");
        std::fs::write(&f, log).unwrap();
        let s = parse_session(f.to_str().unwrap(), 0).unwrap();
        assert_eq!(s.session_id, "s1");
        assert_eq!(s.project_path, "/p");
        // rewind dropped m3; summary falls back to m1's text
        assert_eq!(s.summary, "first ask");
        assert_eq!(s.last_message_type.as_deref(), Some("gemini"));
        assert_eq!(s.last_active_ms, 1791529800000); // lastUpdated 07:10
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn legacy_json_document() {
        let dir = std::env::temp_dir().join(format!("gem-doc-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("session-b.json");
        std::fs::write(
            &f,
            r#"{"sessionId":"s2","projectHash":"h","messages":[{"type":"user","content":[{"text":"hi"}]}],"directories":["/d"],"lastUpdated":"2026-10-09T07:00:00Z"}"#,
        )
        .unwrap();
        let s = parse_session(f.to_str().unwrap(), 0).unwrap();
        assert_eq!(s.session_id, "s2");
        assert_eq!(s.summary, "hi");
        assert_eq!(s.last_message_type.as_deref(), Some("user"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_session_id_is_none() {
        let dir = std::env::temp_dir().join(format!("gem-noid-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("session-c.jsonl");
        std::fs::write(&f, r#"{"id":"m1","type":"user"}"#).unwrap();
        assert!(parse_session(f.to_str().unwrap(), 0).is_none());
        std::fs::remove_dir_all(&dir).ok();
    }
}
