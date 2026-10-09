//! Port of `ClaudeSessionParser` + `IncrementalJsonlSummary` cold-start
//! semantics. No incremental cache — every detect rebuilds, which is exactly
//! `readSessionIncremental`'s first-read result.

use crate::shared::parse_iso_ms;

const HEAD_BYTES: usize = 1024 * 1024;
const TAIL_BYTES: usize = 4 * 1024 * 1024;

/// Types that update `lastEntryType` — UI-state events must not overwrite the
/// last conversation turn (same set as CONVERSATION_ENTRY_TYPES in TS).
fn is_conversation_type(t: &str) -> bool {
    matches!(t, "user" | "assistant" | "system" | "progress" | "thinking")
}

/// O(1) folded session state — `ClaudeSummaryState` in TS.
#[derive(Debug, Default)]
pub struct SummaryState {
    seen_first_line: bool,
    past_head: bool,
    pub session_start_ms: Option<i64>,
    pub last_active_ms: Option<i64>,
    pub last_cwd: Option<String>,
    pub last_entry_type: Option<String>,
    pub is_interrupted: bool,
    pub last_user_message: Option<String>,
    pub first_user_message: Option<String>,
}

fn initial() -> SummaryState {
    SummaryState::default()
}

/// `summaryReducer.reduce` — fold one parsed JSON value (None = invalid JSON).
fn reduce(state: SummaryState, value: Option<&serde_json::Value>) -> SummaryState {
    let mut next = SummaryState {
        seen_first_line: true,
        ..state
    };
    if !state.seen_first_line {
        next.session_start_ms = value.and_then(parse_session_start);
    }
    let Some(entry) = value else {
        return next;
    };
    let entry = match entry.as_object() {
        Some(o) => o,
        None => return next,
    };

    if let Some(ts) = entry.get("timestamp").and_then(|v| v.as_str()) {
        if let Some(ms) = parse_iso_ms(ts) {
            next.last_active_ms = Some(ms);
        }
    }
    if let Some(cwd) = entry.get("cwd").and_then(|v| v.as_str()) {
        if !cwd.trim().is_empty() {
            next.last_cwd = Some(cwd.to_string());
        }
    }

    let Some(etype) = entry.get("type").and_then(|v| v.as_str()) else {
        return next;
    };
    if !is_conversation_type(etype) {
        return next;
    }
    next.last_entry_type = Some(etype.to_string());

    if etype == "user" {
        let content = entry.get("message").and_then(|m| m.get("content"));
        next.is_interrupted = content
            .and_then(|c| c.as_array())
            .map(|blocks| {
                blocks.iter().any(|b| {
                    let t = b.get("type").and_then(|v| v.as_str());
                    (t == Some("text")
                        && b.get("text")
                            .and_then(|v| v.as_str())
                            .is_some_and(|s| s.contains("[Request interrupted")))
                        || (t == Some("tool_result")
                            && b.get("content")
                                .and_then(|v| v.as_str())
                                .is_some_and(|s| s.contains("[Request interrupted")))
                })
            })
            .unwrap_or(false);

        if let Some(text) = extract_user_message_text(content) {
            next.last_user_message = Some(text.clone());
            if next.first_user_message.is_none() && !state.past_head {
                next.first_user_message = Some(text);
            }
        }
    } else {
        next.is_interrupted = false;
    }
    next
}

/// `summaryReducer.skip` — bounded cold start keeps head's session start +
/// first user message, clears every "latest" field.
fn skip(state: SummaryState) -> SummaryState {
    SummaryState {
        seen_first_line: true,
        past_head: true,
        session_start_ms: state.session_start_ms,
        first_user_message: state.first_user_message,
        is_interrupted: false,
        ..Default::default()
    }
}

/// `parseSessionStart` — first entry's `timestamp`, or `snapshot.timestamp`
/// for file-history-snapshot openers.
fn parse_session_start(v: &serde_json::Value) -> Option<i64> {
    let entry = v.as_object()?;
    let raw = entry
        .get("timestamp")
        .and_then(|v| v.as_str())
        .or_else(|| {
            entry
                .get("snapshot")
                .and_then(|s| s.get("timestamp"))
                .and_then(|v| v.as_str())
        })?;
    parse_iso_ms(raw)
}

/// `extractUserMessageText` — string | first text block → trim →
/// command-message / skill-args expansion → noise filter.
fn extract_user_message_text(content: Option<&serde_json::Value>) -> Option<String> {
    let content = content?;
    let raw: String = if let Some(s) = content.as_str() {
        s.trim().to_string()
    } else {
        let blocks = content.as_array()?;
        let mut found = None;
        for block in blocks {
            if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                    if !t.trim().is_empty() {
                        found = Some(t.trim().to_string());
                        break;
                    }
                }
            }
        }
        found?
    };
    if raw.is_empty() {
        return None;
    }
    if raw.starts_with("<command-message>") {
        return parse_command_message(&raw);
    }
    if raw.starts_with("Base directory for this skill:") {
        return skill_arguments(&raw);
    }
    if is_noise_message(&raw) {
        return None;
    }
    Some(raw)
}

/// `/\nARGUMENTS:\s*(.+)/` — text after the first ARGUMENTS marker, trimmed.
fn skill_arguments(raw: &str) -> Option<String> {
    let idx = raw.find("\nARGUMENTS:")?;
    let rest = raw[idx + "\nARGUMENTS:".len()..].trim_start();
    // `.+` stops at the next newline.
    let line = rest.split('\n').next().unwrap_or("").trim();
    if line.is_empty() {
        None
    } else {
        Some(line.to_string())
    }
}

/// `<command-message>` → "/name args" via <command-name>/<command-args> tags.
fn parse_command_message(raw: &str) -> Option<String> {
    let tag = |name: &str| -> Option<String> {
        let open = format!("<{name}>");
        let close = format!("</{name}>");
        let start = raw.find(&open)? + open.len();
        // [^<]+ — content runs to the first '<'.
        let end = raw[start..].find('<').map(|i| start + i)?;
        let inner = &raw[start..end];
        let _ = close;
        Some(inner.to_string())
    };
    let name = tag("command-name")?.trim().to_string();
    if name.is_empty() {
        return None;
    }
    let args = tag("command-args").map(|a| a.trim().to_string());
    match args {
        Some(a) if !a.is_empty() => Some(format!("{name} {a}")),
        _ => Some(name),
    }
}

/// `isNoiseMessage` — non-meaningful user intents.
fn is_noise_message(text: &str) -> bool {
    text.starts_with("[Request interrupted")
        || text == "Tool loaded."
        || text.starts_with("This session is being continued")
}

fn reduce_line(state: SummaryState, line: &str) -> SummaryState {
    if !line.bytes().any(|b| !b.is_ascii_whitespace()) {
        return state;
    }
    let parsed = serde_json::from_str::<serde_json::Value>(line).ok();
    reduce(state, parsed.as_ref())
}

/// Tentative apply of an unterminated final line — only if it parses as JSON.
fn reduce_tentative(state: SummaryState, line: &[u8]) -> SummaryState {
    let Ok(s) = std::str::from_utf8(line) else {
        return state;
    };
    if !s.bytes().any(|b| !b.is_ascii_whitespace()) {
        return state;
    }
    match serde_json::from_str::<serde_json::Value>(s) {
        Ok(v) => reduce(state, Some(&v)),
        Err(_) => state,
    }
}

/// Fold all `\n`-terminated lines in `bytes`; returns (state, index past the
/// last newline folded) so the caller can tentatively apply the remainder.
fn fold_lines(mut state: SummaryState, bytes: &[u8], skip_prefix: bool) -> (SummaryState, usize) {
    let mut i = 0usize;
    let mut discarding = skip_prefix;
    while i < bytes.len() {
        let Some(nl) = bytes[i..].iter().position(|&b| b == b'\n').map(|p| i + p) else {
            break;
        };
        if discarding {
            discarding = false;
        } else if let Ok(s) = std::str::from_utf8(&bytes[i..nl]) {
            state = reduce_line(state, s);
        } else {
            state = reduce(state, None);
        }
        i = nl + 1;
    }
    (state, i)
}

/// Byte offset just past the first '\n' at-or-after `from`; `from` itself is
/// discarded (the `tailStart - 1` trick: if that byte IS the newline the line
/// starting at tailStart still folds).
fn skip_to_newline(bytes: &[u8], from: usize) -> usize {
    bytes[from..]
        .iter()
        .position(|&b| b == b'\n')
        .map(|p| from + p + 1)
        .unwrap_or(bytes.len())
}

/// `readSessionIncremental` — full file ≤5MiB; otherwise head 1MiB + skip +
/// lines starting at/after `size-4MiB`. Returns None when unreadable.
pub fn read_session(path: &str) -> Option<SummaryState> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let size = meta.len() as usize;

    let state = if size > HEAD_BYTES + TAIL_BYTES {
        // Head: complete lines fully inside [0, HEAD_BYTES).
        let head_end = bytes[..HEAD_BYTES]
            .iter()
            .rposition(|&b| b == b'\n')
            .map(|p| p + 1)
            .unwrap_or(0);
        let (head_state, _) = fold_lines(initial(), &bytes[..head_end], false);
        let skipped = skip(head_state);
        // Tail: discard from tailStart-1 through its newline, then fold the
        // remaining complete lines.
        let tail_start = size - TAIL_BYTES;
        let from = skip_to_newline(&bytes, tail_start - 1);
        let (tail_state, consumed) = fold_lines(skipped, &bytes[from..], false);
        reduce_tentative(tail_state, &bytes[from + consumed..])
    } else {
        let (s, consumed) = fold_lines(initial(), &bytes, false);
        reduce_tentative(s, &bytes[consumed..])
    };
    Some(state)
}

/// `determineStatus` — conversation-entry → AgentStatus mapping.
pub fn determine_status(state: &SummaryState) -> &'static str {
    match state.last_entry_type.as_deref() {
        Some("user") => {
            if state.is_interrupted {
                "waiting"
            } else {
                "running"
            }
        }
        Some("progress" | "thinking") => "running",
        Some("assistant") => "waiting",
        Some("system") => "idle",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_tmp(lines: &[&str]) -> String {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "devkit-harness-test-{}-{}.jsonl",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let mut f = std::fs::File::create(&path).unwrap();
        for l in lines {
            writeln!(f, "{l}").unwrap();
        }
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn folds_user_assistant_into_waiting() {
        let p = write_tmp(&[
            r#"{"type":"user","timestamp":"2025-10-09T00:00:00.000Z","cwd":"/a","message":{"content":"fix the bug"}}"#,
            r#"{"type":"assistant","timestamp":"2025-10-09T00:01:00.000Z","message":{"content":[{"type":"text","text":"done"}]}}"#,
        ]);
        let s = read_session(&p).unwrap();
        assert_eq!(determine_status(&s), "waiting");
        assert_eq!(s.last_active_ms, Some(1759968060000));
        assert_eq!(s.last_user_message.as_deref(), Some("fix the bug"));
        assert_eq!(s.first_user_message.as_deref(), Some("fix the bug"));
        assert_eq!(s.last_cwd.as_deref(), Some("/a"));
        assert_eq!(s.session_start_ms, Some(1759968000000));
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn ui_state_entries_do_not_override_status() {
        let p = write_tmp(&[
            r#"{"type":"user","timestamp":"2025-10-09T00:00:00.000Z","message":{"content":"go"}}"#,
            r#"{"type":"permission-mode","timestamp":"2025-10-09T00:00:30.000Z"}"#,
        ]);
        let s = read_session(&p).unwrap();
        assert_eq!(determine_status(&s), "running");
        assert_eq!(s.last_active_ms, Some(1759968030000));
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn interrupted_user_maps_to_waiting() {
        let p = write_tmp(&[
            r#"{"type":"user","timestamp":"2025-10-09T00:00:00.000Z","message":{"content":[{"type":"text","text":"[Request interrupted by user]"}]}}"#,
        ]);
        let s = read_session(&p).unwrap();
        assert_eq!(determine_status(&s), "waiting");
        // The noise message is filtered from summary fields.
        assert_eq!(s.last_user_message, None);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn noise_and_command_messages() {
        let p = write_tmp(&[
            r#"{"type":"user","timestamp":"2025-10-09T00:00:00.000Z","message":{"content":"Tool loaded."}}"#,
            r#"{"type":"user","timestamp":"2025-10-09T00:00:10.000Z","message":{"content":"<command-message><command-name>commit</command-name><command-args>--amend</command-args></command-message>"}}"#,
        ]);
        let s = read_session(&p).unwrap();
        assert_eq!(s.last_user_message.as_deref(), Some("commit --amend"));
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn malformed_and_blank_lines_fold_as_undefined() {
        let p = write_tmp(&[
            "not json",
            "",
            r#"{"type":"system","timestamp":"2025-10-09T00:00:00.000Z"}"#,
        ]);
        let s = read_session(&p).unwrap();
        // First line is invalid JSON → seenFirstLine consumed, no sessionStart.
        assert_eq!(s.session_start_ms, None);
        assert_eq!(determine_status(&s), "idle");
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn unterminated_last_line_applies_tentatively() {
        let path = std::env::temp_dir().join(format!(
            "devkit-harness-tentative-{}.jsonl",
            std::process::id()
        ));
        std::fs::write(
            &path,
            "{\"type\":\"user\",\"timestamp\":\"2025-10-09T00:00:00.000Z\",\"message\":{\"content\":\"x\"}}\n{\"type\":\"assistant\",\"timestamp\":\"2025-10-09T00:02:00.000Z\"}",
        )
        .unwrap();
        let s = read_session(path.to_str().unwrap()).unwrap();
        assert_eq!(determine_status(&s), "waiting");
        std::fs::remove_file(&path).ok();
    }
}
