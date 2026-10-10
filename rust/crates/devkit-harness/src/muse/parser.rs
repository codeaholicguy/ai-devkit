//! Port of `MuseSessionParser` — the bounded framed-JSONL fold behind
//! session summaries and status. Conversation reads, the incremental cache,
//! display names, and model ids are not ported (the daemon only needs
//! detection fields).
//!
//! Each `session.jsonl` line is a frame: a direct inner record, a
//! `{ record_json }` envelope, or a `retained_frame` wrapper whose
//! `children[]` carry `record_json` strings. Inner records dispatch on
//! `payload_type`; `recorded_at` is microseconds.

use crate::shared;
use serde_json::Value;

/// Fold state (the summary fields the daemon consumes; the first prompt is
/// history-listing concern and lives in TS only).
#[derive(Default)]
struct Summary {
    seen_first_line: bool,
    workspace_root: Option<String>,
    last_signal: Option<&'static str>,
    last_user_message: Option<String>,
    last_active_ms: Option<i64>,
}

/// `MuseSession` (detection-relevant fields only).
pub struct Session {
    pub session_id: String,
    pub project_path: String,
    pub transcript_path: String,
    pub last_active_ms: i64,
    pub last_signal: Option<&'static str>,
    pub last_user_message: Option<String>,
}

/// `recorded_at` microseconds → epoch ms (mirrors `museTimestampToMs`).
fn recorded_at_ms(value: &Value) -> Option<i64> {
    let v = value.as_f64()?;
    if !v.is_finite() || v < 0.0 {
        return None;
    }
    Some(if v >= 1_000_000_000_000_000.0 {
        (v / 1000.0).floor() as i64
    } else {
        v as i64
    })
}

/// Conversation-relevant shape of one inner record — both the fold and (in
/// TS) the message reader switch on this instead of re-matching shapes.
#[derive(PartialEq, Eq)]
enum RecordKind {
    Metadata,
    UserIntent,
    Assistant,
    ApprovalStarted,
    ApprovalSettled,
    InputRequested,
    InputSettled,
    RunTerminal,
    Other,
}

fn classify(record: &serde_json::Map<String, Value>) -> RecordKind {
    let payload = match record.get("payload").and_then(|p| p.as_object()) {
        Some(p) => p,
        None => return RecordKind::Other,
    };
    match record.get("payload_type").and_then(|t| t.as_str()) {
        Some("runtime.session.metadata") => return RecordKind::Metadata,
        Some("runtime.user_intent.accepted") | Some("runtime.user_intent.materialized") => {
            return RecordKind::UserIntent
        }
        Some("runtime.session") => {}
        _ => return RecordKind::Other,
    }
    let event = match payload.get("event").and_then(|e| e.as_object()) {
        Some(e) => e,
        None => return RecordKind::Other,
    };
    let kind = event.get("kind").and_then(|k| k.as_str()).unwrap_or("");
    let is_run = payload.get("kind").and_then(|k| k.as_str()) == Some("run");
    if is_run {
        match kind {
            "assistant_message_committed" => return RecordKind::Assistant,
            "terminal" => return RecordKind::RunTerminal,
            _ => {}
        }
    }
    match kind {
        "approval_wait.effect.started" => RecordKind::ApprovalStarted,
        "approval_wait.effect.terminal" => RecordKind::ApprovalSettled,
        "user_input_prompt_requested" => RecordKind::InputRequested,
        "user_input_prompt_settled" => RecordKind::InputSettled,
        _ => RecordKind::Other,
    }
}

/// Workspace root from one inner record's metadata payload, if present —
/// the one rule shared by the fold and the locator's bounded head-scan.
pub(crate) fn record_workspace_root(record: &serde_json::Map<String, Value>) -> Option<String> {
    if classify(record) != RecordKind::Metadata {
        return None;
    }
    record
        .get("payload")?
        .get("record")?
        .get("workspace_root")?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// Unwrap one parsed frame into owned inner records.
pub(crate) fn unwrap_outer_owned(outer: &Value) -> Vec<serde_json::Map<String, Value>> {
    let Some(obj) = outer.as_object() else {
        return Vec::new();
    };
    if let Some(s) = obj.get("record_json").and_then(|v| v.as_str()) {
        return serde_json::from_str::<Value>(s)
            .ok()
            .and_then(|v| v.as_object().cloned())
            .into_iter()
            .collect();
    }
    if let Some(children) = obj.get("children").and_then(|v| v.as_array()) {
        return children
            .iter()
            .filter_map(|c| c.get("record_json")?.as_str())
            .filter_map(|s| serde_json::from_str::<Value>(s).ok())
            .filter_map(|v| v.as_object().cloned())
            .collect();
    }
    vec![obj.clone()]
}

fn non_empty_text(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// `{ kind: "text", text }` strings from intent/model message blocks.
fn collect_text_blocks(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|b| {
                if b.get("kind").and_then(|k| k.as_str()) == Some("text") {
                    non_empty_text(b.get("text"))
                } else {
                    None
                }
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// User turn text: `refill_blocks` first, then `model_messages[].content`.
fn intent_text(payload: &serde_json::Map<String, Value>) -> Option<String> {
    let refill = collect_text_blocks(payload.get("refill_blocks"));
    if !refill.is_empty() {
        return Some(refill.join("\n"));
    }
    let mut parts = Vec::new();
    if let Some(Value::Array(messages)) = payload.get("model_messages") {
        for message in messages {
            if let Some(obj) = message.as_object() {
                parts.extend(collect_text_blocks(obj.get("content")));
            }
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

/// `readSession` — stat must succeed; unreadable transcript → None, empty
/// summary (no signal, no message) → None, mirroring the TS null contract.
pub fn read_session(session_id: &str, transcript_path: &str, default_cwd: &str) -> Option<Session> {
    let meta = std::fs::metadata(transcript_path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let state =
        shared::fold_jsonl_bounded(transcript_path, Summary::default(), reduce, |_: Summary| {
            Summary::default()
        })
        .unwrap_or_default();
    // Null contract mirrors TS `readSession`: None only when nothing folded
    // (missing/unreadable/empty file). Signal-less transcripts still map —
    // to UNKNOWN-status agents, not process-only rows.
    if !state.seen_first_line {
        return None;
    }
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let project_path = state
        .workspace_root
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default_cwd.to_string());
    Some(Session {
        session_id: session_id.to_string(),
        project_path,
        transcript_path: transcript_path.to_string(),
        last_active_ms: state.last_active_ms.unwrap_or(mtime),
        last_signal: state.last_signal,
        last_user_message: state.last_user_message,
    })
}

/// `determineStatus` — last signal wins; no idle override (TS parity: the
/// mapper uses the parser status directly).
pub fn status(session: &Session) -> &'static str {
    match session.last_signal {
        Some("user-intent") => "running",
        Some("assistant") | Some("approval-wait") | Some("input-requested") => "waiting",
        Some("run-terminal") => "idle",
        _ => "unknown",
    }
}

/// Summary fold over one parsed frame value.
fn reduce(mut state: Summary, value: Option<&Value>) -> Summary {
    let Some(outer) = value else {
        state.seen_first_line = true;
        return state;
    };
    state.seen_first_line = true;
    for record in unwrap_outer_owned(outer) {
        fold_record(&mut state, &record);
    }
    state
}

fn fold_record(state: &mut Summary, record: &serde_json::Map<String, Value>) {
    if let Some(ms) = record.get("recorded_at").and_then(recorded_at_ms) {
        state.last_active_ms = Some(ms);
    }
    let Some(payload) = record.get("payload").and_then(|p| p.as_object()) else {
        return;
    };
    match classify(record) {
        RecordKind::Metadata => {
            if let Some(root) = record_workspace_root(record) {
                state.workspace_root = Some(root);
            }
        }
        RecordKind::UserIntent => {
            state.last_signal = Some("user-intent");
            if let Some(text) = intent_text(payload) {
                state.last_user_message = Some(text);
            }
        }
        RecordKind::Assistant => state.last_signal = Some("assistant"),
        RecordKind::ApprovalStarted => state.last_signal = Some("approval-wait"),
        RecordKind::ApprovalSettled => {
            if state.last_signal == Some("approval-wait") {
                state.last_signal = Some("assistant");
            }
        }
        RecordKind::InputRequested => state.last_signal = Some("input-requested"),
        RecordKind::InputSettled => {
            if state.last_signal == Some("input-requested") {
                state.last_signal = Some("assistant");
            }
        }
        RecordKind::RunTerminal => state.last_signal = Some("run-terminal"),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(inner: serde_json::Value) -> String {
        serde_json::to_string(&inner).unwrap()
    }

    fn intent(text: &str) -> serde_json::Value {
        serde_json::json!({
            "schema_version": 1,
            "sequence": 2,
            "recorded_at": 1791640525332173i64,
            "record_type": "event",
            "payload_type": "runtime.user_intent.accepted",
            "payload": { "refill_blocks": [{ "kind": "text", "text": text }] },
        })
    }

    #[test]
    fn unwraps_envelopes_and_children() {
        let wrapped = serde_json::json!({ "record_json": frame(intent("a")) });
        assert_eq!(unwrap_outer_owned(&wrapped).len(), 1);
        let retained = serde_json::json!({
            "retained_frame": "x",
            "children": [{ "record_json": frame(intent("b")) }],
        });
        assert_eq!(unwrap_outer_owned(&retained).len(), 1);
        assert!(unwrap_outer_owned(&serde_json::json!({"a": 1})).len() == 1);
        assert!(unwrap_outer_owned(&serde_json::Value::Null).is_empty());
    }

    #[test]
    fn microsecond_timestamps_normalize_to_ms() {
        assert_eq!(
            recorded_at_ms(&serde_json::json!(1791640525332173i64)),
            Some(1791640525332)
        );
        assert_eq!(
            recorded_at_ms(&serde_json::json!(1791640525i64)),
            Some(1791640525)
        );
        assert_eq!(recorded_at_ms(&serde_json::Value::Null), None);
    }

    #[test]
    fn intent_and_status_signals_fold() {
        // Bare inner records fold directly…
        let state = reduce(Summary::default(), Some(&intent("hello")));
        assert_eq!(state.last_user_message.as_deref(), Some("hello"));
        // …and so do envelope frames.
        let wrapped = serde_json::json!({ "record_json": frame(intent("hi")) });
        let state = reduce(Summary::default(), Some(&wrapped));
        assert_eq!(state.last_user_message.as_deref(), Some("hi"));
        assert_eq!(state.last_signal, Some("user-intent"));
        assert_eq!(state.last_active_ms, Some(1791640525332));

        let assistant = serde_json::json!({
            "recorded_at": 1791640525332174i64,
            "payload_type": "runtime.session",
            "payload": {
                "kind": "run",
                "event": { "kind": "assistant_message_committed", "text": "done" },
            },
        });
        let state = reduce(state, Some(&assistant));
        assert_eq!(state.last_signal, Some("assistant"));
        let session = super::Session {
            session_id: "s".into(),
            project_path: "/p".into(),
            transcript_path: "t".into(),
            last_active_ms: 1,
            last_signal: state.last_signal,
            last_user_message: state.last_user_message,
        };
        assert_eq!(super::status(&session), "waiting");
    }
}
