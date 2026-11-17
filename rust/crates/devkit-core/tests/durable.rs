use devkit_core::store::Store;
use std::sync::atomic::{AtomicUsize, Ordering};
static N: AtomicUsize = AtomicUsize::new(0);
fn fixture() -> (Store, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!(
        "durable-store-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    (Store::open(&dir.join("daemon.db")).unwrap(), dir)
}
#[test]
fn durable_tables_are_created() {
    let (_store, dir) = fixture();
    let db = rusqlite::Connection::open(dir.join("daemon.db")).unwrap();
    for table in ["durable_agents", "durable_runs"] {
        let found: i64 = db
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
                [table],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(found, 1, "missing {table}");
    }
}
#[test]
fn acquisition_completion_and_binding_are_token_guarded() {
    let (store, dir) = fixture();
    let a = store
        .durable_create("worker", "codex", dir.to_str().unwrap())
        .unwrap();
    let id = a["id"].as_str().unwrap();
    let running = store.durable_acquire(id).unwrap();
    let token = running["activeRun"]["token"].as_str().unwrap();
    assert!(store.durable_acquire(id).is_err());
    assert!(store
        .durable_complete(id, "stale", "succeeded", Some(0), "bad", "healthy")
        .is_err());
    assert!(store
        .durable_bind(id, "stale", "11111111-1111-4111-8111-111111111111")
        .is_err());
    store
        .durable_bind(id, token, "11111111-1111-4111-8111-111111111111")
        .unwrap();
    assert!(store
        .durable_bind(id, token, "22222222-2222-4222-8222-222222222222")
        .is_err());
    store
        .durable_complete(id, token, "succeeded", Some(0), "done", "healthy")
        .unwrap();
    let done = store.durable_resolve(id).unwrap();
    assert_eq!(done["state"], "ready");
    assert_eq!(done["lastResult"]["summary"], "done");
    assert!(done["activeRun"].is_null());
    assert_eq!(store.durable_run(id, token).unwrap()["exitCode"], 0);
}
#[test]
fn resolution_and_cwd_safety_are_preserved() {
    let (store, dir) = fixture();
    let a = store
        .durable_create("worker", "claude", dir.to_str().unwrap())
        .unwrap();
    assert!(store
        .durable_create("WORKER", "pi", dir.to_str().unwrap())
        .is_err());
    assert_eq!(store.durable_resolve("WORKER").unwrap()["id"], a["id"]);
    assert!(store.durable_resolve("missing").unwrap().is_null());
    assert!(store
        .durable_create("bad", "claude", "/does/not/exist")
        .is_err());
    let bound = dir.join("bound");
    std::fs::create_dir(&bound).unwrap();
    let b = store
        .durable_create("bound", "pi", bound.to_str().unwrap())
        .unwrap();
    std::fs::remove_dir(&bound).unwrap();
    std::os::unix::fs::symlink(&dir, &bound).unwrap();
    assert!(store.durable_acquire(b["id"].as_str().unwrap()).is_err());
    let a = store.durable_acquire(a["id"].as_str().unwrap()).unwrap();
    assert!(store
        .durable_bind(
            a["id"].as_str().unwrap(),
            a["activeRun"]["token"].as_str().unwrap(),
            "11111111-1111-4111-8111-111111111111"
        )
        .is_err());
}
#[test]
fn concurrent_connections_acquire_only_one_run() {
    let (store, dir) = fixture();
    let id = store
        .durable_create("race", "codex", dir.to_str().unwrap())
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let workers: Vec<_> = (0..2)
        .map(|_| {
            let store = Store::open(&dir.join("daemon.db")).unwrap();
            let id = id.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                store.durable_acquire(&id).is_ok()
            })
        })
        .collect();
    assert_eq!(
        workers
            .into_iter()
            .map(|h| usize::from(h.join().unwrap()))
            .sum::<usize>(),
        1
    );
}
#[test]
fn stop_wins_completion_and_run_history_survives_next_send() {
    let (store, dir) = fixture();
    let a = store
        .durable_create("stop", "codex", dir.to_str().unwrap())
        .unwrap();
    let id = a["id"].as_str().unwrap();
    let a = store.durable_acquire(id).unwrap();
    let token = a["activeRun"]["token"].as_str().unwrap();
    assert!(store.durable_request_stop(id, token).unwrap());
    store
        .durable_complete(id, token, "succeeded", Some(0), "done", "healthy")
        .unwrap();
    store.durable_acquire(id).unwrap();
    assert_eq!(
        store.durable_run(id, token).unwrap()["status"],
        "interrupted"
    );
}
#[test]
fn legacy_import_is_transactional_and_one_time() {
    let (store, dir) = fixture();
    let path = dir.join("agents.db");
    let legacy = rusqlite::Connection::open(&path).unwrap();
    legacy.execute_batch("CREATE TABLE durable_agents(id TEXT,name TEXT,provider TEXT,mode TEXT,cwd TEXT,provider_session_id TEXT,state TEXT,session_health TEXT,created_at TEXT,updated_at TEXT,last_active_at TEXT,last_result_status TEXT,last_result_completed_at TEXT,last_result_exit_code INTEGER,last_result_summary TEXT,active_run_token TEXT,active_owner_pid INTEGER,active_owner_started_at TEXT,active_provider_pid INTEGER,active_provider_started_at TEXT,active_run_started_at TEXT);").unwrap();
    legacy.execute("INSERT INTO durable_agents(id,name,provider,mode,cwd,provider_session_id,state,session_health,created_at,updated_at,last_result_status,last_result_completed_at,last_result_exit_code,last_result_summary) VALUES('old','legacy','claude','durable',?,'11111111-1111-4111-8111-111111111111','ready','healthy','created','updated','succeeded','completed',0,'previous')",[dir.to_str().unwrap()]).unwrap();
    assert!(store.durable_import_legacy(&path).unwrap());
    assert_eq!(
        store.durable_resolve("old").unwrap()["lastResult"]["summary"],
        "previous"
    );
    legacy
        .execute("UPDATE durable_agents SET name='changed'", [])
        .unwrap();
    assert!(!store.durable_import_legacy(&path).unwrap());
    assert_eq!(store.durable_resolve("old").unwrap()["name"], "legacy");
}
#[test]
fn missing_source_does_not_mark_import_complete_and_conflicts_rollback() {
    let (store, dir) = fixture();
    assert!(!store.durable_import_legacy(&dir.join("absent.db")).unwrap());
    let path = dir.join("agents.db");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("CREATE TABLE durable_agents(id TEXT,name TEXT,provider TEXT);")
        .unwrap();
    assert!(store.durable_import_legacy(&path).is_err());
    assert!(store.durable_list().unwrap().is_empty());
}
#[test]
fn full_result_is_distinct_from_bounded_agent_summary() {
    let (store, dir) = fixture();
    let a = store
        .durable_create("long", "codex", dir.to_str().unwrap())
        .unwrap();
    let id = a["id"].as_str().unwrap();
    let a = store.durable_acquire(id).unwrap();
    let token = a["activeRun"]["token"].as_str().unwrap();
    let text = "x".repeat(6000);
    store
        .durable_complete(id, token, "succeeded", Some(0), &text, "healthy")
        .unwrap();
    assert_eq!(
        store.durable_resolve(id).unwrap()["lastResult"]["summary"]
            .as_str()
            .unwrap()
            .len(),
        4096
    );
    assert_eq!(store.durable_run(id, token).unwrap()["result"], text);
}

#[test]
fn import_conflict_rolls_back_all_rows_and_can_retry() {
    let (store, dir) = fixture();
    let path = dir.join("agents.db");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("CREATE TABLE durable_agents(id TEXT,name TEXT,provider TEXT,mode TEXT,cwd TEXT,provider_session_id TEXT,state TEXT,session_health TEXT,created_at TEXT,updated_at TEXT,last_active_at TEXT,last_result_status TEXT,last_result_completed_at TEXT,last_result_exit_code INTEGER,last_result_summary TEXT,active_run_token TEXT,active_owner_pid INTEGER,active_owner_started_at TEXT,active_provider_pid INTEGER,active_provider_started_at TEXT,active_run_started_at TEXT);").unwrap();
    for (id, sid) in [
        ("a", "11111111-1111-4111-8111-111111111111"),
        ("b", "22222222-2222-4222-8222-222222222222"),
    ] {
        db.execute("INSERT INTO durable_agents(id,name,provider,mode,cwd,provider_session_id,state,session_health,created_at,updated_at) VALUES(?,'same','claude','durable',?,?,'ready','uninitialized','created','updated')",rusqlite::params![id,dir.to_str().unwrap(),sid]).unwrap();
    }
    assert!(store.durable_import_legacy(&path).is_err());
    assert!(store.durable_list().unwrap().is_empty());
    db.execute(
        "UPDATE durable_agents SET name='different' WHERE id='b'",
        [],
    )
    .unwrap();
    assert!(store.durable_import_legacy(&path).unwrap());
    assert_eq!(store.durable_list().unwrap().len(), 2);
}
#[test]
fn legacy_active_run_and_last_result_are_preserved_together() {
    let (store, dir) = fixture();
    let path = dir.join("agents.db");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("CREATE TABLE durable_agents AS SELECT 'old' AS id,'legacy' AS name,'codex' AS provider,'durable' AS mode,'/bound' AS cwd,NULL AS provider_session_id,'running' AS state,'healthy' AS session_health,'created' AS created_at,'updated' AS updated_at,'last-active' AS last_active_at,'succeeded' AS last_result_status,'completed' AS last_result_completed_at,0 AS last_result_exit_code,'previous' AS last_result_summary,'active-token' AS active_run_token,123 AS active_owner_pid,'linux:123' AS active_owner_started_at,456 AS active_provider_pid,'linux:456' AS active_provider_started_at,'started' AS active_run_started_at;").unwrap();
    store.durable_import_legacy(&path).unwrap();
    let a = store.durable_resolve("old").unwrap();
    assert_eq!(a["activeRun"]["token"], "active-token");
    assert_eq!(a["activeRun"]["provider"]["startedAt"], "linux:456");
    assert_eq!(a["lastResult"]["summary"], "previous");
    assert_eq!(a["cwd"], "/bound");
    assert!(a["providerSessionId"].is_null());
}
#[test]
fn unicode_casefold_ambiguity_returns_array_and_exact_id_wins() {
    let (store, dir) = fixture();
    let a = store
        .durable_create("Ä", "claude", dir.to_str().unwrap())
        .unwrap();
    store
        .durable_create("ä", "pi", dir.to_str().unwrap())
        .unwrap();
    assert_eq!(
        store
            .durable_resolve("Ä")
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        store.durable_resolve(a["id"].as_str().unwrap()).unwrap()["id"],
        a["id"]
    );
}
#[test]
fn codex_session_binding_rejects_non_uuid_version_and_variant() {
    let (store, dir) = fixture();
    let a = store
        .durable_create("uuid", "codex", dir.to_str().unwrap())
        .unwrap();
    let a = store.durable_acquire(a["id"].as_str().unwrap()).unwrap();
    for sid in [
        "11111111-1111-0111-8111-111111111111",
        "11111111-1111-4111-0111-111111111111",
    ] {
        assert!(
            store
                .durable_bind(
                    a["id"].as_str().unwrap(),
                    a["activeRun"]["token"].as_str().unwrap(),
                    sid
                )
                .is_err(),
            "accepted invalid UUID {sid}"
        );
    }
}
#[test]
fn last_result_summary_matches_ts_control_replacement_and_trimming() {
    let (store, dir) = fixture();
    let a = store
        .durable_create("summary", "codex", dir.to_str().unwrap())
        .unwrap();
    let a = store.durable_acquire(a["id"].as_str().unwrap()).unwrap();
    let done = store
        .durable_complete(
            a["id"].as_str().unwrap(),
            a["activeRun"]["token"].as_str().unwrap(),
            "succeeded",
            Some(0),
            "\0 hello \x07 world \n",
            "healthy",
        )
        .unwrap();
    assert_eq!(done["lastResult"]["summary"], "hello   world");
}
