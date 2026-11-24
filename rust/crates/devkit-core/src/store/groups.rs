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
    fn from(err: rusqlite::Error) -> Self {
        group_error("storage", err.to_string(), json!({}))
    }
}

fn group_error(code: &'static str, message: impl Into<String>, details: Value) -> GroupError {
    GroupError {
        code,
        message: message.into(),
        details,
    }
}

fn not_found(group_name: &str) -> GroupError {
    group_error(
        "not_found",
        format!("Agent group \"{group_name}\" not found."),
        json!({ "name": group_name }),
    )
}

fn empty_members() -> GroupError {
    group_error(
        "empty_members",
        "Agent group must contain at least one member.",
        json!({}),
    )
}

fn validate_group_name(input: &str) -> Result<String, GroupError> {
    let trimmed = input.trim();
    let bytes = trimmed.as_bytes();
    let valid_chars = bytes
        .iter()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-');
    if !(2..=64).contains(&bytes.len())
        || !valid_chars
        || bytes[0] == b'-'
        || bytes[bytes.len() - 1] == b'-'
    {
        return Err(group_error(
            "invalid_name",
            format!("Invalid agent group name \"{input}\"."),
            json!({ "name": input }),
        ));
    }
    Ok(trimmed.to_owned())
}

fn validate_member(input: &str) -> Result<String, GroupError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(group_error(
            "invalid_member",
            "Agent group member cannot be blank.",
            json!({ "member": input }),
        ));
    }
    Ok(trimmed.to_owned())
}

fn validate_members(input: Vec<String>) -> Result<Vec<String>, GroupError> {
    if input.is_empty() {
        return Err(empty_members());
    }
    let normalized = input
        .iter()
        .map(|entry| validate_member(entry))
        .collect::<Result<Vec<_>, _>>()?;
    let mut seen = HashSet::new();
    for member in &normalized {
        if !seen.insert(member) {
            return Err(group_error(
                "invalid_member",
                format!("Duplicate agent group member \"{member}\"."),
                json!({ "member": member }),
            ));
        }
    }
    Ok(normalized)
}

fn fetch_group(conn: &Connection, group_name: &str) -> Result<AgentGroup, GroupError> {
    let record = conn
        .query_row(
            "SELECT created_at, updated_at FROM groups WHERE name = ?1",
            [group_name],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((created_at, updated_at)) = record else {
        return Err(not_found(group_name));
    };
    let mut stmt =
        conn.prepare("SELECT member FROM group_members WHERE group_name = ?1 ORDER BY position")?;
    let members = stmt
        .query_map([group_name], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;
    Ok(AgentGroup {
        name: group_name.into(),
        members,
        created_at,
        updated_at,
    })
}

fn insert_members(conn: &Connection, group: &AgentGroup) -> Result<(), GroupError> {
    for (position, member) in group.members.iter().enumerate() {
        conn.execute(
            "INSERT INTO group_members(group_name, member, position) VALUES(?1, ?2, ?3)",
            params![group.name, member, position as i64],
        )?;
    }
    Ok(())
}

fn replace_members(conn: &Connection, group: &AgentGroup) -> Result<(), GroupError> {
    conn.execute(
        "DELETE FROM group_members WHERE group_name = ?1",
        [&group.name],
    )?;
    insert_members(conn, group)?;
    conn.execute(
        "UPDATE groups SET updated_at = ?2 WHERE name = ?1",
        params![group.name, group.updated_at],
    )?;
    Ok(())
}

impl Store {
    pub(super) fn init_groups(conn: &Connection) -> rusqlite::Result<()> {
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS groups (
                ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS group_members (
                group_name TEXT NOT NULL REFERENCES groups(name) ON DELETE CASCADE,
                member TEXT NOT NULL,
                position INTEGER NOT NULL,
                PRIMARY KEY(group_name, member),
                UNIQUE(group_name, position)
            );",
        )
    }

    pub fn get_group(&self, input: &str) -> Result<AgentGroup, GroupError> {
        let group_name = validate_group_name(input)?;
        fetch_group(&self.conn.lock().unwrap(), &group_name)
    }

    pub fn list_groups(&self) -> Result<Vec<AgentGroup>, GroupError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT g.name, g.created_at, g.updated_at, m.member
             FROM groups g
             LEFT JOIN group_members m ON m.group_name = g.name
             ORDER BY g.ordinal, m.position",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?;
        let mut groups: Vec<AgentGroup> = Vec::new();
        for row in rows {
            let (name, created_at, updated_at, member) = row?;
            match groups.last_mut() {
                Some(current) if current.name == name => {
                    if let Some(member) = member {
                        current.members.push(member);
                    }
                }
                _ => {
                    groups.push(AgentGroup {
                        name,
                        members: member.into_iter().collect(),
                        created_at,
                        updated_at,
                    });
                }
            }
        }
        Ok(groups)
    }

    pub fn create_group(
        &self,
        input: &str,
        input_members: Vec<String>,
    ) -> Result<AgentGroup, GroupError> {
        let group_name = validate_group_name(input)?;
        let members = validate_members(input_members)?;
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        if tx
            .query_row(
                "SELECT 1 FROM groups WHERE name = ?1",
                [&group_name],
                |_| Ok(()),
            )
            .optional()?
            .is_some()
        {
            return Err(group_error(
                "conflict",
                format!("Agent group \"{group_name}\" already exists."),
                json!({ "name": group_name }),
            ));
        }
        let now = iso8601_utc(chrono_now());
        let group = AgentGroup {
            name: group_name,
            members,
            created_at: now.clone(),
            updated_at: now,
        };
        tx.execute(
            "INSERT INTO groups(name, created_at, updated_at) VALUES(?1, ?2, ?3)",
            params![group.name, group.created_at, group.updated_at],
        )?;
        insert_members(&tx, &group)?;
        tx.commit()?;
        Ok(group)
    }

    pub fn update_group(
        &self,
        input: &str,
        input_members: Vec<String>,
    ) -> Result<AgentGroup, GroupError> {
        let group_name = validate_group_name(input)?;
        let members = validate_members(input_members)?;
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let mut group = fetch_group(&tx, &group_name)?;
        group.members = members;
        group.updated_at = iso8601_utc(chrono_now());
        replace_members(&tx, &group)?;
        tx.commit()?;
        Ok(group)
    }

    pub fn add_group_member(
        &self,
        input_group: &str,
        input_member: &str,
    ) -> Result<AgentGroup, GroupError> {
        let group_name = validate_group_name(input_group)?;
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let mut group = fetch_group(&tx, &group_name)?;
        let member = validate_member(input_member)?;
        if group.members.contains(&member) {
            return Ok(group);
        }
        group.members.push(member);
        group.updated_at = iso8601_utc(chrono_now());
        replace_members(&tx, &group)?;
        tx.commit()?;
        Ok(group)
    }

    pub fn remove_group_member(
        &self,
        input_group: &str,
        input_member: &str,
    ) -> Result<AgentGroup, GroupError> {
        let group_name = validate_group_name(input_group)?;
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let mut group = fetch_group(&tx, &group_name)?;
        let member = validate_member(input_member)?;
        if !group.members.contains(&member) {
            return Err(group_error(
                "invalid_member",
                format!("Agent group \"{group_name}\" does not contain member \"{member}\"."),
                json!({ "name": group_name, "member": member }),
            ));
        }
        if group.members.len() == 1 {
            return Err(empty_members());
        }
        group.members.retain(|existing| existing != &member);
        group.updated_at = iso8601_utc(chrono_now());
        replace_members(&tx, &group)?;
        tx.commit()?;
        Ok(group)
    }

    pub fn remove_group(&self, input: &str) -> Result<(), GroupError> {
        let group_name = validate_group_name(input)?;
        let conn = self.conn.lock().unwrap();
        if conn.execute("DELETE FROM groups WHERE name = ?1", [&group_name])? == 0 {
            return Err(not_found(&group_name));
        }
        Ok(())
    }
}
