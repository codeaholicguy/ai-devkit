//! Daemon-owned one-shot scheduled sends. Persisted in `daemon.db`, delivered
//! by devkitd's scheduler task with fire-time target resolution.
use super::{chrono_now, iso8601_utc, Store};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Read;
use ts_rs::TS;

/// Hard cap on scheduled message payload (bytes). Safely under Linux's 128 KiB
/// single-argv `MAX_ARG_STRLEN` (for `herdr agent prompt`) and PTY paste buffers.
pub const MAX_SCHEDULE_MESSAGE_BYTES: usize = 64 * 1024;
pub const MAX_SCHEDULE_AGENT_NAME_CHARS: usize = 128;
pub const DEFAULT_SCHEDULE_LIST_LIMIT: u32 = 50;
pub const MAX_SCHEDULE_LIST_LIMIT: u32 = 500;
const TERMINAL_RETENTION_MAX: i64 = 1000;
const TERMINAL_RETENTION_AGE_MS: i64 = 30 * 24 * 60 * 60 * 1000;

const VALID_STATUSES: &[&str] = &["pending", "sent", "late", "cancelled", "failed", "skipped"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledSend {
    pub id: String,
    pub agent_name: String,
    pub message: String,
    pub due_at: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub failure_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub created_by: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub sent_at: Option<String>,
}

#[derive(Debug, Default, Clone)]
pub struct ScheduleFilter {
    pub status: Option<String>,
    pub agent_name: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug)]
pub struct ScheduleError {
    pub code: &'static str,
    pub message: String,
    pub details: Value,
}

impl std::fmt::Display for ScheduleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ScheduleError {}

impl From<rusqlite::Error> for ScheduleError {
    fn from(err: rusqlite::Error) -> Self {
        schedule_error("storage", err.to_string(), json!({}))
    }
}

fn schedule_error(code: &'static str, message: impl Into<String>, details: Value) -> ScheduleError {
    ScheduleError {
        code,
        message: message.into(),
        details,
    }
}

fn invalid_params(message: impl Into<String>) -> ScheduleError {
    schedule_error("invalid_params", message, json!({}))
}

/// Strict RFC3339 / ISO-8601 timestamp with explicit timezone (`Z` or `±HH:MM`)
/// parsed into UTC epoch milliseconds without pulling in `chrono`.
pub fn parse_iso8601_utc_ms(input: &str) -> Result<i64, ScheduleError> {
    let s = input.trim();
    let err = || {
        invalid_params(format!(
            "Invalid timestamp \"{input}\". Expected ISO-8601 with timezone (e.g. 2026-11-25T21:00:00Z)."
        ))
    };

    let (date_part, rest) = s.split_once(['T', 't']).ok_or_else(err)?;
    let mut date_parts = date_part.split('-');
    let year: i32 = date_parts
        .next()
        .filter(|p| p.len() == 4 && p.bytes().all(|b| b.is_ascii_digit()))
        .ok_or_else(err)?
        .parse()
        .map_err(|_| err())?;
    let month: u32 = date_parts
        .next()
        .filter(|p| p.len() == 2 && p.bytes().all(|b| b.is_ascii_digit()))
        .ok_or_else(err)?
        .parse()
        .map_err(|_| err())?;
    let day: u32 = date_parts
        .next()
        .filter(|p| p.len() == 2 && p.bytes().all(|b| b.is_ascii_digit()))
        .ok_or_else(err)?
        .parse()
        .map_err(|_| err())?;
    if date_parts.next().is_some() {
        return Err(err());
    }
    if !(1970..=9999).contains(&year) || !(1..=12).contains(&month) {
        return Err(err());
    }
    if day < 1 || day > days_in_month(year, month) {
        return Err(err());
    }

    // Split timezone suffix (`Z`/`z` or `±HH:MM`) from time portion.
    let (time_part, offset_secs): (&str, i64) = if let Some(t) = rest.strip_suffix(['Z', 'z']) {
        (t, 0)
    } else {
        let tz_pos = rest.rfind(['+', '-']).ok_or_else(err)?;
        let (t, tz) = rest.split_at(tz_pos);
        let sign: i64 = if tz.starts_with('+') { 1 } else { -1 };
        let tz_body = &tz[1..];
        let (tz_h_s, tz_m_s) = tz_body.split_once(':').ok_or_else(err)?;
        if tz_h_s.len() != 2
            || tz_m_s.len() != 2
            || !tz_h_s.bytes().all(|b| b.is_ascii_digit())
            || !tz_m_s.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(err());
        }
        let tz_h: i64 = tz_h_s.parse().map_err(|_| err())?;
        let tz_m: i64 = tz_m_s.parse().map_err(|_| err())?;
        if tz_h > 23 || tz_m > 59 {
            return Err(err());
        }
        (t, sign * (tz_h * 3600 + tz_m * 60))
    };

    // Split optional fractional seconds.
    let (hms, ms): (&str, i64) = match time_part.split_once('.') {
        Some((hms, frac)) => {
            if frac.is_empty() || frac.len() > 9 || !frac.bytes().all(|b| b.is_ascii_digit()) {
                return Err(err());
            }
            let mut digits = [b'0'; 3];
            for (i, b) in frac.bytes().take(3).enumerate() {
                digits[i] = b;
            }
            let ms_str = std::str::from_utf8(&digits).map_err(|_| err())?;
            (hms, ms_str.parse::<i64>().map_err(|_| err())?)
        }
        None => (time_part, 0),
    };

    let mut t_parts = hms.split(':');
    let hour: u32 = t_parts
        .next()
        .filter(|p| p.len() == 2 && p.bytes().all(|b| b.is_ascii_digit()))
        .ok_or_else(err)?
        .parse()
        .map_err(|_| err())?;
    let minute: u32 = t_parts
        .next()
        .filter(|p| p.len() == 2 && p.bytes().all(|b| b.is_ascii_digit()))
        .ok_or_else(err)?
        .parse()
        .map_err(|_| err())?;
    let second: u32 = match t_parts.next() {
        Some(sec_s) => {
            if sec_s.len() != 2 || !sec_s.bytes().all(|b| b.is_ascii_digit()) {
                return Err(err());
            }
            sec_s.parse().map_err(|_| err())?
        }
        None => 0,
    };
    if t_parts.next().is_some() || hour > 23 || minute > 59 || second > 59 {
        return Err(err());
    }

    let days = days_from_civil(year, month, day);
    let local_secs = days * 86_400 + (hour as i64) * 3600 + (minute as i64) * 60 + (second as i64);
    let utc_secs = local_secs - offset_secs;
    let total_ms = utc_secs
        .checked_mul(1000)
        .and_then(|v| v.checked_add(ms))
        .ok_or_else(err)?;
    if total_ms < 0 {
        return Err(err());
    }
    Ok(total_ms)
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y } as i64;
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = ((m as i64) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + (d as i64) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn generate_schedule_id() -> Result<String, ScheduleError> {
    let mut b = [0u8; 4];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut b))
        .map_err(|e| schedule_error("storage", format!("failed to generate id: {e}"), json!({})))?;
    Ok(format!(
        "sch_{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3]
    ))
}

fn row_to_schedule(r: &rusqlite::Row<'_>) -> rusqlite::Result<ScheduledSend> {
    Ok(ScheduledSend {
        id: r.get(0)?,
        agent_name: r.get(1)?,
        message: r.get(2)?,
        due_at: r.get(3)?,
        status: r.get(4)?,
        failure_reason: r.get(5)?,
        created_by: r.get(6)?,
        created_at: r.get(7)?,
        sent_at: r.get(8)?,
    })
}

fn fetch_schedule(conn: &Connection, id: &str) -> Result<Option<ScheduledSend>, ScheduleError> {
    conn.query_row(
        "SELECT id, agent_name, message, due_at, status, failure_reason, created_by, created_at, sent_at
         FROM scheduled_sends WHERE id = ?1",
        [id],
        row_to_schedule,
    )
    .optional()
    .map_err(Into::into)
}

fn prune_terminal_in_conn(
    conn: &Connection,
    keep_max: i64,
    now_ms: i64,
) -> rusqlite::Result<usize> {
    let cutoff = iso8601_utc(now_ms.saturating_sub(TERMINAL_RETENTION_AGE_MS));
    let mut deleted = conn.execute(
        "DELETE FROM scheduled_sends WHERE status != 'pending' AND created_at < ?1",
        [cutoff],
    )?;
    deleted += conn.execute(
        "DELETE FROM scheduled_sends
         WHERE status != 'pending'
           AND id NOT IN (
               SELECT id FROM scheduled_sends
               WHERE status != 'pending'
               ORDER BY created_at DESC, due_at DESC, id DESC
               LIMIT ?1
           )",
        [keep_max.max(0)],
    )?;
    Ok(deleted)
}

impl Store {
    pub(super) fn init_schedules(conn: &Connection) -> rusqlite::Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS scheduled_sends (
                id             TEXT PRIMARY KEY,
                agent_name     TEXT NOT NULL,
                message        TEXT NOT NULL,
                due_at         TEXT NOT NULL,
                status         TEXT NOT NULL CHECK(status IN ('pending','sent','late','cancelled','failed','skipped')),
                failure_reason TEXT,
                created_by     TEXT,
                created_at     TEXT NOT NULL,
                sent_at        TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_scheduled_sends_pending_due
                ON scheduled_sends(due_at, id) WHERE status = 'pending';
            CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due
                ON scheduled_sends(due_at DESC, id DESC);",
        )
    }

    pub fn create_schedule(
        &self,
        agent_name: &str,
        message: &str,
        due_at: &str,
        created_by: Option<&str>,
    ) -> Result<ScheduledSend, ScheduleError> {
        self.create_schedule_at(agent_name, message, due_at, created_by, chrono_now())
    }

    pub fn create_schedule_at(
        &self,
        agent_name: &str,
        message: &str,
        due_at: &str,
        created_by: Option<&str>,
        now_ms: i64,
    ) -> Result<ScheduledSend, ScheduleError> {
        let agent_name = agent_name.trim();
        if agent_name.is_empty() || agent_name.chars().count() > MAX_SCHEDULE_AGENT_NAME_CHARS {
            return Err(invalid_params(format!(
                "Invalid agentName: must be 1–{MAX_SCHEDULE_AGENT_NAME_CHARS} non-blank characters."
            )));
        }
        if message.trim().is_empty() {
            return Err(invalid_params("Message cannot be blank."));
        }
        if message.len() > MAX_SCHEDULE_MESSAGE_BYTES {
            return Err(invalid_params(format!(
                "Message exceeds maximum size of {MAX_SCHEDULE_MESSAGE_BYTES} bytes."
            )));
        }
        let due_ms = parse_iso8601_utc_ms(due_at)?;
        if due_ms <= now_ms {
            return Err(invalid_params("dueAt must be in the future."));
        }
        let due_iso = iso8601_utc(due_ms);
        let created_iso = iso8601_utc(now_ms);
        let created_by = created_by
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned);

        let conn = self.conn.lock().unwrap();
        let mut id = String::new();
        for _ in 0..5 {
            let candidate = generate_schedule_id()?;
            let inserted = conn.execute(
                "INSERT OR IGNORE INTO scheduled_sends
                    (id, agent_name, message, due_at, status, failure_reason, created_by, created_at, sent_at)
                 VALUES (?1, ?2, ?3, ?4, 'pending', NULL, ?5, ?6, NULL)",
                params![candidate, agent_name, message, due_iso, created_by, created_iso],
            )?;
            if inserted == 1 {
                id = candidate;
                break;
            }
        }
        if id.is_empty() {
            return Err(schedule_error(
                "storage",
                "Failed to allocate unique schedule id.",
                json!({}),
            ));
        }
        let _ = prune_terminal_in_conn(&conn, TERMINAL_RETENTION_MAX, now_ms);
        Ok(ScheduledSend {
            id,
            agent_name: agent_name.to_owned(),
            message: message.to_owned(),
            due_at: due_iso,
            status: "pending".into(),
            failure_reason: None,
            created_by,
            created_at: created_iso,
            sent_at: None,
        })
    }

    pub fn get_schedule(&self, id: &str) -> Result<Option<ScheduledSend>, ScheduleError> {
        let conn = self.conn.lock().unwrap();
        fetch_schedule(&conn, id.trim())
    }

    pub fn list_schedules(
        &self,
        filter: &ScheduleFilter,
    ) -> Result<Vec<ScheduledSend>, ScheduleError> {
        if let Some(status) = filter.status.as_deref() {
            if !VALID_STATUSES.contains(&status) {
                return Err(invalid_params(format!(
                    "Invalid status \"{status}\". Allowed: {}.",
                    VALID_STATUSES.join(", ")
                )));
            }
        }
        let limit = filter
            .limit
            .unwrap_or(DEFAULT_SCHEDULE_LIST_LIMIT)
            .clamp(1, MAX_SCHEDULE_LIST_LIMIT) as i64;
        let agent_name = filter
            .agent_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());

        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, agent_name, message, due_at, status, failure_reason, created_by, created_at, sent_at
             FROM scheduled_sends
             WHERE (?1 IS NULL OR status = ?1)
               AND (?2 IS NULL OR agent_name = ?2)
             ORDER BY
               CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC,
               CASE WHEN status = 'pending' THEN due_at END ASC,
               due_at DESC,
               id ASC
             LIMIT ?3",
        )?;
        let rows = stmt
            .query_map(params![filter.status, agent_name, limit], row_to_schedule)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn cancel_schedule(&self, id: &str) -> Result<ScheduledSend, ScheduleError> {
        let id = id.trim();
        if id.is_empty() {
            return Err(invalid_params("Schedule id cannot be blank."));
        }
        let conn = self.conn.lock().unwrap();
        let updated = conn.execute(
            "UPDATE scheduled_sends SET status = 'cancelled' WHERE id = ?1 AND status = 'pending'",
            [id],
        )?;
        let Some(row) = fetch_schedule(&conn, id)? else {
            return Err(schedule_error(
                "not_found",
                format!("Scheduled send \"{id}\" not found."),
                json!({ "id": id }),
            ));
        };
        if updated == 0 {
            return Err(schedule_error(
                "not_cancellable",
                format!(
                    "Cannot cancel scheduled send \"{id}\": status is \"{}\".",
                    row.status
                ),
                json!({ "id": id, "status": row.status }),
            ));
        }
        Ok(row)
    }

    /// Pending sends whose `due_at <= now_ms`, deterministically ordered by
    /// `(due_at ASC, id ASC)`.
    pub fn due_pending_schedules(&self, now_ms: i64) -> Result<Vec<ScheduledSend>, ScheduleError> {
        let now_iso = iso8601_utc(now_ms);
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, agent_name, message, due_at, status, failure_reason, created_by, created_at, sent_at
             FROM scheduled_sends
             WHERE status = 'pending' AND due_at <= ?1
             ORDER BY due_at ASC, id ASC",
        )?;
        let rows = stmt
            .query_map([now_iso], row_to_schedule)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn mark_schedule_delivered(
        &self,
        id: &str,
        sent_at_ms: i64,
        late: bool,
    ) -> Result<bool, ScheduleError> {
        let status = if late { "late" } else { "sent" };
        let sent_iso = iso8601_utc(sent_at_ms);
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE scheduled_sends SET status = ?2, sent_at = ?3, failure_reason = NULL
             WHERE id = ?1 AND status = 'pending'",
            params![id, status, sent_iso],
        )?;
        Ok(n == 1)
    }

    pub fn mark_schedule_failed(&self, id: &str, reason: &str) -> Result<bool, ScheduleError> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE scheduled_sends SET status = 'failed', failure_reason = ?2, sent_at = NULL
             WHERE id = ?1 AND status = 'pending'",
            params![id, reason],
        )?;
        Ok(n == 1)
    }

    pub fn mark_schedule_skipped(&self, id: &str, reason: &str) -> Result<bool, ScheduleError> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE scheduled_sends SET status = 'skipped', failure_reason = ?2, sent_at = NULL
             WHERE id = ?1 AND status = 'pending'",
            params![id, reason],
        )?;
        Ok(n == 1)
    }

    pub fn prune_terminal_schedules(
        &self,
        keep_max: i64,
        now_ms: i64,
    ) -> Result<usize, ScheduleError> {
        let conn = self.conn.lock().unwrap();
        Ok(prune_terminal_in_conn(&conn, keep_max, now_ms)?)
    }
}
