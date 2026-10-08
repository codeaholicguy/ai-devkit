//! Fixture replay parity — the Rust side of
//! `packages/agent-manager/src/__tests__/readiness-fixtures.test.ts`.
//! Bundles carry virtual fs/command state; `FixtureHost` answers the
//! `Host` seams exactly as the TS test's injected fns do.

#![cfg(test)]

use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::io;
use std::path::Path;

use super::{Host, ReadinessRuntime};

struct FixtureHost {
    files: BTreeMap<String, String>,
    executables: BTreeSet<String>,
    commands: BTreeMap<String, Value>,
    codex_auth: Option<bool>,
}

impl Host for FixtureHost {
    fn read_file(&self, path: &Path) -> io::Result<String> {
        self.files
            .get(&path.to_string_lossy().into_owned())
            .cloned()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "missing"))
    }

    fn access(&self, path: &Path, _mode: i32) -> bool {
        let p = path.to_string_lossy();
        self.executables.contains(p.as_ref()) || self.files.contains_key(p.as_ref())
    }

    fn run_command(&self, command: &str, args: &[&str]) -> io::Result<super::CommandResult> {
        let key = std::iter::once(command)
            .chain(args.iter().copied())
            .collect::<Vec<_>>()
            .join(" ");
        let stub = self
            .commands
            .get(&key)
            .ok_or_else(|| io::Error::other(format!("unexpected command {key}")))?;
        if stub["ok"].as_bool() == Some(false) {
            return Err(io::Error::other(format!("command failed: {key}")));
        }
        Ok(super::CommandResult {
            stdout: stub["stdout"].as_str().unwrap_or("").to_string(),
            stderr: stub["stderr"].as_str().unwrap_or("").to_string(),
        })
    }

    fn codex_auth(&self) -> Option<bool> {
        self.codex_auth
    }
}

fn readiness_fixture_dir() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/readiness")
}

fn run_bundle(path: &Path) {
    let bundle: Value =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let options = &bundle["options"];
    let host = FixtureHost {
        files: bundle["files"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string()))
            .collect(),
        executables: bundle["executables"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect(),
        commands: bundle["commands"]
            .as_object()
            .map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default(),
        codex_auth: bundle["codexAuth"].as_bool(),
    };
    let rt = ReadinessRuntime {
        home_dir: options["homeDir"].as_str().unwrap().to_string(),
        path: options["path"].as_str().unwrap().to_string(),
        asset_root: options["assetRoot"].as_str().map(String::from),
        built_in_skill_names: options["builtInSkillNames"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        skill_roots: options["skillRoots"]
            .as_object()
            .map(|m| {
                m.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default(),
        host: &host,
    };
    let reports = super::readiness_reports(&rt);
    // TS expected is a keyed map; Rust emits an ordered Vec — rebuild
    // the map to compare byte-identically.
    let actual: serde_json::Map<String, Value> = reports
        .iter()
        .map(|r| {
            (
                r.agent_type.clone(),
                serde_json::to_value(r).unwrap(),
            )
        })
        .collect();
    let expected = bundle["expected"].as_object().unwrap().clone();
    assert_eq!(
        actual,
        expected,
        "readiness parity mismatch in {}",
        path.display()
    );
}

#[test]
fn readiness_fixtures_match() {
    let dir = readiness_fixture_dir();
    let mut found = 0;
    if dir.exists() {
        for entry in std::fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            if name.ends_with(".json") && !name.starts_with("live") {
                run_bundle(&path);
                found += 1;
            }
        }
    }
    assert!(found > 0, "no readiness fixture bundles found in {dir:?}");
}
