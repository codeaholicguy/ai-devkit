use devkit_core::store::Store;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static N: AtomicU64 = AtomicU64::new(0);
        let p = std::env::temp_dir().join(format!(
            "group-store-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&p).unwrap();
        Self(p)
    }
    fn store(&self) -> Store {
        Store::open(&self.0.join("daemon.db")).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn members(names: &[&str]) -> Vec<String> {
    names.iter().map(|s| s.to_string()).collect()
}

#[test]
fn crud_preserves_order_and_survives_restart() {
    let f = Fixture::new();
    let s = f.store();
    let a = s
        .create_group(" team-a ", members(&[" second ", "first"]))
        .unwrap();
    assert_eq!(a.members, members(&["second", "first"]));
    s.create_group("team-b", members(&["other"])).unwrap();
    assert_eq!(
        s.list_groups()
            .unwrap()
            .iter()
            .map(|g| g.name.as_str())
            .collect::<Vec<_>>(),
        ["team-a", "team-b"]
    );
    let b = s
        .update_group("team-a", members(&["first", "second"]))
        .unwrap();
    assert_eq!(b.created_at, a.created_at);
    assert_eq!(s.add_group_member("team-a", "first").unwrap(), b);
    s.add_group_member("team-a", "third").unwrap();
    assert_eq!(
        s.remove_group_member("team-a", "second").unwrap().members,
        members(&["first", "third"])
    );
    s.remove_group("team-b").unwrap();
    drop(s);
    assert_eq!(
        f.store().get_group("team-a").unwrap().members,
        members(&["first", "third"])
    );
    assert_eq!(f.store().list_groups().unwrap().len(), 1);
}

#[test]
fn validation_preserves_categories_and_precedence() {
    let f = Fixture::new();
    let s = f.store();
    assert_eq!(
        s.create_group("x", members(&["ok"])).unwrap_err().code,
        "invalid_name"
    );
    assert_eq!(
        s.create_group("team", vec![]).unwrap_err().code,
        "empty_members"
    );
    assert_eq!(
        s.create_group("team", members(&[" "])).unwrap_err().code,
        "invalid_member"
    );
    assert_eq!(
        s.create_group("team", members(&["a", " a"]))
            .unwrap_err()
            .code,
        "invalid_member"
    );
    s.create_group("team", members(&["a"])).unwrap();
    assert_eq!(
        s.create_group("team", members(&["b"])).unwrap_err().code,
        "conflict"
    );
    assert_eq!(
        s.update_group("missing", vec![]).unwrap_err().code,
        "empty_members"
    );
    assert_eq!(
        s.add_group_member("missing", " ").unwrap_err().code,
        "not_found"
    );
    assert_eq!(
        s.remove_group_member("team", "b").unwrap_err().code,
        "invalid_member"
    );
    assert_eq!(
        s.remove_group_member("team", "a").unwrap_err().code,
        "empty_members"
    );
    assert_eq!(s.get_group("team").unwrap().members, members(&["a"]));
    assert_eq!(s.remove_group("missing").unwrap_err().code, "not_found");
}

#[test]
fn concurrent_adds_lose_no_members() {
    let f = Fixture::new();
    let s = std::sync::Arc::new(f.store());
    s.create_group("team", members(&["initial"])).unwrap();
    let handles: Vec<_> = (0..12)
        .map(|i| {
            let s = s.clone();
            std::thread::spawn(move || s.add_group_member("team", &format!("m{i}")).unwrap())
        })
        .collect();
    for h in handles {
        h.join().unwrap();
    }
    assert_eq!(s.get_group("team").unwrap().members.len(), 13);
}

fn source(f: &Fixture) -> PathBuf {
    f.0.join("agent-groups.json")
}
fn legacy(groups: serde_json::Value) -> serde_json::Value {
    serde_json::json!({"version":1,"groups":groups})
}
fn old_group(name: &str) -> serde_json::Value {
    serde_json::json!({"name":name,"members":["two","one"],"createdAt":"created","updatedAt":"updated"})
}
fn write_source(f: &Fixture, data: serde_json::Value) {
    std::fs::write(source(f), data.to_string()).unwrap();
}

#[test]
fn import_commits_before_cleanup_and_never_resurrects() {
    let f = Fixture::new();
    write_source(&f, legacy(serde_json::json!([old_group("team")])));
    let s = f.store();
    assert!(s.import_groups(&source(&f)).unwrap().is_none());
    assert!(!source(&f).exists());
    let g = s.get_group("team").unwrap();
    assert_eq!(g.created_at, "created");
    assert_eq!(g.updated_at, "updated");
    assert_eq!(g.members, members(&["two", "one"]));
    s.remove_group("team").unwrap();
    drop(s);
    write_source(&f, legacy(serde_json::json!([old_group("team")])));
    let s = f.store();
    s.import_groups(&source(&f)).unwrap();
    assert!(s.list_groups().unwrap().is_empty());
}
#[test]
fn absent_source_commits_empty_ownership() {
    let f = Fixture::new();
    let s = f.store();
    s.import_groups(&source(&f)).unwrap();
    write_source(&f, legacy(serde_json::json!([old_group("team")])));
    s.import_groups(&source(&f)).unwrap();
    assert!(s.list_groups().unwrap().is_empty());
}
#[test]
fn failed_import_is_atomic_and_repairable() {
    let f = Fixture::new();
    let s = f.store();
    for data in [
        serde_json::json!({"version":2,"groups":[]}),
        legacy(serde_json::json!([old_group("team"), old_group("team")])),
        legacy(serde_json::json!([old_group("team"), old_group("x")])),
        legacy(
            serde_json::json!([old_group("team"),{"name":"empty","members":[],"createdAt":"c","updatedAt":"u"}]),
        ),
    ] {
        write_source(&f, data);
        assert_eq!(s.import_groups(&source(&f)).unwrap_err().code, "storage");
        assert!(source(&f).exists());
        assert!(s.list_groups().unwrap().is_empty());
    }
    std::fs::write(source(&f), "{bad").unwrap();
    assert!(s.import_groups(&source(&f)).is_err());
    write_source(&f, legacy(serde_json::json!([old_group("team")])));
    s.import_groups(&source(&f)).unwrap();
    assert_eq!(s.list_groups().unwrap().len(), 1);
}
#[test]
fn cleanup_failure_is_reported_and_retried_without_reading_source() {
    let f = Fixture::new();
    let s = f.store();
    s.import_groups(&source(&f)).unwrap();
    // A directory cannot be unlinked as a file, even under root. Ownership
    // already committed, so its invalid contents must never be parsed.
    std::fs::create_dir(source(&f)).unwrap();
    assert!(s
        .import_groups(&source(&f))
        .unwrap()
        .unwrap()
        .contains("cleanup"));
    s.create_group("team", members(&["kept"])).unwrap();
    drop(s);
    std::fs::remove_dir(source(&f)).unwrap();
    std::fs::write(source(&f), "bad").unwrap();
    let s = f.store();
    assert!(s.import_groups(&source(&f)).unwrap().is_none());
    assert!(!source(&f).exists());
    assert_eq!(s.get_group("team").unwrap().members, members(&["kept"]));
}
#[test]
fn import_conflict_does_not_overwrite_existing_rows() {
    let f = Fixture::new();
    let s = f.store();
    s.create_group("team", members(&["kept"])).unwrap();
    write_source(
        &f,
        legacy(serde_json::json!([old_group("other"), old_group("team")])),
    );
    assert_eq!(s.import_groups(&source(&f)).unwrap_err().code, "storage");
    assert_eq!(s.list_groups().unwrap().len(), 1);
    assert_eq!(s.get_group("team").unwrap().members, members(&["kept"]));
}

#[test]
fn failed_membership_write_rolls_back_members_and_timestamps() {
    let f = Fixture::new();
    let s = f.store();
    let before = s
        .create_group("team", members(&["kept", "ordered"]))
        .unwrap();
    let conn = rusqlite::Connection::open(f.0.join("daemon.db")).unwrap();
    conn.execute_batch("CREATE TRIGGER reject_member BEFORE INSERT ON group_members WHEN NEW.member='reject' BEGIN SELECT RAISE(ABORT,'injected write failure'); END;").unwrap();
    assert_eq!(
        s.update_group("team", members(&["new", "reject"]))
            .unwrap_err()
            .code,
        "storage"
    );
    assert_eq!(s.get_group("team").unwrap(), before);
    assert_eq!(
        s.add_group_member("team", "reject").unwrap_err().code,
        "storage"
    );
    assert_eq!(s.get_group("team").unwrap(), before);
    assert_eq!(
        s.create_group("other", members(&["new", "reject"]))
            .unwrap_err()
            .code,
        "storage"
    );
    assert_eq!(s.list_groups().unwrap(), [before]);
}
