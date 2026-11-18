//! Daemon-owned ordered groups. Every mutation holds the store connection lock
//! for its transaction; group members intentionally do not reference live agents.
use super::{chrono_now, iso8601_utc, Store};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentGroup {
    pub name: String,
    pub members: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug)]
pub struct GroupError {
    pub code: &'static str,
    pub message: String,
    pub details: Value,
}
impl std::fmt::Display for GroupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for GroupError {}
impl From<rusqlite::Error> for GroupError {
    fn from(e: rusqlite::Error) -> Self {
        error("storage", e.to_string(), json!({}))
    }
}
fn error(code: &'static str, message: impl Into<String>, details: Value) -> GroupError {
    GroupError {
        code,
        message: message.into(),
        details,
    }
}
fn not_found(name: &str) -> GroupError {
    error(
        "not_found",
        format!("Agent group \"{name}\" not found."),
        json!({"name":name}),
    )
}
fn name(input: &str) -> Result<String, GroupError> {
    let n = input.trim();
    let b = n.as_bytes();
    if !(2..=64).contains(&b.len())
        || !b
            .iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
        || b[0] == b'-'
        || b[b.len() - 1] == b'-'
    {
        return Err(error(
            "invalid_name",
            format!("Invalid agent group name \"{input}\"."),
            json!({"name":input}),
        ));
    }
    Ok(n.to_owned())
}
fn member(input: &str) -> Result<String, GroupError> {
    let m = input.trim();
    if m.is_empty() {
        return Err(error(
            "invalid_member",
            "Agent group member cannot be blank.",
            json!({"member":input}),
        ));
    }
    Ok(m.to_owned())
}
fn members(input: Vec<String>) -> Result<Vec<String>, GroupError> {
    if input.is_empty() {
        return Err(error(
            "empty_members",
            "Agent group must contain at least one member.",
            json!({}),
        ));
    }
    let normalized = input
        .iter()
        .map(|m| member(m))
        .collect::<Result<Vec<_>, _>>()?;
    let mut seen = HashSet::new();
    for m in &normalized {
        if !seen.insert(m) {
            return Err(error(
                "invalid_member",
                format!("Duplicate agent group member \"{m}\"."),
                json!({"member":m}),
            ));
        }
    }
    Ok(normalized)
}
fn get(conn: &Connection, n: &str) -> Result<AgentGroup, GroupError> {
    let record = conn
        .query_row(
            "SELECT created_at,updated_at FROM groups WHERE name=?1",
            [n],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let Some((created_at, updated_at)) = record else {
        return Err(not_found(n));
    };
    let mut stmt =
        conn.prepare("SELECT member FROM group_members WHERE group_name=?1 ORDER BY position")?;
    let members = stmt
        .query_map([n], |r| r.get(0))?
        .collect::<Result<Vec<String>, _>>()?;
    Ok(AgentGroup {
        name: n.into(),
        members,
        created_at,
        updated_at,
    })
}
fn write_members(conn: &Connection, g: &AgentGroup) -> Result<(), GroupError> {
    conn.execute("DELETE FROM group_members WHERE group_name=?1", [&g.name])?;
    for (i, m) in g.members.iter().enumerate() {
        conn.execute(
            "INSERT INTO group_members(group_name,member,position) VALUES(?1,?2,?3)",
            params![g.name, m, i as i64],
        )?;
    }
    conn.execute(
        "UPDATE groups SET updated_at=?2 WHERE name=?1",
        params![g.name, g.updated_at],
    )?;
    Ok(())
}

impl Store {
    pub(super) fn init_groups(conn: &Connection) -> rusqlite::Result<()> {
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS groups (
            ordinal INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS group_members (
            group_name TEXT NOT NULL REFERENCES groups(name) ON DELETE CASCADE,
            member TEXT NOT NULL, position INTEGER NOT NULL,
            PRIMARY KEY(group_name,member), UNIQUE(group_name,position));",
        )
    }
    pub fn get_group(&self, input: &str) -> Result<AgentGroup, GroupError> {
        let n = name(input)?;
        get(&self.conn.lock().unwrap(), &n)
    }
    pub fn list_groups(&self) -> Result<Vec<AgentGroup>, GroupError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT name FROM groups ORDER BY ordinal")?;
        let names = stmt
            .query_map([], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        names.iter().map(|n| get(&conn, n)).collect()
    }
    pub fn create_group(
        &self,
        input: &str,
        input_members: Vec<String>,
    ) -> Result<AgentGroup, GroupError> {
        let n = name(input)?;
        let ms = members(input_members)?;
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        if tx
            .query_row("SELECT 1 FROM groups WHERE name=?1", [&n], |_| Ok(()))
            .optional()?
            .is_some()
        {
            return Err(error(
                "conflict",
                format!("Agent group \"{n}\" already exists."),
                json!({"name":n}),
            ));
        }
        let now = iso8601_utc(chrono_now());
        let g = AgentGroup {
            name: n,
            members: ms,
            created_at: now.clone(),
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO groups(name,created_at,updated_at) VALUES(?1,?2,?3)",
            params![g.name, g.created_at, g.updated_at],
        )?;
        write_members(&tx, &g)?;
        tx.commit()?;
        Ok(g)
    }
    pub fn update_group(
        &self,
        input: &str,
        input_members: Vec<String>,
    ) -> Result<AgentGroup, GroupError> {
        let n = name(input)?;
        let ms = members(input_members)?;
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let mut g = get(&tx, &n)?;
        g.members = ms;
        g.updated_at = iso8601_utc(chrono_now());
        write_members(&tx, &g)?;
        tx.commit()?;
        Ok(g)
    }
    fn change_group_member(
        &self,
        input: &str,
        input_member: &str,
        remove: bool,
    ) -> Result<AgentGroup, GroupError> {
        let n = name(input)?;
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let mut g = get(&tx, &n)?;
        let m = member(input_member)?;
        if remove {
            if !g.members.contains(&m) {
                return Err(error(
                    "invalid_member",
                    format!("Agent group \"{n}\" does not contain member \"{m}\"."),
                    json!({"name":n,"member":m}),
                ));
            }
            g.members.retain(|v| v != &m);
            g.members = members(g.members)?;
        } else if g.members.contains(&m) {
            return Ok(g);
        } else {
            g.members.push(m);
        }
        g.updated_at = iso8601_utc(chrono_now());
        write_members(&tx, &g)?;
        tx.commit()?;
        Ok(g)
    }
    pub fn add_group_member(&self, n: &str, m: &str) -> Result<AgentGroup, GroupError> {
        self.change_group_member(n, m, false)
    }
    pub fn remove_group_member(&self, n: &str, m: &str) -> Result<AgentGroup, GroupError> {
        self.change_group_member(n, m, true)
    }
    pub fn remove_group(&self, input: &str) -> Result<(), GroupError> {
        let n = name(input)?;
        let conn = self.conn.lock().unwrap();
        if conn.execute("DELETE FROM groups WHERE name=?1", [&n])? == 0 {
            return Err(not_found(&n));
        }
        Ok(())
    }
}

#[derive(Deserialize)]
struct LegacyGroups {
    version: u32,
    groups: Vec<AgentGroup>,
}
impl Store {
    /// Claim ownership atomically, then unlink legacy state. A cleanup warning
    /// is distinct from import failure: callers must keep serving owned data.
    /// Call once at startup (and retry only a failed import before group RPCs).
    pub fn import_groups(&self, source: &std::path::Path) -> Result<Option<String>, GroupError> {
        let storage = |e: String| {
            error(
                "storage",
                format!(
                    "Failed to import agent groups from \"{}\": {e}",
                    source.display()
                ),
                json!({"path":source}),
            )
        };
        let conn = self.conn.lock().unwrap();
        conn.execute_batch("CREATE TABLE IF NOT EXISTS group_migrations (name TEXT PRIMARY KEY)")?;
        let tx = conn.unchecked_transaction()?;
        let owned = tx
            .query_row(
                "SELECT 1 FROM group_migrations WHERE name='json-v1'",
                [],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !owned {
            let data = match std::fs::read_to_string(source) {
                Ok(text) => Some(
                    serde_json::from_str::<LegacyGroups>(&text)
                        .map_err(|e| storage(e.to_string()))?,
                ),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(e) => return Err(storage(e.to_string())),
            };
            if let Some(data) = data {
                if data.version != 1 {
                    return Err(storage("unsupported agent group file version".into()));
                }
                for mut g in data.groups {
                    g.name = name(&g.name).map_err(|e| storage(e.to_string()))?;
                    g.members = members(g.members).map_err(|e| storage(e.to_string()))?;
                    tx.execute(
                        "INSERT INTO groups(name,created_at,updated_at) VALUES(?1,?2,?3)",
                        params![g.name, g.created_at, g.updated_at],
                    )
                    .map_err(|e| storage(e.to_string()))?;
                    write_members(&tx, &g).map_err(|e| storage(e.to_string()))?;
                }
            }
            tx.execute("INSERT INTO group_migrations(name) VALUES('json-v1')", [])?;
        }
        tx.commit()?;
        // Never read the source after ownership. Even malformed recreated files
        // are stale; cleanup can fail without changing the durable fence.
        match std::fs::remove_file(source) {
            Ok(()) => Ok(None),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Ok(Some(format!(
                "Agent group import committed; cleanup of {} failed: {e}",
                source.display()
            ))),
        }
    }
}
