use super::*;
use crate::runtime::testkit::FixtureDir;
fn request(d: &Daemon, method: &str, params: Value) -> Response {
    d.dispatch(Request {
        id: Some(7),
        method: method.into(),
        params,
    })
}
#[test]
fn group_rpc_lifecycle_and_errors() {
    let f = FixtureDir::new("group-rpc");
    let d = Daemon::new(&f.0, f.0.join("sock"), f.0.clone()).unwrap();
    let call = |method, params| request(&d, method, params);
    let r = call("group.create", json!({"name":"team","members":["b","a"]}));
    assert!(r.error.is_none(), "{:?}", r.error);
    assert_eq!(r.result.unwrap()["members"], json!(["b", "a"]));
    assert_eq!(
        call("group.create", json!({"name":"team","members":["b"]}))
            .code
            .as_deref(),
        Some("conflict")
    );
    assert_eq!(
        call("group.update", json!({"name":"team","members":[]}))
            .code
            .as_deref(),
        Some("empty_members")
    );
    assert_eq!(
        call("group.create", json!({"name":"x","members":["b"]}))
            .code
            .as_deref(),
        Some("invalid_name")
    );
    assert_eq!(
        call("group.add", json!({"name":"team","member":" "}))
            .code
            .as_deref(),
        Some("invalid_member")
    );
    assert_eq!(
        call("group.add", json!({"name":"team","member":"c"}))
            .result
            .unwrap()["members"],
        json!(["b", "a", "c"])
    );
    assert_eq!(
        call("group.remove_agent", json!({"name":"team","member":"a"}))
            .result
            .unwrap()["members"],
        json!(["b", "c"])
    );
    assert_eq!(
        call("group.update", json!({"name":"team","members":["c","b"]}))
            .result
            .unwrap()["members"],
        json!(["c", "b"])
    );
    assert_eq!(
        call("group.lookup", json!({"name":"team"})).result.unwrap()["members"],
        json!(["c", "b"])
    );
    assert_eq!(
        call("group.detail", json!({"name":"team"})).result.unwrap()["name"],
        "team"
    );
    assert_eq!(
        call("group.list", json!({}))
            .result
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        call("group.add", json!({"name":"team","member":42}))
            .code
            .as_deref(),
        Some("invalid_params")
    );
    assert!(call("group.remove", json!({"name":"team"})).error.is_none());
    assert_eq!(
        call("group.detail", json!({"name":"team"})).code.as_deref(),
        Some("not_found")
    );
}
#[test]
fn failed_import_blocks_groups_but_not_ping_and_can_be_repaired() {
    let f = FixtureDir::new("group-import-rpc");
    std::fs::write(f.0.join("agent-groups.json"), "bad").unwrap();
    let d = Daemon::new(&f.0, f.0.join("sock"), f.0.clone()).unwrap();
    assert!(request(&d, "ping", json!({})).error.is_none());
    assert_eq!(
        request(&d, "group.list", json!({})).code.as_deref(),
        Some("storage")
    );
    std::fs::write(
        f.0.join("agent-groups.json"),
        r#"{"version":1,"groups":[]}"#,
    )
    .unwrap();
    assert_eq!(
        request(&d, "group.list", json!({})).result.unwrap(),
        json!([])
    );
}
