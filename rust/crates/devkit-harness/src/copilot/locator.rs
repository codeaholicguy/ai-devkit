//! CopilotSessionLocator port — `inuse.<pid>.lock` discovery bounded by the
//! mtime of session dirs, with a per-(pid,startTime) known-lock cache the
//! daemon keeps across sweeps (Mutex — adapters are shared `&self`).

use devkit_core::discover::AgentProc;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Tolerance between process start and lock-dir mtime (`START_TIME_SLACK_MS`).
const START_TIME_SLACK_MS: i64 = 5 * 60 * 1000;

pub struct CopilotLock {
    pub session_dir: PathBuf,
    pub session_id: String,
    pub pid: i64,
}

struct KnownLock {
    session_dir: PathBuf,
    session_id: String,
    start_time_ms: i64,
}

pub struct CopilotSessionLocator {
    session_state_dir: PathBuf,
    known_locks: Mutex<HashMap<i64, KnownLock>>,
}

impl CopilotSessionLocator {
    pub fn new(home: &Path) -> Self {
        Self {
            session_state_dir: home.join(".copilot").join("session-state"),
            known_locks: Mutex::new(HashMap::new()),
        }
    }

    /// `discoverActiveLocks(processes)` — re-validate remembered locks with a
    /// single stat; scan only dirs touched at/after the earliest unresolved
    /// process start minus slack (all dirs when any start is unknown).
    pub fn discover_active_locks(&self, processes: &[&AgentProc]) -> Vec<CopilotLock> {
        let start_times: HashMap<i64, Option<i64>> = processes
            .iter()
            .map(|p| (p.pid, p.start_time_ms))
            .collect();
        let mut known = self.known_locks.lock().unwrap();
        known.retain(|pid, k| start_times.get(pid).copied().flatten() == Some(k.start_time_ms));

        let mut locks = Vec::new();
        let mut unresolved: HashSet<i64> = HashSet::new();
        for p in processes {
            let pid = p.pid;
            let hit = known.get(&pid).is_some_and(|k| {
                k.session_dir
                    .join(lock_file_name(pid))
                    .is_file()
            });
            if hit {
                let k = known.get(&pid).unwrap();
                locks.push(CopilotLock {
                    session_dir: k.session_dir.clone(),
                    session_id: k.session_id.clone(),
                    pid,
                });
                continue;
            }
            known.remove(&pid);
            unresolved.insert(pid);
        }
        if unresolved.is_empty() {
            return locks;
        }

        let min_mtime_ms = if unresolved
            .iter()
            .all(|pid| start_times[pid].is_some())
        {
            unresolved
                .iter()
                .filter_map(|pid| start_times[pid])
                .min()
                .map(|m| m - START_TIME_SLACK_MS)
        } else {
            None
        };

        let found = self.scan_locks(min_mtime_ms, |pid| unresolved.contains(&pid));
        let mut counts: HashMap<i64, usize> = HashMap::new();
        for lock in &found {
            *counts.entry(lock.pid).or_default() += 1;
        }
        for lock in &found {
            if let (Some(start), 1) = (start_times[&lock.pid], counts[&lock.pid]) {
                known.insert(
                    lock.pid,
                    KnownLock {
                        session_dir: lock.session_dir.clone(),
                        session_id: lock.session_id.clone(),
                        start_time_ms: start,
                    },
                );
            }
        }

        locks.extend(found);
        locks
    }

    /// `scanLocks` — lock files inside session dirs with mtime >= `min_mtime_ms`
    /// (all dirs when None).
    fn scan_locks(
        &self,
        min_mtime_ms: Option<i64>,
        include_pid: impl Fn(i64) -> bool,
    ) -> Vec<CopilotLock> {
        let mut locks = Vec::new();
        for session_id in crate::shared::list_dir_names(&self.session_state_dir) {
            let session_dir = self.session_state_dir.join(&session_id);
            let Ok(stat) = std::fs::metadata(&session_dir) else {
                continue;
            };
            if !stat.is_dir() {
                continue;
            }
            if let Some(min) = min_mtime_ms {
                let mtime = stat
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(i64::MIN);
                if mtime < min {
                    continue;
                }
            }
            for name in crate::shared::list_dir_names(&session_dir) {
                let Some(pid) = lock_pid(&name) else { continue };
                if !include_pid(pid) {
                    continue;
                }
                locks.push(CopilotLock {
                    session_dir: session_dir.clone(),
                    session_id: session_id.clone(),
                    pid,
                });
            }
        }
        locks
    }
}

fn lock_file_name(pid: i64) -> String {
    format!("inuse.{pid}.lock")
}

/// `^inuse\.(\d+)\.lock$`
fn lock_pid(name: &str) -> Option<i64> {
    let mid = name.strip_prefix("inuse.")?.strip_suffix(".lock")?;
    if mid.is_empty() || !mid.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    mid.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_file_pattern() {
        assert_eq!(lock_pid("inuse.42.lock"), Some(42));
        assert_eq!(lock_pid("inuse..lock"), None);
        assert_eq!(lock_pid("inuse.4x2.lock"), None);
        assert_eq!(lock_pid("inuse.42.lock.bak"), None);
        assert_eq!(lock_pid("other.lock"), None);
    }
}
