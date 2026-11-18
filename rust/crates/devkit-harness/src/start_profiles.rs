//! Per-harness start profiles — the data port of TS
//! `HARNESS_RUNTIME_PROFILES`
//! (`packages/agent-manager/src/harnesses/runtimeProfiles.ts`). Spawning an
//! agent needs the launch command, the runtime kind (`herdr --kind`), and a
//! process matcher for PID resolution after spawn.

/// Process-command matcher — data port of the TS matcher closures. Semantics
/// are copied verbatim so daemon PID detection agrees with the TS sweep.
#[derive(Debug, Clone, Copy)]
pub enum MatchSpec {
    /// argv[0] basename equals the name (`matchArgv0`).
    Argv0(&'static str),
    /// argv[0] contains the name (`matchArgv0Name`).
    Argv0Contains(&'static str),
    /// Any token's basename is one of the names (`matchAnyBasename`).
    AnyBasename(&'static [&'static str]),
    /// Direct OMP executable or the Bun-launched OMP CLI entry point.
    Omp,
}

/// What a start needs beyond discovery: the command to run, the kind passed
/// to herdr, and the matcher for resolving the spawned pid.
pub struct StartProfile {
    pub command: &'static str,
    pub runtime_kind: &'static str,
    pub discovery_aliases: &'static [&'static str],
    pub matcher: MatchSpec,
}

/// `agent.start` type → launch profile. Keys match the TS
/// `StartableAgentType` wire values.
pub fn start_profile(agent_type: &str) -> Option<StartProfile> {
    let p = |command: &'static str,
             kind: &'static str,
             aliases: &'static [&'static str],
             matcher: MatchSpec| {
        Some(StartProfile {
            command,
            runtime_kind: kind,
            discovery_aliases: aliases,
            matcher,
        })
    };
    match agent_type {
        "claude" => p("claude", "claude", &["claude"], MatchSpec::Argv0("claude")),
        "codex" => p("codex", "codex", &["codex"], MatchSpec::Argv0("codex")),
        "copilot" => p(
            "copilot",
            "copilot",
            &["copilot"],
            MatchSpec::Argv0Contains("copilot-cli"),
        ),
        "gemini_cli" => p(
            "gemini",
            "gemini",
            &["gemini", "gemini_cli"],
            MatchSpec::AnyBasename(&["gemini"]),
        ),
        "grok_cli" => p(
            "grok",
            "grok",
            &["grok", "grok_cli"],
            MatchSpec::Argv0("grok"),
        ),
        "antigravity_cli" => p(
            "agy",
            "agy",
            &["agy", "antigravity", "antigravity_cli"],
            MatchSpec::Argv0("agy"),
        ),
        "opencode" => p(
            "opencode",
            "opencode",
            &["opencode"],
            MatchSpec::Argv0("opencode"),
        ),
        "pi" => p("pi", "pi", &["pi"], MatchSpec::AnyBasename(&["pi"])),
        // TS launches `kiro-cli` but the harness type/kind is `kiro`.
        "kiro" => p(
            "kiro-cli",
            "kiro",
            &["kiro", "kiro_cli", "kiro-cli"],
            MatchSpec::AnyBasename(&["kiro-cli", "kiro"]),
        ),
        "devin" => p("devin", "devin", &["devin"], MatchSpec::Argv0("devin")),
        "muse" => p("muse", "muse", &["muse"], MatchSpec::Argv0Contains("muse")),
        "omp" => p("omp", "omp", &["omp"], MatchSpec::Omp),
        _ => None,
    }
}

impl MatchSpec {
    /// Whether `ps_command` (a full command line from `ps -o command=`)
    /// belongs to the harness — ports the TS closures branch-for-branch.
    pub fn matches(&self, ps_command: &str) -> bool {
        let tokens = tokens_of(ps_command);
        if tokens.is_empty() {
            return false;
        }
        match self {
            MatchSpec::Argv0(name) => {
                let test = |t: &str| basename_of(t) == name.to_lowercase();
                if test(tokens[0]) {
                    return true;
                }
                may_continue_argv0(&tokens, &test) && test(executable_path(ps_command).as_str())
            }
            MatchSpec::Argv0Contains(name) => {
                let lower = name.to_lowercase();
                let test = |t: &str| t.to_lowercase().contains(&lower);
                if test(tokens[0]) {
                    return true;
                }
                may_continue_argv0(&tokens, &test) && test(executable_path(ps_command).as_str())
            }
            MatchSpec::AnyBasename(names) => {
                let test = |t: &str| names.iter().any(|n| basename_of(t) == n.to_lowercase());
                if test(tokens[0]) {
                    return true;
                }
                if !tokens[1..].iter().any(|t| test(t)) {
                    return false;
                }
                if !is_absolute(tokens[0]) {
                    return true;
                }
                let (argv0, args) = split_argv0(ps_command);
                test(&argv0) || args.iter().any(|a| test(a))
            }
            MatchSpec::Omp => is_omp_command(ps_command),
        }
    }
}

fn is_omp_command(ps_command: &str) -> bool {
    let tokens = ps_command.replace('\\', "/");
    let mut parts = tokens.split_whitespace();
    let Some(argv0) = parts.next() else {
        return false;
    };
    let base = basename_of(argv0);
    if base == "omp" || base == "omp.exe" || base == "omp.js" {
        return true;
    }
    if base != "bun" && base != "bun.exe" {
        return false;
    }
    parts.any(|token| {
        let base = basename_of(token);
        (token.ends_with("/bin/omp") || token.ends_with("/bin/omp.exe"))
            && (base == "omp" || base == "omp.exe")
            || (base == "cli.js"
                && token.contains("/@oh-my-pi/pi-coding-agent/")
                && token.ends_with("/dist/cli.js"))
    })
}

fn tokens_of(ps_command: &str) -> Vec<&str> {
    ps_command.split_whitespace().collect()
}

/// Last path segment, lowercased — mirrors `path.basename` incl. trailing
/// slashes (`/a/b/` → "b").
fn basename_of(token: &str) -> String {
    token
        .trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .to_lowercase()
}

/// `/x` or `C:\x` — the TS ABSOLUTE_PATH regex.
fn is_absolute(token: &str) -> bool {
    token.starts_with('/')
        || (token.len() >= 3
            && token.as_bytes()[1] == b':'
            && token.as_bytes()[0].is_ascii_alphabetic()
            && matches!(token.as_bytes()[2], b'/' | b'\\'))
}

/// The absolute-argv0-may-continue helper: argv0 is a path but spaces may
/// split it across later tokens; only then is re-resolution worthwhile.
fn may_continue_argv0(tokens: &[&str], test: &dyn Fn(&str) -> bool) -> bool {
    is_absolute(tokens[0])
        && tokens[1..]
            .iter()
            .any(|t| (t.contains('/') || t.contains('\\')) && test(t))
}

/// Resolve argv[0] from a `ps` command line. First token wins unless the
/// command is absolute and a longer prefix resolves to a real file — argv0
/// may live under a directory containing spaces. Ports `executablePath`.
fn executable_path(command: &str) -> String {
    // split with separators kept — mirrors /(\s+)/ semantics.
    let trimmed = command.trim();
    let mut parts: Vec<&str> = Vec::new();
    let mut last = 0;
    for (i, c) in trimmed.char_indices() {
        if c.is_whitespace() {
            parts.push(&trimmed[last..i]);
            parts.push(&trimmed[i..i + c.len_utf8()]);
            last = i + c.len_utf8();
        }
    }
    parts.push(&trimmed[last..]);

    let first = parts.first().copied().unwrap_or("");
    if parts.len() == 1 || !is_absolute(first) || is_file(first) {
        return first.to_string();
    }
    let mut prefix = first.to_string();
    let mut i = 2;
    while i < parts.len() {
        prefix.push_str(parts[i - 1]);
        prefix.push_str(parts[i]);
        if (parts[i].contains('/') || parts[i].contains('\\')) && is_file(&prefix) {
            return prefix;
        }
        i += 2;
    }
    first.to_string()
}

fn is_file(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

/// (argv0, remaining tokens) once the executable prefix is resolved.
fn split_argv0(ps_command: &str) -> (String, Vec<String>) {
    let command = ps_command.trim();
    let argv0 = executable_path(command);
    let args = command[argv0.len()..]
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();
    (argv0, args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    fn profile(t: &str) -> StartProfile {
        start_profile(t).unwrap()
    }

    #[test]
    fn keeps_launch_and_runtime_identity_together() {
        let a = profile("antigravity_cli");
        assert_eq!(a.command, "agy");
        assert_eq!(a.runtime_kind, "agy");
        assert_eq!(
            a.discovery_aliases,
            &["agy", "antigravity", "antigravity_cli"]
        );
        assert!(a.matcher.matches("/usr/local/bin/agy"));
    }

    #[test]
    fn recognizes_agent_commands_not_argument_text() {
        assert!(profile("copilot")
            .matcher
            .matches("/opt/copilot-cli/1.0/copilot"));
        assert!(!profile("copilot")
            .matcher
            .matches("node /repo/copilot-cli/script.js"));
        assert!(profile("grok_cli")
            .matcher
            .matches("/Users/dev/.grok/bin/grok --approve"));
        assert!(!profile("grok_cli")
            .matcher
            .matches("node /repo/grok-cli/script.js"));
        assert!(profile("gemini_cli")
            .matcher
            .matches("node --no-warnings /usr/local/bin/gemini"));
    }

    #[test]
    fn profiles_the_versioned_muse_launcher() {
        let mu = profile("muse");
        assert_eq!(mu.command, "muse");
        assert!(mu
            .matcher
            .matches("/Users/dev/.local/bin/muse-bin-1.4.4-R5419.1"));
        assert!(mu.matcher.matches("/usr/local/bin/muse"));
    }

    #[test]
    fn kiro_launches_kiro_cli() {
        let k = profile("kiro");
        assert_eq!(k.command, "kiro-cli");
        assert_eq!(k.runtime_kind, "kiro");
    }

    #[test]
    fn omp_profile_matches_direct_and_bun_cli() {
        let omp = profile("omp");
        assert_eq!(omp.command, "omp");
        assert_eq!(omp.runtime_kind, "omp");
        assert_eq!(omp.discovery_aliases, &["omp"]);
        assert!(omp.matcher.matches("omp --profile work"));
        assert!(omp.matcher.matches(
            "/home/me/.bun/bin/bun /home/me/.npm/@oh-my-pi/pi-coding-agent/dist/cli.js --profile work"
        ));
        assert!(omp.matcher.matches(
            "bun /home/me/.nvm/versions/node/v24.15.0/bin/omp --no-session --mode rpc --no-ui"
        ));
        assert!(!omp.matcher.matches("bun /repo/tools/cli.js"));
        assert!(!omp.matcher.matches("node /repo/tool.js omp"));
    }

    #[test]
    fn all_startable_types_have_profiles() {
        for t in [
            "claude",
            "codex",
            "copilot",
            "gemini_cli",
            "grok_cli",
            "antigravity_cli",
            "opencode",
            "pi",
            "kiro",
            "devin",
            "muse",
            "omp",
        ] {
            assert!(start_profile(t).is_some(), "missing profile for {t}");
        }
        assert!(start_profile("nope").is_none());
    }

    // --- spaced-directory cases (tmpdir fixtures, mirrors the TS suite) ---

    fn install(root: &Path, rel: &str) -> String {
        let full = root.join(rel);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(&full, "").unwrap();
        full.to_string_lossy().into_owned()
    }

    fn tmpdir() -> PathBuf {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let d = std::env::temp_dir().join(format!(
            "sp-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn argv0_under_spaced_directory() {
        let root = tmpdir();
        let codex = install(&root, "Applications/Some App.app/Contents/Resources/codex");
        let claude = install(&root, "Users/dev/My Tools/bin/claude");
        let codex_m = profile("codex");
        let claude_m = profile("claude");
        assert!(codex_m
            .matcher
            .matches(&format!("{codex} --sandbox workspace-write")));
        assert!(codex_m.matcher.matches(&codex));
        assert!(claude_m.matcher.matches(&format!("{claude} --continue")));
        assert!(!claude_m
            .matcher
            .matches(&format!("{codex} exec --cd /repo")));
    }

    #[test]
    fn argv0_by_distribution_name_under_spaced_directory() {
        let root = tmpdir();
        let copilot = install(&root, "opt/Home Brew/Caskroom/copilot-cli/1.0.60/copilot");
        assert!(profile("copilot")
            .matcher
            .matches(&format!("{copilot} --allow-all-tools")));
    }

    #[test]
    fn spaced_arguments_are_not_the_executable() {
        let root = tmpdir();
        let vim = install(&root, "usr/bin/vim");
        let codex = install(&root, "Applications/Some App.app/Contents/Resources/codex");
        let claude_m = profile("claude");
        assert!(!claude_m.matcher.matches(&format!("{vim} My Notes/claude")));
        assert!(!claude_m
            .matcher
            .matches(&format!("{codex} exec review the Other Dir/claude")));
        assert!(!profile("copilot")
            .matcher
            .matches(&format!("{vim} Some Dir/copilot-cli/notes.md")));
        assert!(!claude_m.matcher.matches("/usr/bin/vim My Notes/claude"));
    }

    #[test]
    fn spaced_argv0_in_script_aware_matchers() {
        let root = tmpdir();
        let pi = install(&root, "Users/dev/Node Tools/bin/pi");
        let kiro = install(&root, "Applications/Kiro CLI.app/Contents/MacOS/kiro-cli");
        let node = install(&root, "Applications/Dev Tools/node/bin/node");
        assert!(profile("pi").matcher.matches(&format!("{pi} --model x")));
        assert!(profile("kiro").matcher.matches(&format!("{kiro} chat")));
        assert!(profile("gemini_cli")
            .matcher
            .matches(&format!("{node} /Users/dev/.npm/bin/gemini --yolo")));
        assert!(!profile("pi")
            .matcher
            .matches(&format!("{node} /opt/pi-tools/script.js")));
    }

    #[test]
    fn agent_words_inside_executable_directory_do_not_match() {
        let root = tmpdir();
        let node = install(&root, "opt/Dev pi gemini/bin/node");
        assert!(!profile("pi")
            .matcher
            .matches(&format!("{node} /repo/script.js")));
        assert!(!profile("gemini_cli")
            .matcher
            .matches(&format!("{node} /repo/script.js")));
        assert!(profile("gemini_cli")
            .matcher
            .matches(&format!("{node} /repo/bin/gemini")));
        assert!(profile("pi").matcher.matches(&format!("{node} --title pi")));
    }
}
