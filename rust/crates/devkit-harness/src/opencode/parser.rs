//! OpenCodeSessionParser port — `getSessionStats` queries over
//! message/part rows (detectAgents path only).

use rusqlite::types::Value;
use rusqlite::Connection;

/// `OpenCodeSessionStats` — last role, heartbeat, completion flag, first
/// user text (the summary). TS also reads `lastAssistantErrored`, but it
/// is never consumed by `determineStatus`, so it is dropped here.
#[derive(Default)]
pub struct SessionStats {
    pub last_role: Option<String>,
    pub last_time_updated_ms: i64,
    pub last_assistant_completed: bool,
    pub summary: String,
}

/// A first user-text row: absent, a string, or a non-string value (whose
/// `.trim()` would throw in JS → the catch resets all stats).
enum FirstText {
    Absent,
    Text(String),
    NonString,
}

/// `getSessionStats` — message.last by time_created; heartbeat
/// MAX(time_updated); last assistant completion/error flags; first user
/// text part. The TS body is a single try/catch: any query error — or a
/// non-string first text (`.trim` throws) — yields EMPTY_STATS.
pub fn get_session_stats(db: &Connection, session_id: &str) -> SessionStats {
    stats_inner(db, session_id).unwrap_or_default()
}

fn stats_inner(db: &Connection, session_id: &str) -> Option<SessionStats> {
    let last = db
        .query_row(
            "SELECT json_extract(data, '$.role') AS role, time_updated
             FROM message WHERE session_id = ?1
             ORDER BY time_created DESC LIMIT 1",
            [session_id],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, i64>(1).unwrap_or(0),
                ))
            },
        )
        .ok();

    let heartbeat: Option<i64> = db
        .query_row(
            "SELECT MAX(time_updated) FROM message WHERE session_id = ?1",
            [session_id],
            |r| r.get::<_, Option<i64>>(0),
        )
        .ok()?;

    let last_assistant = db
        .query_row(
            "SELECT json_extract(data, '$.time.completed'),
                    json_extract(data, '$.time.error')
             FROM message WHERE session_id = ?1
               AND json_extract(data, '$.role') = 'assistant'
             ORDER BY time_created DESC LIMIT 1",
            [session_id],
            |r| {
                // `x != null` — json_extract returns SQL NULL for a missing
                // path; any other value (incl. 0/false/"") counts present.
                let present = |i: usize| {
                    !matches!(r.get_ref(i), Ok(rusqlite::types::ValueRef::Null) | Err(_))
                };
                Ok((present(0), present(1)))
            },
        )
        .ok();

    let first_text = db
        .query_row(
            "SELECT json_extract(p.data, '$.text') AS text
             FROM part p JOIN message m ON p.message_id = m.id
             WHERE p.session_id = ?1
               AND json_extract(m.data, '$.role') = 'user'
               AND json_extract(p.data, '$.type') = 'text'
               AND json_extract(p.data, '$.text') IS NOT NULL
             ORDER BY p.time_created ASC LIMIT 1",
            [session_id],
            |r| {
                Ok(match r.get::<_, Value>(0)? {
                    Value::Text(t) => FirstText::Text(t.trim().to_string()),
                    _ => FirstText::NonString,
                })
            },
        )
        .ok()
        .unwrap_or(FirstText::Absent);
    if matches!(first_text, FirstText::NonString) {
        return None;
    }

    let (last_role, last_time_updated) = last
        .map(|(role, t)| (role, Some(t)))
        .unwrap_or((None, None));

    Some(SessionStats {
        last_role,
        last_time_updated_ms: heartbeat.or(last_time_updated).unwrap_or(0),
        last_assistant_completed: last_assistant.map(|(c, _)| c).unwrap_or(false),
        summary: match first_text {
            FirstText::Text(t) => t,
            _ => String::new(),
        },
    })
}
