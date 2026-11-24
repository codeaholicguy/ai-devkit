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
