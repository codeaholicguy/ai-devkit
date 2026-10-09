//! DevinSessionParser port — `getSessionStats` over `message_nodes` +
//! `prompt_history` (detect path only).

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;

/// `SUMMARY_MAX_LENGTH` in shared.ts.
const SUMMARY_MAX_LENGTH: usize = 120;

/// `DevinSessionStats` — frontier message role, heartbeat (ms), summary.
#[derive(Default)]
pub struct SessionStats {
    pub last_role: Option<String>,
    pub last_time_updated_ms: i64,
    pub summary: String,
}

/// `parseChatMessage` — JSON.parse tolerantly (null on bad rows).
fn parse_chat_message(raw: &str) -> Option<serde_json::Value> {
    serde_json::from_str::<serde_json::Value>(raw).ok()
}

/// `getSessionStats` — outer single try/catch → EMPTY_STATS on any error;
/// `userPrompt` failures are caught inside it (prompt_history falls
/// through to the message_nodes scan).
pub fn get_session_stats(db: &Connection, session_id: &str) -> SessionStats {
    stats_inner(db, session_id).unwrap_or_default()
}

fn stats_inner(db: &Connection, session_id: &str) -> Option<SessionStats> {
    let frontier_role = db
        .query_row(
            "SELECT chat_message FROM message_nodes
             WHERE session_id = ?1 ORDER BY node_id DESC LIMIT 1",
            [session_id],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| parse_chat_message(&raw))
        .and_then(|m| m.get("role")?.as_str().map(str::to_string));

    let heartbeat: Option<i64> = db
        .query_row(
            "SELECT MAX(created_at) FROM message_nodes WHERE session_id = ?1",
            [session_id],
            |r| r.get::<_, Option<i64>>(0),
        )
        .ok()?;

    Some(SessionStats {
        last_role: frontier_role,
        // `(maxCreated ?? 0) * 1000` — seconds → ms.
        last_time_updated_ms: heartbeat.unwrap_or(0).saturating_mul(1000),
        summary: last_user_prompt(db, session_id),
    })
}

/// `getLastUserPrompt` — `userPrompt(db, sessionId, "DESC")`: newest
/// typed prompt, `prompt_history` first (non-shell, non-slash), then a
/// bounded `is_user_input` message_nodes scan.
fn last_user_prompt(db: &Connection, session_id: &str) -> String {
    user_prompt(db, session_id, "DESC")
}

/// `userPrompt` — two independent try/catches. A non-string `content`
/// would throw `.trim()` in JS inside the first try → caught → falls to
/// the node scan, so non-Text values are treated as "not found" here.
fn user_prompt(db: &Connection, session_id: &str, direction: &str) -> String {
    let content = db
        .query_row(
            &format!(
                "SELECT content FROM prompt_history
                 WHERE session_id = ?1 AND is_shell = 0 AND content NOT LIKE '/%'
                 ORDER BY timestamp {direction} LIMIT 1"
            ),
            [session_id],
            |r| r.get::<_, SqlValue>(0),
        )
        .ok();
    if let Some(SqlValue::Text(t)) = content {
        let trimmed = t.trim();
        if !trimmed.is_empty() {
            return crate::shared::truncate(trimmed, SUMMARY_MAX_LENGTH);
        }
    }

    let rows = db
        .prepare(
            &format!(
                "SELECT chat_message FROM message_nodes
                 WHERE session_id = ?1 AND json_extract(chat_message, '$.role') = 'user'
                 ORDER BY node_id {direction} LIMIT 8"
            ),
        )
        .and_then(|mut stmt| {
            stmt.query_map([session_id], |r| r.get::<_, String>(0))
                .map(|m| m.flatten().collect::<Vec<String>>())
        })
        .unwrap_or_default();
    for raw in rows {
        let Some(msg) = parse_chat_message(&raw) else {
            continue;
        };
        // `metadata?.is_user_input !== false` — missing/non-object
        // metadata counts as user input; only literal `false` skips.
        let is_user_input = !matches!(
            msg.pointer("/metadata/is_user_input"),
            Some(serde_json::Value::Bool(false))
        );
        if !is_user_input {
            continue;
        }
        if let Some(text) = msg.get("content").and_then(|c| c.as_str()) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return crate::shared::truncate(trimmed, SUMMARY_MAX_LENGTH);
            }
        }
    }
    String::new()
}
