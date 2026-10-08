//! Per-harness readiness profiles — port of `harnesses/*/readiness.ts`.

use devkit_core::readiness::{AuthReadinessCheck, IntegrationReadinessCheck};
use regex::Regex;
use serde_json::Value;
use std::path::Path;
use std::sync::LazyLock;

use super::checks::{
    details_map, display_home, mapping_check, non_empty, record, registration_check, script_check,
    worst_status,
};
use super::ReadinessRuntime;

pub struct Profile {
    pub config_dir: &'static str,
    pub auth: fn(&ReadinessRuntime) -> Option<AuthReadinessCheck>,
    pub integration: fn(&ReadinessRuntime) -> Option<IntegrationReadinessCheck>,
}

fn none_auth(_: &ReadinessRuntime) -> Option<AuthReadinessCheck> {
    None
}
fn none_integration(_: &ReadinessRuntime) -> Option<IntegrationReadinessCheck> {
    None
}

pub fn profile(agent_type: &str) -> Profile {
    match agent_type {
        "claude" => Profile {
            config_dir: ".claude",
            auth: claude_auth,
            integration: claude_integration,
        },
        "codex" => Profile {
            config_dir: ".codex",
            auth: codex_auth,
            integration: codex_integration,
        },
        "copilot" => Profile {
            config_dir: ".copilot",
            auth: copilot_auth,
            integration: none_integration,
        },
        "devin" => Profile {
            config_dir: ".config/devin",
            auth: devin_auth,
            integration: none_integration,
        },
        "opencode" => Profile {
            config_dir: ".config/opencode",
            auth: opencode_auth,
            integration: none_integration,
        },
        "pi" => Profile {
            config_dir: ".pi",
            auth: pi_auth,
            integration: pi_integration,
        },
        "gemini_cli" => Profile {
            config_dir: ".gemini",
            auth: none_auth,
            integration: none_integration,
        },
        "grok_cli" => Profile {
            config_dir: ".grok",
            auth: none_auth,
            integration: none_integration,
        },
        "kiro" => Profile {
            config_dir: ".kiro",
            auth: none_auth,
            integration: none_integration,
        },
        "antigravity_cli" => Profile {
            config_dir: ".gemini/antigravity-cli",
            auth: none_auth,
            integration: none_integration,
        },
        _ => Profile {
            config_dir: "",
            auth: none_auth,
            integration: none_integration,
        },
    }
}

fn join_home(rt: &ReadinessRuntime, parts: &[&str]) -> String {
    let mut p = std::path::PathBuf::from(&rt.home_dir);
    for part in parts {
        p.push(part);
    }
    p.to_string_lossy().into_owned()
}

fn join_asset_root(rt: &ReadinessRuntime, parts: &[&str]) -> String {
    let mut p = std::path::PathBuf::from(rt.asset_root.as_deref().unwrap_or(""));
    for part in parts {
        p.push(part);
    }
    p.to_string_lossy().into_owned()
}

// ---- claude ----

fn claude_auth(rt: &ReadinessRuntime) -> Option<AuthReadinessCheck> {
    let source = "claude auth status --json";
    let result = rt.host.run_command("claude", &["auth", "status", "--json"]);
    let parsed = result
        .ok()
        .and_then(|r| serde_json::from_str::<Value>(&r.stdout).ok())
        .and_then(|v| record(&v).cloned());
    Some(match parsed {
        Some(map) => {
            let authenticated = map.get("loggedIn") == Some(&Value::Bool(true))
                || map.get("authenticated") == Some(&Value::Bool(true));
            let unauthenticated = map.get("loggedIn") == Some(&Value::Bool(false))
                || map.get("authenticated") == Some(&Value::Bool(false));
            AuthReadinessCheck {
                state: if authenticated {
                    "authenticated".into()
                } else if unauthenticated {
                    "unauthenticated".into()
                } else {
                    "unknown".into()
                },
                source: source.into(),
                provider: None,
                available_providers: vec![],
                status: if authenticated {
                    "pass".into()
                } else if unauthenticated {
                    "fail".into()
                } else {
                    "warn".into()
                },
                errors: if authenticated {
                    vec![]
                } else {
                    vec![if unauthenticated {
                        "Claude is not authenticated".into()
                    } else {
                        "Claude authentication is unknown".into()
                    }]
                },
            }
        }
        None => AuthReadinessCheck {
            state: "unknown".into(),
            source: source.into(),
            provider: None,
            available_providers: vec![],
            status: "warn".into(),
            errors: vec!["Claude authentication probe failed".into()],
        },
    })
}

fn claude_integration(rt: &ReadinessRuntime) -> Option<IntegrationReadinessCheck> {
    let script = script_check(
        &join_home(rt, &[".claude", "hooks", "claude-prompt-hook.js"]),
        &join_asset_root(rt, &["claude", "claude-prompt-hook.js"]),
        rt,
    );
    let registration = registration_check(
        &join_home(rt, &[".claude", "settings.json"]),
        "PreToolUse",
        "node ~/.claude/hooks/claude-prompt-hook.js",
        rt,
    );
    let installed = script.status == "pass" && registration.status == "pass";
    let status = worst_status(&[script.status, registration.status]);
    let errors = [script.errors.clone(), registration.errors.clone()].concat();
    Some(IntegrationReadinessCheck {
        label: "ai-devkit hook".into(),
        installed,
        status: status.into(),
        errors,
        details: Some(details_map(&[
            ("promptScript", script.to_json()),
            ("registration", registration.to_json()),
        ])),
    })
}

// ---- codex ----

fn codex_auth(rt: &ReadinessRuntime) -> Option<AuthReadinessCheck> {
    let source_path = join_home(rt, &[".codex", "auth.json"]);
    match rt.host.codex_auth() {
        Some(authenticated) => Some(AuthReadinessCheck {
            state: if authenticated {
                "authenticated".into()
            } else {
                "unauthenticated".into()
            },
            source: display_home(&source_path, &rt.home_dir),
            provider: None,
            available_providers: vec![],
            status: if authenticated {
                "pass".into()
            } else {
                "fail".into()
            },
            errors: if authenticated {
                vec![]
            } else {
                vec!["Codex is not authenticated".into()]
            },
        }),
        None => Some(AuthReadinessCheck {
            state: "unknown".into(),
            source: display_home(&source_path, &rt.home_dir),
            provider: None,
            available_providers: vec![],
            status: "warn".into(),
            errors: vec!["Codex authentication is unknown".into()],
        }),
    }
}

fn codex_integration(rt: &ReadinessRuntime) -> Option<IntegrationReadinessCheck> {
    let script = script_check(
        &join_home(rt, &[".codex", "hooks", "codex-session-mapping.cjs"]),
        &join_asset_root(rt, &["codex", "codex-session-mapping.cjs"]),
        rt,
    );
    let registration = registration_check(
        &join_home(rt, &[".codex", "hooks.json"]),
        "SessionStart",
        "node ~/.codex/hooks/codex-session-mapping.cjs",
        rt,
    );
    let mapping_file = mapping_check(
        &join_home(rt, &[".codex", "ai-devkit", "sessions.json"]),
        rt,
    );
    let installed = script.status == "pass" && registration.status == "pass";
    let status = worst_status(&[script.status, registration.status, mapping_file.status]);
    let errors = [
        script.errors.clone(),
        registration.errors.clone(),
        mapping_file.errors.clone(),
    ]
    .concat();
    Some(IntegrationReadinessCheck {
        label: "ai-devkit hook".into(),
        installed,
        status: status.into(),
        errors,
        details: Some(details_map(&[
            ("sessionMappingScript", script.to_json()),
            ("registration", registration.to_json()),
            ("mappingFile", mapping_file.to_json()),
        ])),
    })
}

// ---- copilot ----

fn copilot_auth(rt: &ReadinessRuntime) -> Option<AuthReadinessCheck> {
    let source = "gh auth status --hostname github.com";
    match rt
        .host
        .run_command("gh", &["auth", "status", "--hostname", "github.com"])
    {
        Ok(_) => Some(AuthReadinessCheck {
            state: "authenticated".into(),
            source: source.into(),
            provider: Some("github".into()),
            available_providers: vec!["GitHub".into()],
            status: "pass".into(),
            errors: vec![],
        }),
        Err(_) => Some(AuthReadinessCheck {
            state: "unknown".into(),
            source: source.into(),
            provider: None,
            available_providers: vec!["GitHub".into()],
            status: "warn".into(),
            errors: vec![
                "Copilot authentication could not be verified through GitHub CLI".into(),
            ],
        }),
    }
}

// ---- devin ----

static LOGGED_IN_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^Logged in").unwrap());

fn devin_auth(rt: &ReadinessRuntime) -> Option<AuthReadinessCheck> {
    let source = "devin auth status";
    match rt.host.run_command("devin", &["auth", "status"]) {
        Ok(result) => {
            let authenticated = LOGGED_IN_PATTERN.is_match(&result.stdout);
            Some(AuthReadinessCheck {
                state: if authenticated {
                    "authenticated".into()
                } else {
                    "unauthenticated".into()
                },
                source: source.into(),
                provider: None,
                available_providers: if authenticated {
                    vec!["devin".into()]
                } else {
                    vec![]
                },
                status: if authenticated {
                    "pass".into()
                } else {
                    "fail".into()
                },
                errors: if authenticated {
                    vec![]
                } else {
                    vec!["Devin is not logged in".into()]
                },
            })
        }
        Err(_) => Some(AuthReadinessCheck {
            state: "unknown".into(),
            source: source.into(),
            provider: None,
            available_providers: vec![],
            status: "warn".into(),
            errors: vec!["Devin authentication probe failed".into()],
        }),
    }
}

// ---- opencode ----

static ANSI_ESCAPE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("\u{1b}\\[[0-?]*[ -/]*[@-~]").unwrap());
static PROVIDER_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*[●*+-]\s+(.+?)\s*$").unwrap());
static PROVIDER_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s+(?:api|oauth|[\w-]*token|[A-Z][A-Z0-9_]+)$").unwrap()
});
static NON_PROVIDER_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^\d+\s+(?:credentials?|environment variables?)$").unwrap()
});

fn auth_provider_names(output: &str) -> Vec<String> {
    let stripped = ANSI_ESCAPE.replace_all(output, "");
    let mut names = std::collections::BTreeSet::new();
    for line in stripped.split('\n') {
        let line = line.trim_end_matches('\r');
        let Some(m) = PROVIDER_LINE.captures(line) else {
            continue;
        };
        let name = PROVIDER_SUFFIX.replace(&m[1], "").trim().to_string();
        if !name.is_empty() && !NON_PROVIDER_LINE.is_match(&name) {
            names.insert(name);
        }
    }
    names.into_iter().collect()
}

fn opencode_auth(rt: &ReadinessRuntime) -> Option<AuthReadinessCheck> {
    let source = "opencode auth list";
    match rt.host.run_command("opencode", &["auth", "list"]) {
        Ok(result) => {
            let available = auth_provider_names(&result.stdout);
            let authenticated = !available.is_empty();
            Some(AuthReadinessCheck {
                state: if authenticated {
                    "authenticated".into()
                } else {
                    "unauthenticated".into()
                },
                source: source.into(),
                provider: None,
                available_providers: available,
                status: if authenticated {
                    "pass".into()
                } else {
                    "fail".into()
                },
                errors: if authenticated {
                    vec![]
                } else {
                    vec!["OpenCode has no configured credentials".into()]
                },
            })
        }
        Err(_) => Some(AuthReadinessCheck {
            state: "unknown".into(),
            source: source.into(),
            provider: None,
            available_providers: vec![],
            status: "warn".into(),
            errors: vec!["OpenCode authentication probe failed".into()],
        }),
    }
}

// ---- pi ----

fn pi_provider_names(parsed: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut names = std::collections::BTreeSet::new();
    let provider = parsed.get("provider").cloned().unwrap_or(Value::Null);
    if non_empty(&provider) {
        names.insert(provider.as_str().unwrap().trim().to_string());
    }
    if let Some(providers) = parsed.get("providers").and_then(record) {
        for name in providers.keys() {
            if !name.trim().is_empty() {
                names.insert(name.clone());
            }
        }
    }
    for (name, value) in parsed {
        if name == "provider" || name == "providers" {
            continue;
        }
        if record(value).is_some() && !name.trim().is_empty() {
            names.insert(name.clone());
        }
    }
    names.into_iter().collect()
}

fn pi_auth(rt: &ReadinessRuntime) -> Option<AuthReadinessCheck> {
    let source_path = join_home(rt, &[".pi", "agent", "auth.json"]);
    let source = display_home(&source_path, &rt.home_dir);
    let parsed = rt
        .host
        .read_file(Path::new(&source_path))
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| record(&v).cloned());
    Some(match parsed {
        Some(map) => {
            let available = pi_provider_names(&map);
            let provider = map
                .get("provider")
                .filter(|v| non_empty(v))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string());
            let authenticated = !available.is_empty();
            AuthReadinessCheck {
                state: if authenticated {
                    "authenticated".into()
                } else {
                    "unauthenticated".into()
                },
                source,
                provider,
                available_providers: available,
                status: if authenticated {
                    "pass".into()
                } else {
                    "fail".into()
                },
                errors: if authenticated {
                    vec![]
                } else {
                    vec!["Pi credential file has no configured model provider".into()]
                },
            }
        }
        None => AuthReadinessCheck {
            state: "unauthenticated".into(),
            source,
            provider: None,
            available_providers: vec![],
            status: "fail".into(),
            errors: vec!["Pi credential file is missing or invalid".into()],
        },
    })
}

static TRACKER_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bsession[\s-]+tracker\b").unwrap());

fn is_session_tracker_listed(output: &str) -> bool {
    let normalized = output.to_lowercase();
    normalized.contains("@ai-devkit/pi-session-tracker") || TRACKER_PATTERN.is_match(&normalized)
}

fn pi_integration(rt: &ReadinessRuntime) -> Option<IntegrationReadinessCheck> {
    let installed = rt
        .host
        .run_command("pi", &["list"])
        .map(|r| is_session_tracker_listed(&r.stdout))
        .unwrap_or(false);
    let mapping = mapping_check(&join_home(rt, &[".pi", "agent", "sessions.json"]), rt);
    let mapping_status: &'static str = if mapping.valid || !mapping.present {
        "pass"
    } else {
        "fail"
    };
    let status = worst_status(&[if installed { "pass" } else { "fail" }, mapping_status]);
    let mut errors = vec![];
    if !installed {
        errors.push("Pi session tracker is not registered".to_string());
    }
    if mapping_status == "fail" {
        errors.extend(mapping.errors.clone());
    }
    Some(IntegrationReadinessCheck {
        label: "ai-devkit plugin".into(),
        installed,
        status: status.into(),
        errors,
        details: Some(details_map(&[
            ("package", Value::String("@ai-devkit/pi-session-tracker".into())),
            ("registryPath", Value::String(mapping.path.clone())),
            ("registryValid", Value::Bool(mapping.valid)),
            (
                "invalidEntries",
                Value::Number(mapping.invalid_entries.into()),
            ),
            ("staleEntries", Value::Number(mapping.stale_entries.into())),
        ])),
    })
}
