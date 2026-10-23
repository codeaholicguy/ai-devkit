//! `agent.*` ops — one file per method, shared helpers here.

pub mod start;

/// `/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/` ported without the regex crate.
pub(super) fn valid_agent_name(name: &str) -> bool {
    let b = name.as_bytes();
    (2..=64).contains(&b.len())
        && b.iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
        && b[0] != b'-'
        && b[b.len() - 1] != b'-'
}

/// `generateAgentName` — `{basename-sanitized}-{epoch-ms base36}`.
pub(super) fn generate_agent_name(cwd: &str) -> String {
    let folder = std::path::Path::new(cwd)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut folder: String = folder
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_lowercase() || c.is_ascii_digit() {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(50)
        .collect();
    if folder.is_empty() {
        folder = "agent".into();
    }
    format!("{}-{}", folder, base36(devkit_core::store::chrono_now()))
}

fn base36(mut n: i64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    out.iter().rev().map(|c| *c as char).collect()
}

/// Process liveness lives in devkit-core (prune_dead needs it too).
pub(super) use devkit_core::discover::pid_alive;
