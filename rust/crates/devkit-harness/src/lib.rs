//! Harness knowledge port: per-harness process→session attribution and
//! enrichment, ported from packages/agent-manager adapters. The daemon owns
//! this so every client renders identical agent state.

use devkit_core::agent::EnrichedAgent;
use devkit_core::discover::AgentProc;

pub mod antigravity;
pub mod claude;
pub mod codex;
pub mod copilot;
pub mod devin;
#[cfg(test)]
mod fixtures;
pub mod gemini;
pub mod grok;
pub mod kiro;
pub mod opencode;
pub mod pi;
pub mod shared;

/// Build a registry with every ported adapter for `home` registered.
pub fn default_registry(home: &std::path::Path) -> Registry {
    let mut r = Registry::new();
    r.register(Box::new(claude::ClaudeAdapter::new(home)));
    r.register(Box::new(codex::CodexAdapter::new(home)));
    r.register(Box::new(pi::PiAdapter::new(home)));
    r.register(Box::new(gemini::GeminiAdapter::new(home)));
    r.register(Box::new(copilot::CopilotAdapter::new(home)));
    r.register(Box::new(grok::GrokAdapter::new(home)));
    r.register(Box::new(opencode::OpenCodeAdapter::new(home)));
    r.register(Box::new(devin::DevinAdapter::new(home)));
    r.register(Box::new(kiro::KiroAdapter::new(home)));
    r.register(Box::new(antigravity::AntigravityCliAdapter::new(home)));
    r
}

/// One discovery sweep's inputs, shared across all adapters. `now` is frozen
/// per sweep so status derivation is consistent within a refresh. `home` is
/// the user home dir adapters resolve session trees against.
pub struct SweepContext<'a> {
    pub processes: &'a [AgentProc],
    pub now: i64,
    pub home: &'a std::path::Path,
}

/// One ported harness adapter — the Rust mirror of the TS `AgentAdapter`
/// surface used by `listAgents` (canHandle + detectAgents).
pub trait HarnessAdapter: Send + Sync {
    /// Harness type id, matching the TS `AgentType` wire value
    /// ("claude", "codex", "gemini_cli", ...).
    fn type_id(&self) -> &'static str;
    /// Whether this process belongs to the harness.
    fn can_handle(&self, proc: &AgentProc) -> bool;
    /// Attribute+enrich this sweep's processes into `AgentInfo` rows.
    fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent>;
}

/// All ported adapters. `enrich` aggregates each sweep into the full agent
/// list — the daemon is authoritative for every registered type, so a
/// successful answer means clients skip local adapters entirely.
#[derive(Default)]
pub struct Registry {
    adapters: Vec<Box<dyn HarnessAdapter>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, adapter: Box<dyn HarnessAdapter>) {
        self.adapters.push(adapter);
    }

    pub fn ported_types(&self) -> Vec<String> {
        self.adapters
            .iter()
            .map(|a| a.type_id().to_string())
            .collect()
    }

    /// Whether any registered adapter claims this process — the daemon's
    /// candidate gate for script-runtime processes (mirrors TS
    /// `isCandidateProcess`).
    pub fn any_can_handle(&self, proc: &AgentProc) -> bool {
        self.adapters.iter().any(|a| a.can_handle(proc))
    }

    pub fn enrich(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
        self.adapters.iter().flat_map(|a| a.detect(ctx)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockAdapter;

    impl HarnessAdapter for MockAdapter {
        fn type_id(&self) -> &'static str {
            "claude"
        }
        fn can_handle(&self, proc: &AgentProc) -> bool {
            proc.command.as_deref() == Some("claude")
        }
        fn detect(&self, ctx: &SweepContext) -> Vec<EnrichedAgent> {
            ctx.processes
                .iter()
                .filter(|p| self.can_handle(p))
                .map(|p| EnrichedAgent {
                    name: "mock".into(),
                    agent_type: self.type_id().into(),
                    status: "running".into(),
                    summary: String::new(),
                    pid: p.pid as u64,
                    project_path: p.cwd.clone().unwrap_or_default(),
                    session_id: format!("pid-{}", p.pid),
                    last_active: "2026-10-08T00:00:00.000Z".into(),
                    pinned: None,
                    session_file_path: None,
                })
                .collect()
        }
    }

    fn proc(command: &str) -> AgentProc {
        AgentProc {
            pid: 7,
            ppid: None,
            tty: None,
            command: Some(command.into()),
            cwd: Some("/proj".into()),
            session_file: None,
            start_time_ms: None,
        }
    }

    #[test]
    fn registry_reports_ported_types() {
        let mut r = Registry::new();
        assert!(r.ported_types().is_empty());
        r.register(Box::new(MockAdapter));
        assert_eq!(r.ported_types(), vec!["claude"]);
    }

    #[test]
    fn enrich_aggregates_matching_processes() {
        let mut r = Registry::new();
        r.register(Box::new(MockAdapter));
        let procs = vec![proc("claude"), proc("codex")];
        let ctx = SweepContext {
            processes: &procs,
            now: 0,
            home: std::path::Path::new("/"),
        };
        let out = r.enrich(&ctx);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].agent_type, "claude");
        assert_eq!(out[0].project_path, "/proj");
    }

    #[test]
    fn claude_adapter_matches_committed_fixtures() {
        let n = crate::fixtures::assert_parity("claude", |home| {
            Box::new(crate::claude::ClaudeAdapter::new(home))
        });
        assert!(n > 0, "no claude fixture bundles found");
    }

    #[test]
    fn codex_adapter_matches_committed_fixtures() {
        let n = crate::fixtures::assert_parity("codex", |home| {
            Box::new(crate::codex::CodexAdapter::new(home))
        });
        assert!(n > 0, "no codex fixture bundles found");
    }

    #[test]
    fn pi_adapter_matches_committed_fixtures() {
        let n = crate::fixtures::assert_parity("pi", |home| {
            Box::new(crate::pi::PiAdapter::new(home))
        });
        assert!(n > 0, "no pi fixture bundles found");
    }

    #[test]
    fn gemini_adapter_matches_committed_fixtures() {
        let n = crate::fixtures::assert_parity("gemini_cli", |home| {
            Box::new(crate::gemini::GeminiAdapter::new(home))
        });
        assert!(n > 0, "no gemini fixture bundles found");
    }

    #[test]
    fn copilot_adapter_matches_committed_fixtures() {
        let n = crate::fixtures::assert_parity("copilot", |home| {
            Box::new(crate::copilot::CopilotAdapter::new(home))
        });
        assert!(n > 0, "no copilot fixture bundles found");
    }

    #[test]
    fn grok_adapter_matches_committed_fixtures() {
        let n = crate::fixtures::assert_parity("grok_cli", |home| {
            Box::new(crate::grok::GrokAdapter::new(home))
        });
        assert!(n > 0, "no grok fixture bundles found");
    }

    #[test]
    fn opencode_adapter_matches_committed_fixtures() {
        // Pin the canonical db path — ambient XDG_DATA_HOME must not leak
        // the real opencode.db into replay.
        let n = crate::fixtures::assert_parity("opencode", |home| {
            Box::new(crate::opencode::OpenCodeAdapter::at_db(
                home.join(".local/share/opencode/opencode.db"),
            ))
        });
        assert!(n > 0, "no opencode fixture bundles found");
    }

    #[test]
    fn devin_adapter_matches_committed_fixtures() {
        let n = crate::fixtures::assert_parity("devin", |home| {
            Box::new(crate::devin::DevinAdapter::at_db(
                home.join(".local/share/devin/cli/sessions.db"),
            ))
        });
        assert!(n > 0, "no devin fixture bundles found");
    }

    #[test]
    fn kiro_adapter_matches_committed_fixtures() {
        let n = crate::fixtures::assert_parity("kiro", |home| {
            Box::new(crate::kiro::KiroAdapter::at_sessions_dir(
                home.join(".kiro/sessions/cli"),
            ))
        });
        assert!(n > 0, "no kiro fixture bundles found");
    }

    #[test]
    fn antigravity_adapter_matches_committed_fixtures() {
        // Pin the canonical base dir — ambient ANTIGRAVITY_CLI_HOME must
        // not leak the real registry into replay.
        let n = crate::fixtures::assert_parity("antigravity_cli", |home| {
            Box::new(crate::antigravity::AntigravityCliAdapter::at_base_dir(
                home.join(".gemini/antigravity-cli"),
            ))
        });
        assert!(n > 0, "no antigravity fixture bundles found");
    }
}
