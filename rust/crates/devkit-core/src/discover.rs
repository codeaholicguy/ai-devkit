use std::process::Command;

/// One discovered agent process. Harness attribution stays client-side
/// (coordination-only scope) — the daemon reports facts: pid/ppid/tty/command/cwd.
#[derive(Debug, Clone)]
pub struct AgentProc {
    pub pid: i64,
    pub ppid: Option<i64>,
    pub tty: Option<String>,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub session_file: Option<String>,
    /// Epoch ms when the process started — populated by `enrich_agents`.
    pub start_time_ms: Option<i64>,
}

/// Executable basenames we treat as agent harnesses. Mirrors the adapter
/// processNames lists in packages/agent-manager/src/harnesses.
const AGENT_BINARIES: &[&str] = &[
    "claude",
    "codex",
    "gemini",
    "copilot",
    "grok",
    "opencode",
    "pi",
    "kiro-cli-chat",
    "devin",
    "kimi",
    "cursor-agent",
    "droid",
];

fn is_agent_command(cmd: &str) -> bool {
    let base = cmd
        .split_whitespace()
        .next()
        .and_then(|p| p.rsplit('/').next())
        .unwrap_or("");
    AGENT_BINARIES.contains(&base)
}

/// Single `ps -axo` sweep — replaces the per-invocation shell-outs the CLI does
/// today. Runs once per interval for all subscribers.
pub fn sweep() -> Vec<AgentProc> {
    let Ok(out) = Command::new("ps")
        .args(["-axo", "pid=,ppid=,tty=,command="])
        .output()
    else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut procs = parse_ps_output(&text, true);
    procs.sort_by_key(|p| p.pid);
    procs
}

/// Parse `ps -axo pid=,ppid=,tty=,command=` output into agent procs.
/// `resolve_cwd` gates the /proc lookup so tests can parse fixtures without
/// touching the live process table.
fn parse_ps_output(text: &str, resolve_cwd: bool) -> Vec<AgentProc> {
    text.lines()
        .filter_map(|line| {
            let mut it = line.trim().splitn(4, char::is_whitespace);
            let pid: i64 = it.next()?.parse().ok()?;
            let ppid: i64 = it.next()?.parse().ok()?;
            let tty = it.next().map(|s| s.to_string());
            let command = it.next().unwrap_or("").trim().to_string();
            if !is_agent_command(&command) {
                return None;
            }
            Some(AgentProc {
                pid,
                ppid: Some(ppid),
                tty,
                command: Some(command),
                cwd: if resolve_cwd { cwd_of(pid) } else { None },
                session_file: None,
                start_time_ms: None,
            })
        })
        .collect()
}

fn cwd_of(pid: i64) -> Option<String> {
    // /proc readlink — one syscall, no lsof/pwdx spawn.
    std::fs::read_link(format!("/proc/{pid}/cwd"))
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

/// Fill `cwd` and `start_time_ms` for every proc — mirrors agent-manager's
/// `enrichProcesses`: one `lsof` batch for cwds (works on macOS, where /proc
/// doesn't exist), one `ps lstart` batch for start times. Partial results
/// are fine; failed pids keep `None`.
pub fn enrich_agents(procs: &mut [AgentProc]) {
    if procs.is_empty() {
        return;
    }
    let pids: Vec<String> = procs.iter().map(|p| p.pid.to_string()).collect();
    let cwd_map = batch_cwds(&pids);
    let start_map = batch_start_times(&pids);
    for proc in procs.iter_mut() {
        if proc.cwd.is_none() {
            proc.cwd = cwd_map.get(&proc.pid).cloned();
        }
        proc.start_time_ms = start_map.get(&proc.pid).copied();
    }
}

/// `lsof -a -d cwd -Fn -p <pids>` → {pid: cwd}. Output format: `p<pid>\nn<path>`…
fn batch_cwds(pids: &[String]) -> std::collections::HashMap<i64, String> {
    let mut out = std::collections::HashMap::new();
    let Ok(res) = Command::new("lsof")
        .args(["-a", "-d", "cwd", "-Fn", "-p", &pids.join(",")])
        .output()
    else {
        return out;
    };
    let mut current: Option<i64> = None;
    for line in String::from_utf8_lossy(&res.stdout).lines() {
        if let Some(rest) = line.strip_prefix('p') {
            current = rest.parse().ok();
        } else if let (Some(pid), Some(rest)) = (current, line.strip_prefix('n')) {
            out.insert(pid, rest.to_string());
            current = None;
        }
    }
    out
}

/// `ps -o pid=,lstart= -p <pids>` → {pid: epoch_ms}. lstart format is fixed:
/// `Wed Mar 18 23:18:01 2026` (day-of-week, month, day, time, year).
fn batch_start_times(pids: &[String]) -> std::collections::HashMap<i64, i64> {
    let mut out = std::collections::HashMap::new();
    let Ok(res) = Command::new("ps")
        .args(["-o", "pid=,lstart=", "-p", &pids.join(",")])
        .output()
    else {
        return out;
    };
    for line in String::from_utf8_lossy(&res.stdout).lines() {
        let line = line.trim();
        let Some((pid_s, date_s)) = line.split_once(char::is_whitespace) else {
            continue;
        };
        let Ok(pid) = pid_s.parse::<i64>() else {
            continue;
        };
        if let Some(ms) = parse_lstart(date_s.trim()) {
            out.insert(pid, ms);
        }
    }
    out
}

/// Parse `Wed Mar 18 23:18:01 2026` → epoch ms (local time, matching the
/// platform `ps` output — same interpretation JS `new Date(str)` applies).
fn parse_lstart(s: &str) -> Option<i64> {
    let mut it = s.split_whitespace();
    it.next()?; // weekday — ignored
    let month = match it.next()? {
        "Jan" => 1,
        "Feb" => 2,
        "Mar" => 3,
        "Apr" => 4,
        "May" => 5,
        "Jun" => 6,
        "Jul" => 7,
        "Aug" => 8,
        "Sep" => 9,
        "Oct" => 10,
        "Nov" => 11,
        "Dec" => 12,
        _ => return None,
    };
    let day: u32 = it.next()?.parse().ok()?;
    let time = it.next()?;
    let year: i32 = it.next()?.parse().ok()?;
    let mut t = time.split(':');
    let (h, m, sec): (u32, u32, u32) = (
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
    );
    // Days-since-epoch for y/m/d (Howard Hinnant algorithm), then offset by
    // the local timezone the same way libc's mktime does.
    let days = days_from_civil(year, month, day);
    let utc_secs = days * 86400 + (h as i64) * 3600 + (m as i64) * 60 + sec as i64;
    Some((utc_secs + local_utc_offset_secs(utc_secs)) * 1000)
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

/// Local UTC offset in seconds at `utc_secs`, via libc localtime.
fn local_utc_offset_secs(utc_secs: i64) -> i64 {
    unsafe {
        let t = utc_secs as libc::time_t;
        let mut tm: libc::tm = std::mem::zeroed();
        if libc::localtime_r(&t, &mut tm).is_null() {
            return 0;
        }
        // tm_gmtoff is seconds east of UTC; local time = utc + offset, so the
        // inverse (utc = local - offset) needs -offset... but ps lstart is
        // already LOCAL time we converted as if UTC, so subtract the offset
        // to recover the true UTC instant.
        -(tm.tm_gmtoff as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Golden fixture: representative `ps -axo pid=,ppid=,tty=,command=` rows —
    // agent harnesses interleaved with system noise, args, and nested paths.
    const PS_FIXTURE: &str = "\
      1      0 ?        /sbin/init
   2044   1 pts/0    /bin/zsh
  15011 2044 pts/1    vim notes.md
3164044 3160 pts/0    tmux: server
3164590 3164044 pts/0    pi --model glm
 881120 2044 pts/2    /usr/bin/claude --resume abc123
 881121 881120 ?        node /opt/tools/codex-linux.js
 991000 2044 pts/3    gemini
1234567    1 ?        /usr/lib/systemd/systemd --user
";

    #[test]
    fn fixture_keeps_agents_drops_noise() {
        let procs = parse_ps_output(PS_FIXTURE, false);
        let pids: Vec<i64> = procs.iter().map(|p| p.pid).collect();
        // 881121 (`node .../codex-linux.js`) is dropped: basename `node` is not
        // an agent binary. Known limitation vs the TS adapters, which match on
        // richer process metadata — recorded as a phase-2 knowledge-port item.
        assert_eq!(pids, vec![3164590, 881120, 991000]);
    }

    #[test]
    fn fixture_extracts_basename_through_paths_and_args() {
        let procs = parse_ps_output(PS_FIXTURE, false);
        let claude = procs.iter().find(|p| p.pid == 881120).unwrap();
        assert_eq!(claude.tty.as_deref(), Some("pts/2"));
        assert!(claude.command.as_deref().unwrap().contains("claude"));
        // Bare name (pi) and full path (claude) both match via basename.
    }

    #[test]
    fn malformed_lines_are_skipped() {
        let procs = parse_ps_output("garbage\n  abc x ? y\n", false);
        assert!(procs.is_empty());
    }
}
