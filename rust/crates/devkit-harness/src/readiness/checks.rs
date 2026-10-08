//! Shared readiness checks — port of `harnesses/readiness/checks.ts`.
//!
//! The injectable seams (readFile/access/runCommand) live on the `Host`
//! trait; the functions here are pure given a `&ReadinessRuntime`.

use devkit_core::readiness::{
    BuiltInSkillsReadinessCheck, DirectoryReadinessCheck, ExecutableReadinessCheck,
};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::Path;

use super::{ReadinessRuntime, R_OK, X_OK};

pub fn worst_status(statuses: &[&str]) -> &'static str {
    statuses
        .iter()
        .fold("pass", |worst, s| match *s {
            "fail" => "fail",
            "warn" if worst != "fail" => "warn",
            _ => worst,
        })
}

pub fn display_home(target: &str, home_dir: &str) -> String {
    if target == home_dir {
        "~".to_string()
    } else if let Some(rest) = target.strip_prefix(&format!("{home_dir}/")) {
        format!("~/{rest}")
    } else {
        target.to_string()
    }
}

pub fn record(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    value.as_object()
}

pub fn non_empty(value: &Value) -> bool {
    value
        .as_str()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

pub fn accessible(target: &Path, rt: &ReadinessRuntime, mode: i32) -> bool {
    rt.host.access(target, mode)
}

fn resolve_executable(command: &str, rt: &ReadinessRuntime) -> Option<String> {
    for directory in rt.path.split(':').filter(|d| !d.is_empty()) {
        let target = Path::new(directory).join(command);
        if rt.host.access(&target, X_OK) {
            return Some(target.to_string_lossy().into_owned());
        }
    }
    None
}

/// `HARNESS_RUNTIME_PROFILES[type].command` — the PATH lookup name.
pub fn command_for(agent_type: &str) -> &'static str {
    match agent_type {
        "claude" => "claude",
        "codex" => "codex",
        "gemini_cli" => "gemini",
        "grok_cli" => "grok",
        "kiro" => "kiro-cli",
        "antigravity_cli" => "agy",
        "opencode" => "opencode",
        "copilot" => "copilot",
        "pi" => "pi",
        "devin" => "devin",
        _ => "",
    }
}

pub fn executable_check(agent_type: &str, rt: &ReadinessRuntime) -> ExecutableReadinessCheck {
    let command = command_for(agent_type);
    let resolved = resolve_executable(command, rt);
    ExecutableReadinessCheck {
        command: command.to_string(),
        path: resolved.clone(),
        status: if resolved.is_some() {
            "pass".into()
        } else {
            "fail".into()
        },
        errors: if resolved.is_some() {
            vec![]
        } else {
            vec![format!("{command} was not found on PATH")]
        },
    }
}

pub fn directory_check(config_dir: &str, rt: &ReadinessRuntime) -> DirectoryReadinessCheck {
    let target = Path::new(&rt.home_dir).join(config_dir);
    let readable = accessible(&target, rt, R_OK);
    DirectoryReadinessCheck {
        path: display_home(&target.to_string_lossy(), &rt.home_dir),
        present: readable,
        readable,
        status: if readable { "pass".into() } else { "fail".into() },
        errors: if readable {
            vec![]
        } else {
            vec!["global configuration directory is unavailable".to_string()]
        },
    }
}

pub fn built_in_skills_check(
    agent_type: &str,
    rt: &ReadinessRuntime,
) -> BuiltInSkillsReadinessCheck {
    let Some(relative_root) = rt.skill_roots.get(agent_type) else {
        return BuiltInSkillsReadinessCheck {
            path: None,
            required: rt.built_in_skill_names.len() as u64,
            present: 0,
            missing: rt.built_in_skill_names.clone(),
            status: "info".into(),
            errors: vec![],
        };
    };
    let root = Path::new(&rt.home_dir).join(relative_root);
    let present: Vec<String> = rt
        .built_in_skill_names
        .iter()
        .filter(|name| accessible(&root.join(name).join("SKILL.md"), rt, R_OK))
        .cloned()
        .collect();
    let missing: Vec<String> = rt
        .built_in_skill_names
        .iter()
        .filter(|name| !present.contains(name))
        .cloned()
        .collect();
    BuiltInSkillsReadinessCheck {
        path: Some(display_home(&root.to_string_lossy(), &rt.home_dir)),
        required: rt.built_in_skill_names.len() as u64,
        present: present.len() as u64,
        missing,
        status: "info".into(),
        errors: vec![],
    }
}

/// Extended check shape used inside `integration.details`.
#[derive(Debug, Clone)]
pub struct ScriptCheck {
    pub status: &'static str,
    pub errors: Vec<String>,
    pub path: String,
    pub present: bool,
    pub readable: bool,
    pub matches_bundled_asset: bool,
}

impl ScriptCheck {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "status": self.status,
            "errors": self.errors,
            "path": self.path,
            "present": self.present,
            "readable": self.readable,
            "matchesBundledAsset": self.matches_bundled_asset,
        })
    }
}

pub fn script_check(installed: &str, bundled: &str, rt: &ReadinessRuntime) -> ScriptCheck {
    let path = display_home(installed, &rt.home_dir);
    let Ok(installed_text) = rt.host.read_file(Path::new(installed)) else {
        return ScriptCheck {
            path,
            present: false,
            readable: false,
            matches_bundled_asset: false,
            status: "fail",
            errors: vec!["hook script is unavailable".into()],
        };
    };
    match rt.host.read_file(Path::new(bundled)) {
        Ok(bundled_text) => {
            let matches = installed_text == bundled_text;
            ScriptCheck {
                path,
                present: true,
                readable: true,
                matches_bundled_asset: matches,
                status: if matches { "pass" } else { "fail" },
                errors: if matches {
                    vec![]
                } else {
                    vec!["hook script differs from the bundled AI DevKit asset".into()]
                },
            }
        }
        Err(_) => ScriptCheck {
            path,
            present: true,
            readable: true,
            matches_bundled_asset: false,
            status: "fail",
            errors: vec!["bundled hook asset is unavailable".into()],
        },
    }
}

fn contains_hook(root: &Value, event: &str, command: &str) -> bool {
    let Some(entries) = record(root)
        .and_then(|r| r.get("hooks"))
        .and_then(record)
        .and_then(|h| h.get(event))
        .and_then(|e| e.as_array())
    else {
        return false;
    };
    entries.iter().any(|entry| {
        record(entry)
            .and_then(|e| e.get("hooks"))
            .and_then(|h| h.as_array())
            .is_some_and(|commands| {
                commands.iter().any(|hook| {
                    record(hook)
                        .is_some_and(|h| h.get("type").and_then(|t| t.as_str()) == Some("command")
                            && h.get("command").and_then(|c| c.as_str()) == Some(command))
                })
            })
    })
}

#[derive(Debug, Clone)]
pub struct RegistrationCheck {
    pub status: &'static str,
    pub errors: Vec<String>,
    pub path: String,
    pub event: String,
    pub command: String,
    pub present: bool,
    pub valid: bool,
}

impl RegistrationCheck {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "status": self.status,
            "errors": self.errors,
            "path": self.path,
            "event": self.event,
            "command": self.command,
            "present": self.present,
            "valid": self.valid,
        })
    }
}

pub fn registration_check(
    target: &str,
    event: &str,
    command: &str,
    rt: &ReadinessRuntime,
) -> RegistrationCheck {
    let path = display_home(target, &rt.home_dir);
    let base = RegistrationCheck {
        status: "fail",
        errors: vec![],
        path,
        event: event.to_string(),
        command: command.to_string(),
        present: false,
        valid: false,
    };
    let Ok(text) = rt.host.read_file(Path::new(target)) else {
        return RegistrationCheck {
            errors: vec!["hook configuration is missing or invalid".into()],
            ..base
        };
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&text) else {
        return RegistrationCheck {
            errors: vec!["hook configuration is missing or invalid".into()],
            ..base
        };
    };
    let valid = contains_hook(&parsed, event, command);
    RegistrationCheck {
        present: true,
        valid,
        status: if valid { "pass" } else { "fail" },
        errors: if valid {
            vec![]
        } else {
            vec!["required hook registration is missing".into()]
        },
        ..base
    }
}

#[derive(Debug, Clone)]
pub struct MappingCheck {
    pub status: &'static str,
    pub errors: Vec<String>,
    pub path: String,
    pub present: bool,
    pub valid: bool,
    pub invalid_entries: u64,
    pub stale_entries: u64,
}

impl MappingCheck {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "status": self.status,
            "errors": self.errors,
            "path": self.path,
            "present": self.present,
            "valid": self.valid,
            "invalidEntries": self.invalid_entries,
            "staleEntries": self.stale_entries,
        })
    }
}

pub fn mapping_check(target: &str, rt: &ReadinessRuntime) -> MappingCheck {
    let path = display_home(target, &rt.home_dir);
    let base = MappingCheck {
        status: "warn",
        errors: vec![],
        path,
        present: false,
        valid: false,
        invalid_entries: 0,
        stale_entries: 0,
    };
    let Ok(text) = rt.host.read_file(Path::new(target)) else {
        return MappingCheck {
            errors: vec!["session mapping has not been created".into()],
            ..base
        };
    };
    let parsed = serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|v| record(&v).cloned());
    let Some(parsed) = parsed else {
        return MappingCheck {
            present: true,
            status: "fail",
            errors: vec!["session mapping is invalid".into()],
            ..base
        };
    };
    let mut invalid = 0u64;
    let mut stale = 0u64;
    for (pid, session_path) in &parsed {
        let valid_pid = !pid.is_empty() && pid.chars().all(|c| c.is_ascii_digit());
        if !valid_pid {
            invalid += 1;
            continue;
        }
        match session_path.as_str() {
            Some(p) if !p.is_empty() => {
                if !accessible(Path::new(p), rt, R_OK) {
                    stale += 1;
                }
            }
            _ => invalid += 1,
        }
    }
    let valid = invalid == 0;
    MappingCheck {
        present: true,
        valid,
        invalid_entries: invalid,
        stale_entries: stale,
        status: if !valid {
            "fail"
        } else if stale > 0 {
            "warn"
        } else {
            "pass"
        },
        errors: if !valid {
            vec!["session mapping contains invalid entries".into()]
        } else if stale > 0 {
            vec!["session mapping contains stale entries".into()]
        } else {
            vec![]
        },
        ..base
    }
}

/// `details` payload builder — the TS `details` field is a
/// `Record<string, unknown>` of named sub-checks.
pub fn details_map(pairs: &[(&str, Value)]) -> BTreeMap<String, Value> {
    pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()
}
