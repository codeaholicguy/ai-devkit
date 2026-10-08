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
    mtimes: Vec<(String, Value)>,
    registry: Vec<Value>,
    sqlite: Vec<(String, Vec<String>)>,
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
        mtimes: raw["mtimes"]
            .as_object()
            .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default(),
        registry: raw["registry"].as_array().cloned().unwrap_or_default(),
        sqlite: raw["sqlite"]
            .as_object()
            .map(|o| {
                o.iter()
                    .map(|(k, v)| {
                        (
                            k.clone(),
                            v.as_array()
                                .map(|a| {
                                    a.iter()
                                        .map(|s| s.as_str().unwrap_or_default().to_string())
                                        .collect()
                                })
                                .unwrap_or_default(),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default(),
        expected: raw["expected"].clone(),
    }
}

/// Seed `<home>/.ai-devkit/agents.db` with the captured rows — registry-aware
/// adapters (codex) read it during detect; replay must never see the real db.
fn seed_registry(home: &Path, rows: &[Value], home_s: &str, now_iso: &str) {
    if rows.is_empty() {
        return;
    }
    let db = home.join(".ai-devkit").join("agents.db");
    std::fs::create_dir_all(db.parent().unwrap()).unwrap();
    let conn = rusqlite::Connection::open(&db).unwrap();
    conn.execute_batch(
        "CREATE TABLE agents (
            type TEXT NOT NULL, pid INTEGER NOT NULL, name TEXT NOT NULL,
            tmux_session TEXT NOT NULL DEFAULT '', cwd TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL, session_id TEXT NOT NULL DEFAULT '',
            session_file_path TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0, runtime TEXT NOT NULL DEFAULT 'tmux',
            runtime_ref TEXT NOT NULL DEFAULT '', PRIMARY KEY (type, pid));",
    )
    .unwrap();
    for row in rows {
        let v = expand_value(row, home_s, now_iso);
        conn.execute(
            "INSERT OR REPLACE INTO agents
             (type, pid, name, tmux_session, cwd, started_at, session_id,
              session_file_path, updated_at, pinned, runtime, runtime_ref)
             VALUES (?1,?2,?3,'',?4,?5,?6,?7,?8,?9,'tmux','')",
            rusqlite::params![
                v["type"].as_str().unwrap_or_default(),
                v["pid"].as_i64().unwrap_or_default(),
                v["name"].as_str().unwrap_or_default(),
                v["cwd"].as_str().unwrap_or_default(),
                v["startedAt"].as_str().unwrap_or_default(),
                v["sessionId"].as_str().unwrap_or_default(),
                v["sessionFilePath"].as_str().unwrap_or_default(),
                now_iso,
                v["pinned"].as_bool().unwrap_or(false) as i64,
            ],
        )
        .unwrap();
    }
}

/// Write `home` files into a fresh temp dir; returns (dir, write instant ms).
/// `$TODAY` in keys and contents resolves to the local `YYYY/MM/DD` day key —
/// Codex date-dir discovery derives day keys from process starts in local
/// time, so static dirs would drift across replay days/timezones.
fn materialize_home(bundle: &FixtureBundle, tag: &str) -> (PathBuf, i64, String) {
    let today_key = crate::shared::local_day_key(now_ms());
    // Parallel adapter tests can materialize same-named bundles in the same
    // millisecond — a counter keeps dirs (and their seeded agents.db) disjoint.
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "devkit-fixture-{}-{}-{}-{tag}",
        std::process::id(),
        now_ms(),
        SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let home_s = dir.to_string_lossy().into_owned();
    for (rel, content) in &bundle.home {
        let p = dir.join(rel.replace("$TODAY", &today_key));
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, expand_str(&content.replace("$TODAY", &today_key), &home_s, "")).unwrap();
    }
    let written_ms = now_ms();
    // Deterministic mtimes for adapters that read them (Grok lastActive /
    // latest-session pick) — "$NOW" resolves to the materialization instant.
    for (rel, mt) in &bundle.mtimes {
        let p = dir.join(rel.replace("$TODAY", &today_key));
        let ms = match mt {
            Value::String(s) if s == NOW_PLACEHOLDER => written_ms,
            // Live-captured mtimes are `fs.statSync().mtimeMs` — floats.
            v => v.as_f64().unwrap() as i64,
        };
        let file = std::fs::File::open(&p).unwrap();
        file.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_millis(ms as u64))
            .unwrap();
    }
    // SQLite stores (OpenCode's opencode.db) materialize from ordered SQL
    // statements — binary dbs can't travel in the JSON `home` map.
    for (rel, stmts) in &bundle.sqlite {
        let p = dir.join(rel.replace("$TODAY", &today_key));
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        let conn = rusqlite::Connection::open(&p).unwrap();
        for stmt in stmts {
            conn.execute_batch(&expand_str(&stmt.replace("$TODAY", &today_key), &home_s, ""))
                .unwrap();
        }
    }
    (dir, written_ms, today_key)
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

        let (home, written_ms, today_key) = materialize_home(&bundle, &name);
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

        seed_registry(&home, &bundle.registry, &home_s, &now_iso);
        // Pids whose startTime resolves to the materialization instant — only
        // their session paths contain the replay-day key and normalize to
        // $TODAY; static-start agents keep concrete dates.
        let now_pids: std::collections::HashSet<i64> = bundle
            .processes
            .iter()
            .filter(|p| p["startTime"].as_str() == Some(NOW_PLACEHOLDER))
            .map(|p| p["pid"].as_i64().unwrap())
            .collect();

        let ctx = crate::SweepContext {
            processes: &processes,
            now: frozen_now,
            home: &home,
        };
        let agents = make(&home).detect(&ctx);
        let actual_list: Vec<Value> = serde_json::to_value(&agents)
            .unwrap()
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|a| {
                if now_pids.contains(&a["pid"].as_i64().unwrap_or(-1)) {
                    serde_json::from_str(
                        &serde_json::to_string(&a)
                            .unwrap()
                            .replace(&today_key, "$TODAY"),
                    )
                    .unwrap()
                } else {
                    a
                }
            })
            .collect();
        let actual = sanitize_value(&Value::Array(actual_list), &home_s);
        // $FIXTURE_HOME and $TODAY stay literal in expected — actual is
        // normalized to the same placeholder form. Only $NOW resolves.
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
