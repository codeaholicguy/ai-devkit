//! `agent.start` RPC — starts an agent inside the daemon's own identity
//! scope (issue #402). The CLI's `agent start` delegates here when the socket
//! is reachable so the registry write, tmux session, and pid registration all
//! happen under the daemon's HOME — the same authority `agent list`, `send`,
//! `kill`, and the console read. Clients on a divergent/sandboxed HOME get a
//! real, addressable agent instead of a silently split-brain row.
//!
//! The registry db (`<data_dir>/agents.db`) shares the TS agent-manager
//! schema: the daemon writes only the columns present since schema v1
//! (type, pid, name, tmux_session, cwd, started_at, session_id,
//! session_file_path, updated_at); runtime/pinned/runtime_ref defaults come
//! from later migrations which the TS side applies on next open.

use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

/// `AGENT_NAME_REGEX` — lowercase alphanumeric + hyphens, 2–64 chars, must
/// start and end with a letter or digit.
fn valid_agent_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    let ok = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    bytes.len() >= 2
        && bytes.len() <= 64
        && ok(bytes[0])
        && ok(bytes[bytes.len() - 1])
        && bytes.iter().all(|&b| ok(b) || b == b'-')
}

/// `HARNESS_RUNTIME_PROFILES` — executable command per startable type plus
/// the basenames a pane-tree pid scan accepts. Mirrors TS `runtimeProfiles`.
pub fn profile_for(agent_type: &str) -> Option<(&'static str, &'static [&'static str])> {
    match agent_type {
        "claude" => Some(("claude", &["claude"])),
        "codex" => Some(("codex", &["codex"])),
        "copilot" => Some(("copilot-cli", &["copilot-cli"])),
        "gemini_cli" => Some(("gemini", &["gemini"])),
        "grok_cli" => Some(("grok", &["grok"])),
        "antigravity_cli" => Some(("agy", &["agy"])),
        "opencode" => Some(("opencode", &["opencode"])),
        "pi" => Some(("pi", &["pi"])),
        "kiro" => Some(("kiro-cli", &["kiro-cli", "kiro"])),
        "devin" => Some(("devin", &["devin"])),
        "muse" => Some(("muse", &["muse"])),
        _ => None,
    }
}

fn tmux(args: &[&str]) -> Result<String> {
    let out = Command::new("tmux")
        .args(args)
        .output()
        .context("failed to run tmux — is it installed?")?;
    if !out.status.success() {
        bail!(
            "tmux {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn pane_pid(session: &str) -> Option<i64> {
    let out = tmux(&["list-panes", "-t", session, "-F", "#{pane_pid}"]).ok()?;
    out.trim().lines().next()?.parse().ok()
}

fn pgrep_children(pid: i64) -> Vec<i64> {
    let out = Command::new("pgrep")
        .arg("-P")
        .arg(pid.to_string())
        .output();
    match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .split_whitespace()
            .filter_map(|s| s.parse().ok())
            .collect(),
        _ => Vec::new(),
    }
}

fn process_command(pid: i64) -> Option<String> {
    let out = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .ok()?;
    let cmd = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if cmd.is_empty() {
        None
    } else {
        Some(cmd)
    }
}

/// `TmuxManager.findAgentPid` — deepest matching pid in the pane's process tree.
fn find_agent_pid(session: &str, basenames: &[&str]) -> Option<i64> {
    let root = pane_pid(session)?;
    let mut deepest = None;
    let mut visited = std::collections::HashSet::new();
    let mut queue = vec![root];
    while let Some(pid) = queue.pop() {
        if !visited.insert(pid) {
            continue;
        }
        if let Some(cmd) = process_command(pid) {
            if devkit_harness::shared::matches_executable_name(&cmd, basenames) {
                deepest = Some(pid);
            }
        }
        queue.extend(pgrep_children(pid));
    }
    deepest
}

/// `pollForPid` — require 5 consecutive identical hits or time out (15s).
fn poll_for_pid(session: &str, basenames: &[&str], timeout: Duration) -> Option<i64> {
    let deadline = Instant::now() + timeout;
    let mut candidate = None;
    let mut stable = 0;
    while Instant::now() < deadline {
        if let Some(pid) = find_agent_pid(session, basenames) {
            if candidate == Some(pid) {
                stable += 1;
            } else {
                candidate = Some(pid);
                stable = 1;
            }
            if stable >= 5 {
                return Some(pid);
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    None
}

fn pid_alive(pid: i64) -> bool {
    // kill(pid, 0): Ok = alive; EPERM = alive; ESRCH = dead.
    match unsafe { libc::kill(pid as libc::pid_t, 0) } {
        0 => true,
        _ => std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH),
    }
}

/// Open (or create at schema v1 so the TS migrations take it forward) the
/// shared registry db and insert the agent row.
fn register_agent(data_dir: &Path, entry: &Value) -> Result<()> {
    let db_path = data_dir.join("agents.db");
    let existed = db_path.exists();
    let conn = rusqlite::Connection::open(&db_path)?;
    if !existed {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS agents (
                type TEXT NOT NULL,
                pid INTEGER NOT NULL,
                name TEXT NOT NULL UNIQUE,
                tmux_session TEXT NOT NULL DEFAULT '',
                cwd TEXT NOT NULL DEFAULT '',
                started_at TEXT NOT NULL,
                session_id TEXT NOT NULL DEFAULT '',
                session_file_path TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL,
                PRIMARY KEY (type, pid)
            );
            PRAGMA user_version = 1;",
        )?;
    }
    // Name-in-use: a live registered agent already owns this name.
    let conflict: Option<i64> = conn
        .query_row(
            "SELECT pid FROM agents WHERE name = ?1",
            [entry["name"].as_str().unwrap_or("")],
            |r| r.get(0),
        )
        .ok();
    if let Some(pid) = conflict {
        if pid_alive(pid) {
            bail!(
                "Agent \"{}\" is already running (PID {pid}). Choose a different name.",
                entry["name"]
            );
        }
        conn.execute(
            "DELETE FROM agents WHERE name = ?1",
            [entry["name"].as_str().unwrap_or("")],
        )?;
    }
    conn.execute(
        "INSERT INTO agents (type, pid, name, tmux_session, cwd, started_at, session_id, session_file_path, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', '', ?7)",
        rusqlite::params![
            entry["type"].as_str().unwrap_or_default(),
            entry["pid"].as_i64().unwrap_or_default(),
            entry["name"].as_str().unwrap_or_default(),
            entry["tmuxSession"].as_str().unwrap_or_default(),
            entry["cwd"].as_str().unwrap_or_default(),
            entry["startedAt"].as_str().unwrap_or_default(),
            entry["startedAt"].as_str().unwrap_or_default(),
        ],
    )?;
    Ok(())
}

/// `agent.start` — params {type, name, cwd}; result = the registry entry.
/// Blocking is fine: requests are dispatched per-connection and pid polling
/// is bounded.
pub fn handle(data_dir: &Path, params: &Value) -> Result<Value> {
    let agent_type = params["type"].as_str().unwrap_or("");
    let name = params["name"].as_str().unwrap_or("");
    let cwd = params["cwd"].as_str().unwrap_or("");

    let (command, basenames) = profile_for(agent_type)
        .ok_or_else(|| anyhow!("Unsupported agent type \"{agent_type}\"."))?;
    if !valid_agent_name(name) {
        bail!("Invalid name \"{name}\". Use lowercase letters, digits, and hyphens only; 2-64 characters.");
    }
    if !Path::new(cwd).is_dir() {
        bail!("Directory \"{cwd}\" does not exist.");
    }
    tmux(&["-V"]).map_err(|_| anyhow!("tmux is not installed or not in PATH."))?;
    if tmux(&["has-session", "-t", name]).is_ok() {
        let _ = tmux(&["kill-session", "-t", name]);
    }
    tmux(&["new-session", "-d", "-s", name, "-c", cwd])?;
    if let Err(e) = tmux(&["send-keys", "-t", name, command, "Enter"]) {
        let _ = tmux(&["kill-session", "-t", name]);
        return Err(e);
    }
    let pid = match poll_for_pid(name, basenames, Duration::from_secs(15)) {
        Some(pid) => pid,
        None => {
            let _ = tmux(&["kill-session", "-t", name]);
            bail!("Agent process not found after 15s. Verify that \"{command}\" is in PATH inside the tmux environment.");
        }
    };

    let entry = json!({
        "name": name,
        "type": agent_type,
        "pid": pid,
        "runtime": "tmux",
        "runtimeRef": { "session": name },
        "tmuxSession": name,
        "cwd": cwd,
        "startedAt": devkit_harness::shared::iso_utc(devkit_core::store::chrono_now()),
    });
    if let Err(e) = register_agent(data_dir, &entry) {
        let _ = tmux(&["kill-session", "-t", name]);
        return Err(e.context("agent started but registry write failed"));
    }
    Ok(entry)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_validation_matches_ts_regex() {
        for ok in ["tests", "a1", "agent-one", "ab", "x-9"] {
            assert!(valid_agent_name(ok), "{ok} should be valid");
        }
        for bad in ["a", "-a", "a-", "A-b", "has space", "a_b", ""] {
            assert!(!valid_agent_name(bad), "{bad} should be invalid");
        }
    }
}
