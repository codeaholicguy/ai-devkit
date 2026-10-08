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
