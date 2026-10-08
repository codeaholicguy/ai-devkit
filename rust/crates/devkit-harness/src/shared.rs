//! Helpers shared by ported harness adapters — mirrors
//! `packages/agent-manager/src/harnesses/shared.ts` and `utils/matching.ts`.

use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;
use std::path::Path;

/// `MATCH_TOLERANCE_MS` — max |procStart − session birthtime| for legacy
/// matching (3 min, same as utils/matchingConstants.ts).
pub const MATCH_TOLERANCE_MS: i64 = 3 * 60 * 1000;

/// `pathBasename` — basename after '\'→'/', lowercased.
pub fn path_basename(p: &str) -> String {
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

/// `normalizeExecutableName` — lowercase + strip a `.exe` suffix; applied to
/// both the pattern names and each candidate basename (TS does both, so a
/// `agy.exe` proc still matches the `agy` pool).
fn normalize_executable_name(name: &str) -> String {
    let lower = name.to_lowercase();
    lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
}

/// `matchesExecutableName` — first-token basename match, else (absolute first
/// token only) a later path-like token whose basename matches, confirmed by
/// the on-disk-resolved `executablePath`.
pub fn matches_executable_name(command: &str, names: &[&str]) -> bool {
    let norm: Vec<String> = names.iter().map(|n| normalize_executable_name(n)).collect();
    let tokens: Vec<&str> = command.split_whitespace().collect();
    let first = tokens.first().copied().unwrap_or("");
    if norm
        .iter()
        .any(|n| *n == normalize_executable_name(&path_basename(first)))
    {
        return true;
    }
    if !is_absolute(first) {
        return false;
    }
    let may_continue = tokens[1..].iter().any(|t| {
        (t.contains('/') || t.contains('\\'))
            && norm
                .iter()
                .any(|n| *n == normalize_executable_name(&path_basename(t)))
    });
    may_continue
        && norm
            .iter()
            .any(|n| *n == normalize_executable_name(&executable_basename(command)))
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

/// `safeReaddir` — directory entry names; empty on error. Node ≥20.1's
/// `fs.readdirSync` returns names in sorted order, so adapters that mirror
/// `safeReaddir` must sort too or output order diverges on raw `read_dir`.
pub fn list_dir_names(dir: &Path) -> Vec<String> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = rd
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// File birth time in epoch ms (`statSync().birthtimeMs`), via `st_birthtime`.
/// Returns None when unreadable or non-positive — TS skips those entries.
pub fn birthtime_ms(path: &str) -> Option<i64> {
    let meta = std::fs::metadata(path).ok()?;
    let created = meta.created().ok()?;
    let ms = created
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as i64;
    if ms > 0 { Some(ms) } else { None }
}

/// `toSessionDayKey` — `YYYY/MM/DD` in **local** civil time (Codex date dirs
/// are local, matching JS `getFullYear()/getMonth()/getDate()`).
pub fn local_day_key(epoch_ms: i64) -> String {
    let secs = (epoch_ms / 1000) as libc::time_t;
    unsafe {
        let mut tm: libc::tm = std::mem::zeroed();
        if libc::localtime_r(&secs, &mut tm).is_null() {
            return String::new();
        }
        format!(
            "{:04}/{:02}/{:02}",
            tm.tm_year + 1900,
            tm.tm_mon + 1,
            tm.tm_mday
        )
    }
}

/// `isIdle` — untouched for more than 5 minutes. TS compares
/// `(now - last) / 60000 > 5` in floats ⟺ `now - last > 300_000`.
pub fn is_idle(last_active_ms: i64, now_ms: i64) -> bool {
    now_ms - last_active_ms > 300_000
}

/// `flattenTextBlocks` — a string is used as-is; an array joins each
/// block's `text` when the block is an object with a string `text`;
/// anything else yields "".
pub fn flatten_text_blocks(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(blocks) => blocks
            .iter()
            .map(|b| {
                b.get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or_default()
            })
            .collect(),
        _ => String::new(),
    }
}

/// `encodeURIComponent` — UTF-8 percent-encoding; unreserved set is
/// `A-Z a-z 0-9 - _ . ! ~ * ' ( )` (Grok session group dir names).
pub fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*'
            | b'\'' | b'(' | b')' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// `truncate` — `...`-suffix at `max` UTF-16 code units (JS `length`/`slice`
/// semantics; SUMMARY_MAX_LENGTH = 120).
pub fn truncate(value: &str, max: usize) -> String {
    if value.encode_utf16().count() <= max {
        return value.to_string();
    }
    let units: Vec<u16> = value.encode_utf16().take(max - 3).collect();
    format!("{}...", String::from_utf16_lossy(&units))
}

/// `parseTimestamp` — numbers in seconds or ms, or ISO-8601 strings.
pub fn parse_timestamp_ms(value: &serde_json::Value) -> Option<i64> {
    match value {
        serde_json::Value::Number(n) => {
            let v = n.as_f64()?;
            if !v.is_finite() {
                return None;
            }
            Some(if v.abs() < 1_000_000_000_000.0 {
                (v * 1000.0) as i64
            } else {
                v as i64
            })
        }
        serde_json::Value::String(s) => parse_iso_ms(s),
        _ => None,
    }
}

/// Cold-start bounds for bounded JSONL summary reads (IncrementalJsonlSummary).
pub const JSONL_HEAD_BYTES: usize = 1024 * 1024;
pub const JSONL_TAIL_BYTES: usize = 4 * 1024 * 1024;

/// Fold an append-only JSONL file with the IncrementalJsonlSummary semantics:
/// full file when ≤ head+tail, else complete head lines + `skip()` + lines
/// starting inside the tail window; an unterminated last line applies
/// tentatively when it already parses.
pub fn fold_jsonl_bounded<S>(
    path: &str,
    initial: S,
    mut reduce: impl FnMut(S, Option<&serde_json::Value>) -> S,
    mut skip: impl FnMut(S) -> S,
) -> Option<S> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let size = meta.len() as usize;

    if size > JSONL_HEAD_BYTES + JSONL_TAIL_BYTES {
        let head_end = bytes[..JSONL_HEAD_BYTES]
            .iter()
            .rposition(|&b| b == b'\n')
            .map(|p| p + 1)
            .unwrap_or(0);
        let (head_state, _) = fold_lines_with(initial, &bytes[..head_end], false, &mut reduce);
        let skipped = skip(head_state);
        let tail_start = size - JSONL_TAIL_BYTES;
        let from = bytes[tail_start - 1..]
            .iter()
            .position(|&b| b == b'\n')
            .map(|p| tail_start + p)
            .unwrap_or(bytes.len());
        let (tail_state, consumed) = fold_lines_with(skipped, &bytes[from..], false, &mut reduce);
        Some(reduce_tentative_jsonl(
            tail_state,
            &bytes[from + consumed..],
            &mut reduce,
        ))
    } else {
        let (s, consumed) = fold_lines_with(initial, &bytes, false, &mut reduce);
        Some(reduce_tentative_jsonl(s, &bytes[consumed..], &mut reduce))
    }
}

fn fold_lines_with<S>(
    mut state: S,
    bytes: &[u8],
    discarding_first: bool,
    reduce: &mut impl FnMut(S, Option<&serde_json::Value>) -> S,
) -> (S, usize) {
    let mut i = 0usize;
    let mut discarding = discarding_first;
    while i < bytes.len() {
        let Some(nl) = bytes[i..].iter().position(|&b| b == b'\n').map(|p| i + p) else {
            break;
        };
        if discarding {
            discarding = false;
        } else if let Ok(s) = std::str::from_utf8(&bytes[i..nl]) {
            state = reduce_jsonl_line(state, s, reduce);
        } else {
            state = reduce(state, None);
        }
        i = nl + 1;
    }
    (state, i)
}

/// `reduceTentative` — apply an unterminated last line only when it already
/// parses as complete JSON.
fn reduce_tentative_jsonl<S>(
    state: S,
    rest: &[u8],
    reduce: &mut impl FnMut(S, Option<&serde_json::Value>) -> S,
) -> S {
    match std::str::from_utf8(rest) {
        Ok(s) if !s.chars().any(|c| !c.is_whitespace()) => state,
        Ok(s) => match serde_json::from_str::<serde_json::Value>(s) {
            Ok(v) => reduce(state, Some(&v)),
            Err(_) => state,
        },
        Err(_) => state,
    }
}

/// `reduceLine` — blank lines and unparseable JSON fold as `undefined`.
fn reduce_jsonl_line<S>(
    state: S,
    line: &str,
    reduce: &mut impl FnMut(S, Option<&serde_json::Value>) -> S,
) -> S {
    if !line.chars().any(|c| !c.is_whitespace()) {
        return state;
    }
    match serde_json::from_str::<serde_json::Value>(line) {
        Ok(v) => reduce(state, Some(&v)),
        Err(_) => reduce(state, None),
    }
}

/// `readFileHead` — the first line of a file, at most `max_bytes`.
/// Returns (text, bytes_consumed, complete, truncated).
pub fn read_file_head(path: &str, max_bytes: usize) -> Option<(String, usize, bool, bool)> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = Vec::with_capacity(max_bytes.min(64 * 1024));
    let mut chunk = [0u8; 16 * 1024];
    loop {
        if buf.len() >= max_bytes {
            break;
        }
        let want = chunk.len().min(max_bytes - buf.len());
        let n = match f.read(&mut chunk[..want]) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        let start = buf.len();
        buf.extend_from_slice(&chunk[..n]);
        if let Some(p) = buf[start..].iter().position(|&b| b == b'\n').map(|i| start + i) {
            let text = String::from_utf8_lossy(&buf[..p]).into_owned();
            return Some((text, p + 1, true, false));
        }
    }
    let text = String::from_utf8_lossy(&buf).into_owned();
    Some((text, buf.len(), false, buf.len() >= max_bytes))
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

/// `isSameTerminalProcess` — same non-empty/non-"?" tty and same cwd
/// (or either side's cwd unknown/empty).
pub fn is_same_terminal_process(a: &AgentProc, b: &AgentProc) -> bool {
    let tty_a = a.tty.as_deref().unwrap_or("");
    let tty_b = b.tty.as_deref().unwrap_or("");
    if tty_a.is_empty() || tty_a == "?" || tty_a != tty_b {
        return false;
    }
    let cwd_a = a.cwd.as_deref().unwrap_or("");
    let cwd_b = b.cwd.as_deref().unwrap_or("");
    cwd_a == cwd_b || cwd_a.is_empty() || cwd_b.is_empty()
}

/// `findWrapperProcess` — the first proc that is `child`'s parent and
/// shares its terminal/cwd identity.
pub fn find_wrapper_pid(procs: &[&AgentProc], child: &AgentProc) -> Option<i64> {
    procs.iter().find_map(|p| {
        (p.pid != child.pid
            && child.ppid == Some(p.pid)
            && is_same_terminal_process(p, child))
        .then_some(p.pid)
    })
}

/// `findWrapperProcessPids` — parents of candidates sharing a terminal,
/// plus every proc sharing a terminal with an already-matched process.
pub fn wrapper_pids(
    procs: &[&AgentProc],
    matched: &[&AgentProc],
) -> std::collections::HashSet<i64> {
    let mut wrappers = std::collections::HashSet::new();
    for child in procs {
        if let Some(pid) = find_wrapper_pid(procs, child) {
            wrappers.insert(pid);
        }
    }
    for proc in procs {
        if matched
            .iter()
            .any(|m| proc.pid != m.pid && is_same_terminal_process(proc, m))
        {
            wrappers.insert(proc.pid);
        }
    }
    wrappers
}

/// pid → sessionFilePath rows for `agent_type` from the shared
/// `<home>/.ai-devkit/agents.db` registry — mirrors `AgentRegistry.list()`
/// filtered the way `mapRegistryCache` does (type + non-empty path;
/// existence is checked by the caller). Readonly open: a missing or
/// unreadable db yields an empty map and never creates the file.
pub fn registry_session_paths(
    home: &Path,
    agent_type: &str,
) -> std::collections::HashMap<i64, String> {
    let db = home.join(".ai-devkit").join("agents.db");
    let Ok(conn) = rusqlite::Connection::open_with_flags(
        &db,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) else {
        return std::collections::HashMap::new();
    };
    let mut stmt = match conn
        .prepare("SELECT pid, session_file_path FROM agents WHERE type = ?1")
    {
        Ok(s) => s,
        Err(_) => return std::collections::HashMap::new(),
    };
    let rows = stmt
        .query_map([agent_type], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })
        .ok();
    match rows {
        Some(it) => it
            .flatten()
            .filter(|(_, p)| !p.is_empty())
            .collect(),
        None => std::collections::HashMap::new(),
    }
}

/// One `agents` row — the fields adapters consult (`AgentRegistry.list`
/// entry subset).
#[derive(Debug, Clone)]
pub struct RegistryRow {
    pub agent_type: String,
    pub pid: i64,
    pub name: String,
    pub session_file_path: String,
}

/// Full registry rows in `AgentRegistry.list()` order
/// (`started_at ASC, name ASC`) so pid-keyed maps mirror JS Map last-wins.
pub fn registry_agent_rows(home: &Path) -> Vec<RegistryRow> {
    let db = home.join(".ai-devkit").join("agents.db");
    let Ok(conn) = rusqlite::Connection::open_with_flags(
        &db,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) else {
        return Vec::new();
    };
    let mut stmt = match conn.prepare(
        "SELECT type, pid, name, session_file_path FROM agents ORDER BY started_at ASC, name ASC",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], |r| {
        Ok(RegistryRow {
            agent_type: r.get::<_, String>(0)?,
            pid: r.get::<_, i64>(1)?,
            name: r.get::<_, String>(2)?,
            session_file_path: r.get::<_, String>(3)?,
        })
    })
    .map(|rows| rows.flatten().collect())
    .unwrap_or_default()
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
