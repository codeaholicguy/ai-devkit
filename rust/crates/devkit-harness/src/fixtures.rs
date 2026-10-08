//! Golden-fixture replay for ported adapters — the Rust side of the parity
//! oracle. Loads `fixtures/harness/<type>/*.json` bundles captured by
//! `agent-manager`'s fixture tool, materializes each into a temp HOME, runs
//! the matching adapter, and requires byte-identical output to `expected`.
//!
//! Live bundles (`live*.json`) are gitignored local captures — when absent
//! only committed synthetic bundles run. Sentinels resolved at
//! materialization: `$FIXTURE_HOME` → temp home, `$NOW` → the instant home
//! files were written (so birthtime-based matching stays inside tolerance).

use devkit_core::discover::AgentProc;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub const HOME_PLACEHOLDER: &str = "$FIXTURE_HOME";
pub const NOW_PLACEHOLDER: &str = "$NOW";

fn fixtures_root() -> PathBuf {
    // rust/crates/devkit-harness → repo root
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/harness")
}

fn expand_str(s: &str, home: &str, now_iso: &str) -> String {
    s.replace(HOME_PLACEHOLDER, home)
        .replace(NOW_PLACEHOLDER, now_iso)
}

fn expand_value(v: &Value, home: &str, now_iso: &str) -> Value {
    match v {
        Value::String(s) => Value::String(expand_str(s, home, now_iso)),
        Value::Array(a) => Value::Array(a.iter().map(|x| expand_value(x, home, now_iso)).collect()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, x)| (k.clone(), expand_value(x, home, now_iso)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// `sanitize` — replace `<home>/.` with `$FIXTURE_HOME/.` recursively.
fn sanitize_value(v: &Value, home: &str) -> Value {
    let home_dot = format!("{home}/.");
    match v {
        Value::String(s) => Value::String(s.replace(&home_dot, &format!("{HOME_PLACEHOLDER}/."))),
        Value::Array(a) => Value::Array(a.iter().map(|x| sanitize_value(x, home)).collect()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, x)| (k.clone(), sanitize_value(x, home)))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

struct FixtureBundle {
    adapter: String,
    frozen_now: Value,
    processes: Vec<Value>,
    home: Vec<(String, String)>,
    expected: Value,
}

fn load_bundle(path: &Path) -> FixtureBundle {
    let raw: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    FixtureBundle {
        adapter: raw["adapter"].as_str().unwrap().to_string(),
        frozen_now: raw["frozenNow"].clone(),
        processes: raw["processes"].as_array().cloned().unwrap_or_default(),
        home: raw["home"]
            .as_object()
            .map(|o| {
                o.iter()
                    .map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        expected: raw["expected"].clone(),
    }
}

/// Write `home` files into a fresh temp dir; returns (dir, write instant ms).
fn materialize_home(bundle: &FixtureBundle, tag: &str) -> (PathBuf, i64) {
    let dir = std::env::temp_dir().join(format!(
        "devkit-fixture-{}-{}-{tag}",
        std::process::id(),
        now_ms()
    ));
    let home_s = dir.to_string_lossy().into_owned();
    for (rel, content) in &bundle.home {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, expand_str(content, &home_s, "")).unwrap();
    }
    (dir, now_ms())
}

/// Replay every committed (and any local live) bundle for `adapter_type`
/// through `detect`; `make` builds the adapter bound to each materialized
/// home. Panics on the first mismatch. Returns bundle count.
pub fn assert_parity(
    adapter_type: &str,
    make: impl Fn(&Path) -> Box<dyn crate::HarnessAdapter>,
) -> usize {
    let dir = fixtures_root().join(adapter_type);
    let mut paths: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|x| x == "json"))
                .collect()
        })
        .unwrap_or_default();
    paths.sort();
    for path in &paths {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let bundle = load_bundle(path);
        assert_eq!(bundle.adapter, adapter_type, "{name}: adapter mismatch");

        let (home, written_ms) = materialize_home(&bundle, &name);
        let home_s = home.to_string_lossy().into_owned();
        let now_iso = crate::shared::iso_utc(written_ms);

        let frozen_now = match &bundle.frozen_now {
            Value::String(s) if s == NOW_PLACEHOLDER => written_ms,
            v => v.as_i64().unwrap(),
        };

        let processes: Vec<AgentProc> = bundle
            .processes
            .iter()
            .map(|p| expand_value(p, &home_s, &now_iso))
            .map(|p| AgentProc {
                pid: p["pid"].as_i64().unwrap(),
                ppid: p["ppid"].as_i64(),
                tty: p["tty"].as_str().map(String::from),
                command: p["command"].as_str().map(String::from),
                cwd: p["cwd"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(String::from),
                session_file: None,
                start_time_ms: p["startTime"]
                    .as_str()
                    .and_then(crate::shared::parse_iso_ms),
            })
            .collect();

        let ctx = crate::SweepContext {
            processes: &processes,
            now: frozen_now,
            home: &home,
        };
        let agents = make(&home).detect(&ctx);
        let actual = sanitize_value(&serde_json::to_value(&agents).unwrap(), &home_s);
        // $FIXTURE_HOME stays literal in expected (actual is sanitized to the
        // same form); only $NOW resolves.
        let expected = expand_value(&bundle.expected, HOME_PLACEHOLDER, &now_iso);
        if actual != expected {
            std::fs::remove_dir_all(&home).ok();
            panic!(
                "{name}: adapter output diverged\nexpected: {}\nactual: {}",
                serde_json::to_string_pretty(&expected).unwrap(),
                serde_json::to_string_pretty(&actual).unwrap()
            );
        }
        std::fs::remove_dir_all(&home).ok();
    }
    paths.len()
}
