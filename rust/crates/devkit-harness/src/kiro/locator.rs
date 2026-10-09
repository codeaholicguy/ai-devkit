//! Port of `KiroSessionLocator` — `<id>.lock` discovery under
//! `~/.kiro/sessions/cli`, lock-pid → outermost-Kiro-ancestor resolution,
//! and the sole-Kiro-on-tty fallback.

use devkit_core::discover::AgentProc;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// One live Kiro process and the session whose lock it (or its descendant)
/// holds (`KiroProcessMatch`).
pub struct LockMatch<'a> {
    pub process: &'a AgentProc,
    pub session_id: String,
}

/// `matchRunningProcesses` — pair `.lock` files with running Kiro
/// processes. `snapshot` is the full process-name pool (helpers included,
/// needed to walk up from `kiro-cli-chat acp`); `kiro_processes` are the
/// canHandle'd agents; `is_kiro` is the adapter's canHandle.
pub fn match_running_processes<'a>(
    sessions_dir: &Path,
    snapshot: &[&'a AgentProc],
    kiro_processes: &[&'a AgentProc],
    is_kiro: impl Fn(&AgentProc) -> bool,
) -> Vec<LockMatch<'a>> {
    let by_pid: HashMap<i64, &AgentProc> = snapshot.iter().map(|p| (p.pid, *p)).collect();
    let mut matches = Vec::new();

    for (session_id, pid) in discover_active_locks(sessions_dir) {
        let proc = find_kiro_ancestor(pid, &by_pid, &is_kiro).or_else(|| {
            match_sole_process_on_tty(
                by_pid.get(&pid).and_then(|p| p.tty.as_deref()),
                kiro_processes,
            )
        });
        if let Some(proc) = proc {
            matches.push(LockMatch { process: proc, session_id });
        }
    }
    matches
}

/// `discoverActiveLocks` — `.lock` files in (sorted) readdir order; each
/// holds a JSON object whose `pid` names the holder.
fn discover_active_locks(sessions_dir: &Path) -> Vec<(String, i64)> {
    let mut locks = Vec::new();
    for name in crate::shared::list_dir_names(sessions_dir) {
        let Some(session_id) = name.strip_suffix(".lock") else {
            continue;
        };
        let Ok(content) = std::fs::read_to_string(sessions_dir.join(&name)) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<Value>(&content) else {
            continue;
        };
        if let Some(pid) = json.get("pid").and_then(to_pid) {
            locks.push((session_id.to_string(), pid));
        }
    }
    locks
}

/// `findKiroAncestor` — walk up the lock pid's parent chain through the
/// snapshot; the outermost Kiro process wins.
fn find_kiro_ancestor<'a>(
    lock_pid: i64,
    by_pid: &HashMap<i64, &'a AgentProc>,
    is_kiro: &impl Fn(&AgentProc) -> bool,
) -> Option<&'a AgentProc> {
    let mut current = by_pid.get(&lock_pid).copied();
    let mut seen = HashSet::new();
    let mut resolved = None;
    while let Some(c) = current {
        if !seen.insert(c.pid) {
            break;
        }
        if is_kiro(c) {
            resolved = Some(c);
        }
        current = c.ppid.and_then(|pp| by_pid.get(&pp).copied());
    }
    resolved
}

/// `matchSoleProcessOnTty` — when the chain is broken, attach to the only
/// Kiro process on the lock holder's terminal.
fn match_sole_process_on_tty<'a>(
    tty: Option<&str>,
    kiro_processes: &[&'a AgentProc],
) -> Option<&'a AgentProc> {
    let tty = tty?;
    if tty.is_empty() || tty == "??" || tty == "?" {
        return None;
    }
    let mut it = kiro_processes
        .iter()
        .filter(|p| p.tty.as_deref() == Some(tty));
    let first = *it.next()?;
    if it.next().is_some() {
        return None;
    }
    Some(first)
}

/// `toPid` — a safe positive integer, numeric or all-digits string.
fn to_pid(value: &Value) -> Option<i64> {
    const MAX_SAFE: f64 = 9_007_199_254_740_991.0;
    match value {
        Value::Number(n) => {
            let f = n.as_f64()?;
            (f.fract() == 0.0 && f > 0.0 && f <= MAX_SAFE).then_some(f as i64)
        }
        Value::String(s) if !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) => {
            s.parse::<i64>().ok().filter(|p| *p > 0 && *p <= 9_007_199_254_740_991)
        }
        _ => None,
    }
}
