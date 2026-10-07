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
    let mut procs: Vec<AgentProc> = text
        .lines()
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
                cwd: cwd_of(pid),
                session_file: None,
            })
        })
        .collect();
    procs.sort_by_key(|p| p.pid);
    procs
}

fn cwd_of(pid: i64) -> Option<String> {
    // /proc readlink — one syscall, no lsof/pwdx spawn.
    std::fs::read_link(format!("/proc/{pid}/cwd"))
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}
