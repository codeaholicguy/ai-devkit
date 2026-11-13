//! Sweep-time pid → session file resolution from the per-harness mapping
//! files the harnesses (or ai-devkit hooks/extensions) maintain:
//!
//! - pi:     `~/.pi/agent/sessions.json`          `{ "<pid>": "<sessionFile>" }`
//! - codex:  `~/.codex/ai-devkit/sessions.json`   same shape
//! - claude: `~/.claude/sessions/<pid>.json`      `{ sessionId, cwd, startedAt, … }`
//!   resolved to `~/.claude/projects/<encoded cwd>/<sessionId>.jsonl`, the
//!   same parsing `ClaudeSessionLocator.readMatchingPidFile` applies.
//!
//! These files are rewritten on every session start, so they are the only
//! source that follows a session restart inside the same pid. Missing files,
//! invalid JSON, non-string values, stale pids (entry for a pid that is not
//! in the sweep, or whose target file is gone) and untrusted paths are all
//! tolerated by skipping the entry.

use crate::discover::AgentProc;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

/// `PID_FILE_STALENESS_MS` — |procStart − pidfile.startedAt| beyond which a
/// claude pid file belongs to a recycled pid.
const CLAUDE_PID_FILE_STALENESS_MS: f64 = 60_000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Harness {
    Claude,
    Codex,
    Pi,
}

/// Which mapping source may claim this proc — a pid map entry must not leak
/// onto a different harness's process after pid reuse.
fn harness_of(command: &str) -> Option<Harness> {
    for tok in command.split_whitespace() {
        let base = tok.rsplit(['/', '\\']).next().unwrap_or("").to_lowercase();
        let stem = base
            .strip_suffix(".exe")
            .or_else(|| base.strip_suffix(".js"))
            .unwrap_or(&base);
        match stem {
            "claude" => return Some(Harness::Claude),
            "codex" => return Some(Harness::Codex),
            "pi" => return Some(Harness::Pi),
            _ => {}
        }
    }
    None
}

/// Fill `session_file` for every proc a mapping file covers. Procs no mapping
/// covers keep their current value. Each pid-map file is read at most once
/// per call, and only when some proc of that harness is present.
pub fn resolve_session_files(procs: &mut [AgentProc], home: &Path) {
    let mut pi_map: Option<HashMap<i64, String>> = None;
    let mut codex_map: Option<HashMap<i64, String>> = None;
    let pi_root = home.join(".pi").join("agent").join("sessions");
    let codex_root = home.join(".codex").join("sessions");

    for proc in procs.iter_mut() {
        let Some(harness) = proc.command.as_deref().and_then(harness_of) else {
            continue;
        };
        let resolved = match harness {
            Harness::Pi => {
                let map = pi_map.get_or_insert_with(|| {
                    read_pid_map(&home.join(".pi").join("agent").join("sessions.json"))
                });
                trusted_existing(map.get(&proc.pid), &pi_root)
            }
            Harness::Codex => {
                let map = codex_map.get_or_insert_with(|| {
                    read_pid_map(&home.join(".codex").join("ai-devkit").join("sessions.json"))
                });
                trusted_existing(map.get(&proc.pid), &codex_root)
            }
            Harness::Claude => claude_session_file(home, proc.pid, proc.start_time_ms),
        };
        if resolved.is_some() {
            proc.session_file = resolved;
        }
    }
}

/// `{ "<pid>": "<path>" }` → pid map; anything unreadable yields empty.
fn read_pid_map(path: &Path) -> HashMap<i64, String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return HashMap::new();
    };
    let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(&text) else {
        return HashMap::new();
    };
    obj.iter()
        .filter_map(|(k, v)| {
            if k.is_empty() || !k.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            let pid = k.parse::<i64>().ok().filter(|p| *p > 0)?;
            let file = v.as_str().filter(|s| !s.is_empty())?;
            Some((pid, file.to_string()))
        })
        .collect()
}

/// Accept a mapped path only when it resolves under `root` (the same
/// `isTrustedSessionPath` containment the adapters apply) and exists —
/// `"ephemeral"` and dead-session leftovers are skipped.
fn trusted_existing(file: Option<&String>, root: &Path) -> Option<String> {
    let file = file?;
    let root = normalize(root);
    let resolved = normalize(Path::new(file));
    if !resolved.starts_with(&root) || resolved == root {
        return None;
    }
    Path::new(file).is_file().then(|| file.clone())
}

/// Lexical `path.resolve` for absolute paths (no symlink resolution).
fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::from("/");
    for comp in p.components() {
        match comp {
            Component::Normal(s) => out.push(s),
            Component::ParentDir => {
                out.pop();
            }
            Component::RootDir | Component::CurDir | Component::Prefix(_) => {}
        }
    }
    out
}

/// `~/.claude/sessions/<pid>.json` → JSONL path, mirroring
/// `ClaudeSessionLocator.tryPidFileMatching`: requires `sessionId`, `cwd`
/// and `startedAt`; rejects a pid file whose `startedAt` is more than 60s off
/// the process start time; requires the JSONL to exist.
fn claude_session_file(home: &Path, pid: i64, start_time_ms: Option<i64>) -> Option<String> {
    let text = std::fs::read_to_string(
        home.join(".claude")
            .join("sessions")
            .join(format!("{pid}.json")),
    )
    .ok()?;
    let v: Value = serde_json::from_str(&text).ok()?;
    let session_id = v.get("sessionId")?.as_str()?;
    let cwd = v.get("cwd")?.as_str()?;
    let started_at = v.get("startedAt")?.as_f64()?;
    if let Some(start) = start_time_ms {
        if (start as f64 - started_at).abs() > CLAUDE_PID_FILE_STALENESS_MS {
            return None;
        }
    }
    if session_id.is_empty()
        || !session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    // Claude Code encodes the project dir by replacing every
    // non-alphanumeric char with '-'.
    let encoded: String = cwd
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let jsonl = home
        .join(".claude")
        .join("projects")
        .join(encoded)
        .join(format!("{session_id}.jsonl"));
    jsonl
        .is_file()
        .then(|| jsonl.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_home(tag: &str) -> PathBuf {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "aidk-session-map-{}-{}-{}",
            std::process::id(),
            tag,
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, content: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }

    fn proc(pid: i64, command: &str, start: Option<i64>) -> AgentProc {
        AgentProc {
            pid,
            ppid: Some(1),
            tty: None,
            command: Some(command.into()),
            cwd: Some("/repo".into()),
            session_file: None,
            start_time_ms: start,
        }
    }

    /// Fixture home with all three mapping files populated.
    fn fixture() -> (PathBuf, String, String, String) {
        let home = tmp_home("fixture");
        let pi_file = home.join(".pi/agent/sessions/--repo--/live.jsonl");
        write(&pi_file, "{}\n");
        write(&home.join(".pi/agent/sessions/--repo--/dead.jsonl"), "{}\n");
        write(
            &home.join(".pi/agent/sessions.json"),
            &format!(
                r#"{{"100": "{}", "999": "{}", "abc": "/x", "101": 5, "102": "ephemeral"}}"#,
                pi_file.display(),
                home.join(".pi/agent/sessions/--repo--/dead.jsonl")
                    .display(),
            ),
        );

        let codex_file = home.join(".codex/sessions/2026/11/12/rollout-x.jsonl");
        write(&codex_file, "{}\n");
        write(
            &home.join(".codex/ai-devkit/sessions.json"),
            &format!(
                r#"{{"200": "{}", "201": "/etc/passwd"}}"#,
                codex_file.display()
            ),
        );

        let claude_file = home.join(".claude/projects/-repo/sid-300.jsonl");
        write(&claude_file, "{}\n");
        write(
            &home.join(".claude/sessions/300.json"),
            r#"{"pid":300,"sessionId":"sid-300","cwd":"/repo","startedAt":1000000,"kind":"interactive","status":"idle"}"#,
        );
        (
            home,
            pi_file.display().to_string(),
            codex_file.display().to_string(),
            claude_file.display().to_string(),
        )
    }

    #[test]
    fn maps_pi_codex_and_claude_from_fixture_files() {
        let (home, pi_file, codex_file, claude_file) = fixture();
        let mut procs = vec![
            proc(100, "pi --model glm", None),
            proc(200, "/usr/local/bin/codex", None),
            proc(300, "claude", Some(1_000_500)),
        ];
        resolve_session_files(&mut procs, &home);
        assert_eq!(procs[0].session_file.as_deref(), Some(pi_file.as_str()));
        assert_eq!(procs[1].session_file.as_deref(), Some(codex_file.as_str()));
        assert_eq!(procs[2].session_file.as_deref(), Some(claude_file.as_str()));
    }

    #[test]
    fn skips_stale_untrusted_ephemeral_and_foreign_entries() {
        let (home, _, _, _) = fixture();
        let mut procs = vec![
            // Non-string / ephemeral values.
            proc(101, "pi", None),
            proc(102, "pi", None),
            // Path outside ~/.codex/sessions.
            proc(201, "codex", None),
            // pi map has pid 100, but this pid-100 proc is a codex process
            // now (pid reuse) — the pi entry must not leak onto it.
            proc(100, "codex", None),
            // claude pid file belongs to a recycled pid (startedAt 1h off).
            proc(300, "claude", Some(1_000_000 + 3_600_000)),
            // No mapping at all.
            proc(400, "gemini", None),
        ];
        resolve_session_files(&mut procs, &home);
        for p in &procs {
            assert_eq!(p.session_file, None, "pid {} ({:?})", p.pid, p.command);
        }
    }

    #[test]
    fn follows_a_session_restart_in_the_same_pid() {
        let (home, _, _, _) = fixture();
        let fresh = home.join(".pi/agent/sessions/--repo--/fresh.jsonl");
        write(&fresh, "{}\n");
        write(
            &home.join(".pi/agent/sessions.json"),
            &format!(r#"{{"100": "{}"}}"#, fresh.display()),
        );
        let mut procs = vec![AgentProc {
            session_file: Some("/old/dead.jsonl".into()),
            ..proc(100, "node /opt/pi/bin/pi.js", None)
        }];
        resolve_session_files(&mut procs, &home);
        assert_eq!(
            procs[0].session_file.as_deref(),
            Some(fresh.display().to_string().as_str())
        );
    }

    #[test]
    fn tolerates_missing_and_invalid_mapping_files() {
        let home = tmp_home("invalid");
        let mut procs = vec![
            proc(1, "pi", None),
            proc(2, "codex", None),
            proc(3, "claude", None),
        ];
        resolve_session_files(&mut procs, &home); // nothing exists
        write(&home.join(".pi/agent/sessions.json"), "{not json");
        write(&home.join(".codex/ai-devkit/sessions.json"), "[1,2,3]");
        write(
            &home.join(".claude/sessions/3.json"),
            r#"{"sessionId":"../../etc"}"#,
        );
        resolve_session_files(&mut procs, &home);
        assert!(procs.iter().all(|p| p.session_file.is_none()));
    }

    #[test]
    fn resolved_session_file_is_persisted_by_the_snapshot() {
        let (home, pi_file, _, _) = fixture();
        let mut procs = vec![proc(100, "pi", None)];
        resolve_session_files(&mut procs, &home);
        let store = crate::store::Store::open(&home.join("daemon.db")).unwrap();
        store.apply_agent_snapshot(&procs).unwrap();
        let rows = store.list_agents().unwrap();
        assert_eq!(rows[0]["sessionFilePath"], pi_file.as_str());

        // Session restart: the next sweep's mapping replaces the dead file.
        let fresh = home.join(".pi/agent/sessions/--repo--/fresh.jsonl");
        write(&fresh, "{}\n");
        write(
            &home.join(".pi/agent/sessions.json"),
            &format!(r#"{{"100": "{}"}}"#, fresh.display()),
        );
        let mut procs = vec![proc(100, "pi", None)];
        resolve_session_files(&mut procs, &home);
        store.apply_agent_snapshot(&procs).unwrap();
        let rows = store.list_agents().unwrap();
        assert_eq!(
            rows[0]["sessionFilePath"],
            fresh.display().to_string().as_str()
        );
    }

    #[test]
    fn claude_session_id_cannot_escape_projects_dir() {
        let home = tmp_home("escape");
        write(&home.join(".claude/projects/x.jsonl"), "{}\n");
        write(
            &home.join(".claude/sessions/5.json"),
            r#"{"sessionId":"../x","cwd":"/repo","startedAt":0}"#,
        );
        let mut procs = vec![proc(5, "claude", None)];
        resolve_session_files(&mut procs, &home);
        assert_eq!(procs[0].session_file, None);
    }
}
