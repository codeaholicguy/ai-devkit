use devkit_harness::start_profiles::start_profile;
use serde_json::Value;
#[test]
fn provider_protocol_fixtures_preserve_ts_contracts() {
    let cases: Value = serde_json::from_str(include_str!(
        "../../../../packages/agent-manager/tests/fixtures/durable-protocol.json"
    ))
    .unwrap();
    for c in cases.as_array().unwrap() {
        let profile = start_profile(c["provider"].as_str().unwrap()).unwrap();
        let mut parser = profile
            .durable_parser(Some(c["sessionId"].as_str().unwrap()))
            .unwrap();
        let accepted = parser.accept(c["stream"].as_str().unwrap().as_bytes());
        let result =
            accepted.and_then(|_| parser.finish(Some(c["exitCode"].as_i64().unwrap() as i32)));
        assert_eq!(
            result.is_ok(),
            c["ok"].as_bool().unwrap(),
            "{} {}: {result:?}",
            c["provider"],
            c["name"]
        );
        if let Ok(r) = result {
            assert_eq!(r.text, c["result"]);
        }
    }
}
#[test]
fn first_and_resume_argv_follow_existing_runners() {
    let sid = "11111111-1111-4111-8111-111111111111";
    assert_eq!(
        start_profile("claude")
            .unwrap()
            .durable_args(Some(sid), true)
            .unwrap(),
        vec![
            "-p",
            "--session-id",
            sid,
            "--output-format",
            "stream-json",
            "--verbose"
        ]
    );
    assert_eq!(
        start_profile("codex")
            .unwrap()
            .durable_args(None, true)
            .unwrap(),
        vec!["exec", "--json", "-"]
    );
    assert_eq!(
        start_profile("codex")
            .unwrap()
            .durable_args(Some(sid), false)
            .unwrap(),
        vec!["exec", "resume", "--json", sid, "-"]
    );
    assert_eq!(
        start_profile("pi")
            .unwrap()
            .durable_args(Some(sid), false)
            .unwrap(),
        vec!["--mode", "json", "--session", sid]
    );
}
#[test]
fn chunked_utf8_and_oversized_lines_are_handled_without_unbounded_buffering() {
    let p = start_profile("claude").unwrap();
    let sid = "11111111-1111-4111-8111-111111111111";
    let mut parser = p.durable_parser(Some(sid)).unwrap();
    let text = format!("{{\"type\":\"result\",\"session_id\":\"{sid}\",\"result\":\"héllo\"}}\n");
    for b in text.as_bytes() {
        parser.accept(&[*b]).unwrap();
    }
    assert_eq!(parser.finish(Some(0)).unwrap().text, "héllo");
    let mut parser = p.durable_parser(Some(sid)).unwrap();
    assert!(parser.accept(&vec![b'x'; 1024 * 1024 + 1]).is_err());
}
