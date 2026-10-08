//! Helpers shared by ported harness adapters — mirrors
//! `packages/agent-manager/src/harnesses/shared.ts` and `utils/matching.ts`.

use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use std::path::Path;

/// `MATCH_TOLERANCE_MS` — max |procStart − session birthtime| for legacy
/// matching (3 min, same as utils/matchingConstants.ts).
pub const MATCH_TOLERANCE_MS: i64 = 3 * 60 * 1000;

/// `pathBasename` — basename after '\'→'/', lowercased.
fn path_basename(p: &str) -> String {
    p.replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_lowercase()
}

fn is_absolute(p: &str) -> bool {
    p.starts_with('/') || {
        let b = p.as_bytes();
        b.len() >= 3
            && b[0].is_ascii_alphabetic()
            && b[1] == b':'
            && (b[2] == b'/' || b[2] == b'\\')
    }
}

fn is_file(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

/// `executablePath` — resolve argv[0]; for an absolute first token that is not
/// itself a file (spaces in the path), try longer space-joined prefixes ending
/// in a token with a path separator, first one that exists wins.
pub fn executable_path(command: &str) -> String {
    let tokens: Vec<&str> = command.split_whitespace().collect();
    let first = tokens.first().copied().unwrap_or("");
    if tokens.len() == 1 || !is_absolute(first) || is_file(first) {
        return first.to_string();
    }
    let mut prefix = first.to_string();
    for tok in &tokens[1..] {
        prefix.push(' ');
        prefix.push_str(tok);
        if (tok.contains('/') || tok.contains('\\')) && is_file(&prefix) {
            return prefix;
        }
    }
    first.to_string()
}

/// `executableBasename` — lowercased basename of `executablePath`.
pub fn executable_basename(command: &str) -> String {
    path_basename(&executable_path(command))
}

/// `matchesExecutable` — argv[0]'s basename is `name` or `name.exe`.
pub fn matches_executable(command: &str, name: &str) -> bool {
    let base = executable_basename(command);
    base == name || base == format!("{name}.exe")
}

fn normalize_executable_name(name: &str) -> &str {
    let lower = name.strip_suffix(".exe").unwrap_or(name);
    let _ = lower;
    // Names passed in are already lowercase; strip a trailing .exe.
    name.strip_suffix(".exe").unwrap_or(name)
}

/// `matchesExecutableName` — first-token basename match, else (absolute first
/// token only) a later path-like token whose basename matches, confirmed by
/// the on-disk-resolved `executablePath`.
pub fn matches_executable_name(command: &str, names: &[&str]) -> bool {
    let norm: Vec<String> = names
        .iter()
        .map(|n| normalize_executable_name(n).to_lowercase())
        .collect();
    let tokens: Vec<&str> = command.split_whitespace().collect();
    let first = tokens.first().copied().unwrap_or("");
    if norm.iter().any(|n| *n == path_basename(first)) {
        return true;
    }
    if !is_absolute(first) {
        return false;
    }
    let may_continue = tokens[1..].iter().any(|t| {
        (t.contains('/') || t.contains('\\')) && norm.iter().any(|n| *n == path_basename(t))
    });
    may_continue && norm.iter().any(|n| *n == executable_basename(command))
}

/// `generateAgentName`: kebab(basename(cwd))-pid, "unknown" fallback.
pub fn generate_agent_name(cwd: &str, pid: i64) -> String {
    let folder = Path::new(cwd)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut kebab = String::with_capacity(folder.len());
    let mut last_dash = false;
    for c in folder.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            kebab.push(c);
            last_dash = false;
        } else if !last_dash {
            kebab.push('-');
            last_dash = true;
        }
    }
    let kebab = kebab.trim_matches('-').to_string();
    format!(
        "{}-{pid}",
        if kebab.is_empty() { "unknown" } else { &kebab }
    )
}

/// A session file candidate for legacy matching (`SessionFile` in TS).
#[derive(Debug, Clone)]
pub struct SessionFile {
    pub session_id: String,
    pub file_path: String,
    pub project_dir: String,
    pub birthtime_ms: i64,
    pub resolved_cwd: String,
}

/// One greedy cwd+birthtime match result.
pub struct ProcSessionMatch<'a> {
    pub proc: &'a AgentProc,
    pub session_idx: usize,
    pub delta_ms: i64,
}

/// `matchProcessesToSessions`: candidate pairs need cwd equality and
/// |start−birthtime| ≤ 3min; sorted by delta asc (stable, JS-parity), greedy
/// 1:1 assignment keyed on pid + sessionId.
pub fn match_processes_to_sessions<'a>(
    processes: &[&'a AgentProc],
    sessions: &[SessionFile],
) -> Vec<ProcSessionMatch<'a>> {
    let mut candidates: Vec<ProcSessionMatch> = Vec::new();
    for proc in processes.iter().copied() {
        let (Some(start_ms), Some(cwd)) = (proc.start_time_ms, proc.cwd.as_deref()) else {
            continue;
        };
        for (i, session) in sessions.iter().enumerate() {
            if session.resolved_cwd.is_empty() || session.resolved_cwd != cwd {
                continue;
            }
            let delta = (start_ms - session.birthtime_ms).abs();
            if delta <= MATCH_TOLERANCE_MS {
                candidates.push(ProcSessionMatch {
                    proc,
                    session_idx: i,
                    delta_ms: delta,
                });
            }
        }
    }
    candidates.sort_by_key(|c| c.delta_ms);

    let mut used_pids = std::collections::HashSet::new();
    let mut used_ids = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|c| {
            used_pids.insert(c.proc.pid)
                && used_ids.insert(sessions[c.session_idx].session_id.clone())
        })
        .collect()
}

/// `processOnlyAgent` — placeholder for a running process with no session.
pub fn process_only_agent(
    agent_type: &str,
    proc: &AgentProc,
    summary: &str,
    cwd_override: Option<&str>,
    now: i64,
) -> EnrichedAgent {
    let cwd = cwd_override
        .or(proc.cwd.as_deref())
        .unwrap_or_default()
        .to_string();
    EnrichedAgent {
        name: generate_agent_name(&cwd, proc.pid),
        agent_type: agent_type.into(),
        status: "running".into(),
        summary: summary.into(),
        pid: proc.pid as u64,
        project_path: cwd,
        session_id: format!("pid-{}", proc.pid),
        last_active: iso_utc(now),
        pinned: None,
        session_file_path: None,
    }
}

/// ISO-8601 UTC for an epoch-ms instant — the wire shape of `Date`.
pub fn iso_utc(epoch_ms: i64) -> String {
    let secs = epoch_ms.div_euclid(1000);
    let ms = epoch_ms.rem_euclid(1000);
    let (y, mo, d) = civil_from_days(secs.div_euclid(86400));
    let day_secs = secs.rem_euclid(86400);
    format!(
        "{y:04}-{mo:02}-{d:02}T{:02}:{:02}:{:02}.{ms:03}Z",
        day_secs / 3600,
        (day_secs % 3600) / 60,
        day_secs % 60
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// `new Date(str).getTime()` for the ISO-8601 shapes harnesses emit:
/// `YYYY-MM-DD[T ]HH:MM[:SS[.frac]][Z|±HH[:MM]]` or bare `YYYY-MM-DD` (UTC
/// midnight, matching JS). Returns epoch ms; None when unparseable.
pub fn parse_iso_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    let bytes = s.as_bytes();
    if bytes.len() < 10 {
        return None;
    }
    let num = |i: usize, n: usize| -> Option<i64> { s.get(i..i + n)?.parse().ok() };
    let (y, mo, d) = (num(0, 4)? as i32, num(5, 2)? as u32, num(8, 2)? as u32);
    if bytes.get(4) != Some(&b'-') || bytes.get(7) != Some(&b'-') {
        return None;
    }
    if bytes.len() == 10 {
        return Some(days_from_civil(y, mo, d) * 86_400_000);
    }
    if !(bytes[10] == b'T' || bytes[10] == b' ') {
        return None;
    }
    let (h, mi) = (num(11, 2)?, num(14, 2)?);
    let mut i = 16;
    let mut sec = 0i64;
    let mut frac_ms = 0i64;
    if bytes.get(16) == Some(&b':') {
        sec = num(17, 2)?;
        i = 19;
        if bytes.get(19) == Some(&b'.') {
            let start = 20;
            let mut end = start;
            while bytes.get(end).is_some_and(|b| b.is_ascii_digit()) {
                end += 1;
            }
            let frac = &s[start..end];
            let scaled = format!("{frac:<0width$}", width = 3);
            frac_ms = scaled.get(..3)?.parse().ok()?;
            i = end;
        }
    }
    let days = days_from_civil(y, mo, d);
    let mut ms = days * 86_400_000 + (h * 3600 + mi * 60 + sec) * 1000 + frac_ms;
    match bytes.get(i) {
        Some(b'Z') | None => {}
        Some(b'+') | Some(b'-') => {
            let sign = if bytes[i] == b'-' { -1i64 } else { 1 };
            let off_h = num(i + 1, 2)?;
            let off_m = if bytes.get(i + 3) == Some(&b':') {
                num(i + 4, 2)?
            } else {
                num(i + 3, 2).unwrap_or(0)
            };
            ms -= sign * (off_h * 3600 + off_m) * 1000;
        }
        _ => return None,
    }
    Some(ms)
}

fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y } as i64;
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = ((m as i64) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + (d as i64) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kebab_names_match_ts() {
        assert_eq!(
            generate_agent_name("/Users/x/My_Project", 42),
            "my-project-42"
        );
        assert_eq!(generate_agent_name("/a/b/.worktrees/x y", 7), "x-y-7");
        assert_eq!(generate_agent_name("", 9), "unknown-9");
        assert_eq!(generate_agent_name("/", 1), "unknown-1");
    }

    #[test]
    fn iso_utc_formats_epoch_ms() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_utc(1759969523000), "2025-10-09T00:25:23.000Z");
    }

    #[test]
    fn iso_parse_roundtrip() {
        assert_eq!(parse_iso_ms("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(
            parse_iso_ms("2025-10-09T00:25:23.000Z"),
            Some(1759969523000)
        );
        assert_eq!(parse_iso_ms("2025-10-09"), Some(1759968000000));
        assert_eq!(
            parse_iso_ms("2025-10-09T08:25:23+08:00"),
            Some(1759969523000)
        );
        assert_eq!(parse_iso_ms("garbage"), None);
    }

    #[test]
    fn greedy_match_is_one_to_one_by_delta() {
        let p = |pid: i64, cwd: &str, start: i64| AgentProc {
            pid,
            ppid: None,
            tty: None,
            command: None,
            cwd: Some(cwd.into()),
            session_file: None,
            start_time_ms: Some(start),
        };
        let s = |id: &str, cwd: &str, bt: i64| SessionFile {
            session_id: id.into(),
            file_path: format!("/x/{id}.jsonl"),
            project_dir: "/x".into(),
            birthtime_ms: bt,
            resolved_cwd: cwd.into(),
        };
        // p1 nearer s1, p2 also within tolerance of s1 — s1 wins the closer.
        let procs = [p(1, "/a", 0), p(2, "/a", 1000)];
        let pref: Vec<&AgentProc> = procs.iter().collect();
        let sessions = vec![s("s1", "/a", 100), s("s2", "/a", 1200)];
        let m = match_processes_to_sessions(&pref, &sessions);
        assert_eq!(m.len(), 2);
        assert_eq!(m[0].session_idx, 0); // p1↔s1 (delta 100)
                                         // out-of-tolerance and wrong-cwd pairs excluded
        let procs2 = [p(3, "/a", 0), p(4, "/b", 0)];
        let pref2: Vec<&AgentProc> = procs2.iter().collect();
        let sessions2 = vec![s("s3", "/a", MATCH_TOLERANCE_MS + 1), s("s4", "/a", 10)];
        let m2 = match_processes_to_sessions(&pref2, &sessions2);
        assert_eq!(m2.len(), 1);
        assert_eq!(m2[0].proc.pid, 3);
        assert_eq!(m2[0].session_idx, 1);
    }
}
