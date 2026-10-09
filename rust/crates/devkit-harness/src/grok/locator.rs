//! GrokSessionLocator port — `active_sessions.json` pid→cwd map plus
//! latest-mtime session-dir pick under `sessions/<encodeURIComponent(cwd)>/`.

use super::parser;
use devkit_core::discover::AgentProc;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const ACTIVE_SESSIONS_FILE: &str = "active_sessions.json";

/// One `GrokProcessMatch`: the process plus its resolved cwd and (if any)
/// most recently active session dir for that cwd.
pub struct ProcMatch<'a> {
    pub proc: &'a AgentProc,
    pub cwd: String,
    pub session_dir: Option<PathBuf>,
}

pub struct GrokSessionLocator {
    base_dir: PathBuf,
    sessions_dir: PathBuf,
}

impl GrokSessionLocator {
    /// `GROK_HOME` overrides `~/.grok` (empty env var falls back, as in TS).
    pub fn new(home: &Path) -> Self {
        let base_dir = std::env::var("GROK_HOME")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".grok"));
        Self {
            sessions_dir: base_dir.join("sessions"),
            base_dir,
        }
    }

    /// `matchRunningProcesses` — registry cwd first, process cwd fallback;
    /// an empty resolved cwd yields no session dir.
    pub fn match_running<'a>(&self, processes: &[&'a AgentProc]) -> Vec<ProcMatch<'a>> {
        let pid_to_cwd = self.read_active_sessions();
        processes
            .iter()
            .map(|proc| {
                let cwd = pid_to_cwd
                    .get(&proc.pid)
                    .cloned()
                    .or_else(|| proc.cwd.clone())
                    .unwrap_or_default();
                let session_dir = if cwd.is_empty() {
                    None
                } else {
                    self.latest_session_dir(&cwd)
                };
                ProcMatch {
                    proc,
                    cwd,
                    session_dir,
                }
            })
            .collect()
    }

    /// `readActiveSessions` — `[{pid, cwd, opened_at}]` → pid→cwd; only
    /// entries with a numeric pid and non-empty string cwd count.
    fn read_active_sessions(&self) -> HashMap<i64, String> {
        let mut map = HashMap::new();
        let Ok(content) = std::fs::read_to_string(self.base_dir.join(ACTIVE_SESSIONS_FILE)) else {
            return map;
        };
        let Ok(entries) = serde_json::from_str::<serde_json::Value>(&content) else {
            return map;
        };
        let Some(list) = entries.as_array() else {
            return map;
        };
        for entry in list {
            let (Some(pid), Some(cwd)) = (entry["pid"].as_i64(), entry["cwd"].as_str()) else {
                continue;
            };
            if cwd.is_empty() {
                continue;
            }
            map.insert(pid, cwd.to_string());
        }
        map
    }

    /// `latestSessionDir` — the session subdir whose chat_history.jsonl was
    /// written last (strict `>`; first wins ties), or None.
    fn latest_session_dir(&self, cwd: &str) -> Option<PathBuf> {
        let group_dir = parser::group_dir_for(&self.sessions_dir, cwd);
        if !group_dir.is_dir() {
            return None;
        }
        let mut best: Option<(PathBuf, i64)> = None;
        for name in crate::shared::list_dir_names(&group_dir) {
            let session_dir = group_dir.join(&name);
            if !session_dir.is_dir() {
                continue;
            }
            let Some(mtime) = session_dir
                .join(parser::CHAT_HISTORY_FILE)
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
            else {
                continue;
            };
            if best.as_ref().is_none_or(|(_, m)| mtime > *m) {
                best = Some((session_dir, mtime));
            }
        }
        best.map(|(dir, _)| dir)
    }
}
