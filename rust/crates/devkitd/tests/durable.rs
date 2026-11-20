use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    os::unix::{fs::PermissionsExt, net::UnixStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
struct Fixture {
    dir: PathBuf,
    child: Child,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}
impl Fixture {
    fn new() -> Self {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "durable-rpc-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(dir.join("bin")).unwrap();
        let stub = dir.join("bin/claude");
        std::fs::write(
            &stub,
            r#"#!/usr/bin/env python3
import signal,sys,json,time
args=sys.argv
sid=args[args.index('--session-id')+1] if '--session-id' in args else args[args.index('--resume')+1]
prompt=sys.stdin.read()
if prompt=='block_ignore_term':
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    time.sleep(30)
if prompt=='block': time.sleep(30)
if prompt=='bad': print('{bad json}')
else: print(json.dumps({'type':'result','session_id':sid,'result':'reply:'+prompt}))
sys.exit(7 if prompt=='fail' else 0)
"#,
        )
        .unwrap();
        std::fs::set_permissions(stub, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::os::unix::fs::symlink("/usr/bin/python3", dir.join("bin/python3")).unwrap();
        let child = Self::launch(&dir);
        let f = Self { dir, child };
        f.ready();
        f
    }
    fn launch(dir: &std::path::Path) -> Child {
        Command::new(env!("CARGO_BIN_EXE_devkitd"))
            .env("HOME", dir)
            .env("PATH", dir.join("bin"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }
    fn ready(&self) {
        let until = Instant::now() + Duration::from_secs(5);
        while UnixStream::connect(self.dir.join(".ai-devkit/daemon.sock")).is_err() {
            assert!(Instant::now() < until);
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    fn rpc(&self, method: &str, params: Value) -> Value {
        let mut s = UnixStream::connect(self.dir.join(".ai-devkit/daemon.sock")).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        writeln!(s, "{}", json!({"id":1,"method":method,"params":params})).unwrap();
        let mut line = String::new();
        BufReader::new(s).read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }
    fn create(&self) -> Value {
        let r = self.rpc(
            "durable.create",
            json!({"name":"worker","provider":"claude","cwd":self.dir}),
        );
        assert!(r.get("error").is_none(), "{r}");
        r["result"].clone()
    }
    fn wait(&self, id: &Value, token: &Value) -> Value {
        let until = Instant::now() + Duration::from_secs(5);
        loop {
            let r = self.rpc("durable.show", json!({"reference":id,"runId":token}));
            assert!(r.get("error").is_none(), "{r}");
            if r["result"]["run"]["status"] != "running" {
                return r["result"].clone();
            }
            assert!(Instant::now() < until, "{r}");
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}
#[test]
fn durable_runs_survive_disconnect_and_report_actual_outcomes() {
    let f = Fixture::new();
    let a = f.create();
    for (prompt, status, code) in [
        ("hello", "succeeded", 0),
        ("fail", "failed", 7),
        ("bad", "failed", 0),
    ] {
        let r = f.rpc("durable.send", json!({"id":a["id"],"prompt":prompt}));
        assert!(r.get("error").is_none(), "{r}");
        let done = f.wait(&a["id"], &r["result"]["runId"]);
        assert_eq!(done["run"]["status"], status);
        if prompt == "bad" {
            assert!(done["run"]["exitCode"].is_null() || done["run"]["exitCode"] == 0);
        } else {
            assert_eq!(done["run"]["exitCode"], code);
        }
    }
}
#[test]
fn stop_and_restart_adoption_do_not_double_launch() {
    let mut f = Fixture::new();
    let a = f.create();
    let r = f.rpc("durable.run", json!({"id":a["id"],"prompt":"block"}));
    assert!(r.get("error").is_none(), "{r}");
    let token = r["result"]["runId"].clone();
    assert_eq!(
        f.rpc("durable.send", json!({"id":a["id"],"prompt":"duplicate"}))["code"],
        "busy"
    );
    f.child.kill().unwrap();
    f.child.wait().unwrap();
    f.child = Fixture::launch(&f.dir);
    std::thread::sleep(Duration::from_millis(100));
    f.ready();
    assert_eq!(
        f.rpc("durable.show", json!({"reference":a["id"]}))["result"]["state"],
        "running"
    );
    let stopped = f.rpc("durable.stop", json!({"id":a["id"],"runId":token}));
    assert!(stopped.get("error").is_none(), "{stopped}");
    let done = f.wait(&a["id"], &token);
    assert_eq!(done["run"]["status"], "interrupted");
    assert!(done["run"]["exitCode"].is_null());
    assert!(f
        .rpc("durable.stop", json!({"id":a["id"]}))
        .get("error")
        .is_none());
}
#[test]
fn reused_process_identity_is_interrupted_with_unknown_exit() {
    let f = Fixture::new();
    let a = f.create();
    let store = devkit_core::store::Store::open(&f.dir.join(".ai-devkit/daemon.db")).unwrap();
    let running = store.durable_acquire(a["id"].as_str().unwrap()).unwrap();
    let token = running["activeRun"]["token"].clone();
    let db = rusqlite::Connection::open(f.dir.join(".ai-devkit/daemon.db")).unwrap();
    db.execute("UPDATE durable_runs SET owner_started_at='reused',provider_pid=?,provider_started_at='reused' WHERE token=?",rusqlite::params![std::process::id(),token.as_str().unwrap()]).unwrap();
    let done = f.rpc("durable.show", json!({"reference":a["id"],"runId":token}));
    assert_eq!(done["result"]["run"]["status"], "interrupted");
    assert!(done["result"]["run"]["exitCode"].is_null());
}
#[test]
fn corrupt_durable_database_is_not_replaced_with_empty_state() {
    let mut f = Fixture::new();
    f.create();
    f.child.kill().unwrap();
    f.child.wait().unwrap();
    for side in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(f.dir.join(format!(".ai-devkit/daemon.db{side}")));
    }
    std::fs::write(f.dir.join(".ai-devkit/daemon.db"), b"corrupt durable state").unwrap();
    f.child = Fixture::launch(&f.dir);
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if let Some(status) = f.child.try_wait().unwrap() {
            assert!(!status.success());
            break;
        }
        assert!(
            Instant::now() < deadline,
            "daemon silently replaced corrupt durable state"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(
        std::fs::read(f.dir.join(".ai-devkit/daemon.db")).unwrap(),
        b"corrupt durable state"
    );
}
#[test]
fn stop_imported_legacy_provider_without_a_private_process_group() {
    let f = Fixture::new();
    let mut provider = Command::new("sleep").arg("30").spawn().unwrap();
    let (pid, started) = devkit_core::durable_process::identity(provider.id() as i64)
        .unwrap()
        .unwrap();
    let db = rusqlite::Connection::open(f.dir.join(".ai-devkit/agents.db")).unwrap();
    db.execute_batch("CREATE TABLE durable_agents AS SELECT 'old' AS id,'legacy' AS name,'codex' AS provider,'durable' AS mode,'/bound' AS cwd,NULL AS provider_session_id,'running' AS state,'healthy' AS session_health,'created' AS created_at,'updated' AS updated_at,NULL AS last_active_at,NULL AS last_result_status,NULL AS last_result_completed_at,NULL AS last_result_exit_code,NULL AS last_result_summary,'active-token' AS active_run_token,99999999 AS active_owner_pid,'dead' AS active_owner_started_at,NULL AS active_provider_pid,NULL AS active_provider_started_at,'started' AS active_run_started_at;").unwrap();
    db.execute(
        "UPDATE durable_agents SET active_provider_pid=?,active_provider_started_at=?",
        rusqlite::params![pid, started],
    )
    .unwrap();
    let stopped = f.rpc("durable.stop", json!({"id":"old"}));
    let _ = provider.kill();
    let _ = provider.wait();
    assert_eq!(stopped["result"]["state"], "degraded", "{stopped}");
}
#[test]
fn spawn_failure_releases_ownership_and_records_failure() {
    let f = Fixture::new();
    let a = f.create();
    std::fs::remove_file(f.dir.join("bin/claude")).unwrap();
    // An isolated PATH prevents accidentally finding a real provider binary.
    // The fixture already resolves the command to its private bin first; use
    // an executable file with a missing interpreter instead of removing it.
    std::fs::write(f.dir.join("bin/claude"), "#!/missing/interpreter\n").unwrap();
    std::fs::set_permissions(
        f.dir.join("bin/claude"),
        std::fs::Permissions::from_mode(0o755),
    )
    .unwrap();
    let failed = f.rpc("durable.send", json!({"id":a["id"],"prompt":"hello"}));
    assert_eq!(failed["code"], "spawn_failed");
    let done = f.rpc("durable.show", json!({"reference":a["id"]}));
    assert_eq!(done["result"]["lastResult"]["status"], "failed");
    assert!(done["result"]["activeRun"].is_null());
}
#[test]
fn invalid_provider_type_is_not_silently_defaulted() {
    let f = Fixture::new();
    let r = f.rpc(
        "durable.create",
        json!({"name":"invalid","provider":5,"cwd":f.dir}),
    );
    assert_eq!(r["code"], "invalid_params", "{r}");
}
#[test]
fn live_daemon_owner_without_supervised_child_does_not_keep_run_busy_forever() {
    let f = Fixture::new();
    let a = f.create();
    let store = devkit_core::store::Store::open(&f.dir.join(".ai-devkit/daemon.db")).unwrap();
    let running = store.durable_acquire(a["id"].as_str().unwrap()).unwrap();
    let token = running["activeRun"]["token"].as_str().unwrap();
    let status = f.rpc("daemon.status", json!({}));
    let pid = status["result"]["pid"].as_i64().unwrap();
    let (_, started) = devkit_core::durable_process::identity(pid)
        .unwrap()
        .unwrap();
    let db = rusqlite::Connection::open(f.dir.join(".ai-devkit/daemon.db")).unwrap();
    db.execute(
        "UPDATE durable_runs SET owner_pid=?,owner_started_at=? WHERE token=?",
        rusqlite::params![pid, started, token],
    )
    .unwrap();
    let done = f.rpc("durable.show", json!({"reference":a["id"],"runId":token}));
    assert_eq!(done["result"]["run"]["status"], "interrupted");
}
#[test]
fn run_lookup_does_not_return_null_agent_against_its_wire_contract() {
    let f = Fixture::new();
    assert!(f.rpc("durable.show", json!({"reference":"missing"}))["result"].is_null());
    let missing = f.rpc("durable.show", json!({"reference":"missing","runId":"run"}));
    assert_eq!(missing["code"], "not_found");
}
#[test]
fn stop_does_not_block_other_agents_during_grace_period() {
    let f = Fixture::new();
    let a = f.create();
    let b = f.rpc(
        "durable.create",
        json!({"name":"other","provider":"claude","cwd":f.dir}),
    )["result"]
        .clone();
    let r = f.rpc(
        "durable.run",
        json!({"id":a["id"],"prompt":"block_ignore_term"}),
    );
    assert!(r.get("error").is_none(), "{r}");
    std::thread::sleep(Duration::from_millis(150));
    let sock = f.dir.join(".ai-devkit/daemon.sock");
    let a_id = a["id"].clone();
    let stopper = std::thread::spawn(move || {
        let mut s = UnixStream::connect(sock).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        writeln!(
            s,
            "{}",
            json!({"id":1,"method":"durable.stop","params":{"id":a_id}})
        )
        .unwrap();
        let mut line = String::new();
        BufReader::new(s).read_line(&mut line).unwrap();
        serde_json::from_str::<Value>(&line).unwrap()
    });
    std::thread::sleep(Duration::from_millis(150));
    let start = Instant::now();
    let other_run = f.rpc("durable.send", json!({"id":b["id"],"prompt":"hello"}));
    assert!(other_run.get("error").is_none(), "{other_run}");
    let done_b = f.wait(&b["id"], &other_run["result"]["runId"]);
    assert_eq!(done_b["run"]["status"], "succeeded");
    assert!(
        start.elapsed() < Duration::from_millis(1200),
        "other agent was blocked during stop grace period: {:?}",
        start.elapsed()
    );
    let stopped = stopper.join().unwrap();
    assert!(stopped.get("error").is_none(), "{stopped}");
}
#[test]
fn adopted_sigterm_ignoring_run_escalates_to_sigkill_and_finalizes() {
    let mut f = Fixture::new();
    let a = f.create();
    let r = f.rpc(
        "durable.run",
        json!({"id":a["id"],"prompt":"block_ignore_term"}),
    );
    assert!(r.get("error").is_none(), "{r}");
    let token = r["result"]["runId"].clone();
    std::thread::sleep(Duration::from_millis(150));
    f.child.kill().unwrap();
    f.child.wait().unwrap();
    f.child = Fixture::launch(&f.dir);
    std::thread::sleep(Duration::from_millis(100));
    f.ready();
    let stopped = f.rpc("durable.stop", json!({"id":a["id"],"runId":token}));
    assert!(stopped.get("error").is_none(), "{stopped}");
    assert_eq!(stopped["result"]["state"], "degraded", "{stopped}");
    let done = f.rpc("durable.show", json!({"reference":a["id"],"runId":token}));
    assert_eq!(done["result"]["run"]["status"], "interrupted", "{done}");
    assert!(done["result"]["run"]["exitCode"].is_null());
}
