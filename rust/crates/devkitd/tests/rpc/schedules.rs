use super::*;
use crate::runtime::testkit::FixtureDir;

fn request(d: &Daemon, method: &str, params: Value) -> Response {
    d.dispatch(Request {
        id: Some(9),
        method: method.into(),
        params,
    })
}

#[test]
fn schedule_rpc_lifecycle_filters_and_in_flight_cancel_guard() {
    let f = FixtureDir::new("schedule-rpc");
    let d = Daemon::new(&f.0, f.0.join("sock"), f.0.clone()).unwrap();
    let future = devkit_core::store::iso8601_utc(chrono_now() + 300_000);

    let created = request(
        &d,
        "schedule.create",
        json!({
            "agentName": "worker-1",
            "message": "ping",
            "dueAt": future,
            "createdBy": "orchestrator"
        }),
    );
    assert!(created.error.is_none(), "{:?}", created.error);
    let created_val = created.result.unwrap();
    let id = created_val["id"].as_str().unwrap().to_owned();
    assert_eq!(created_val["status"], "pending");
    assert_eq!(created_val["createdBy"], "orchestrator");

    // List with default empty params and with filter
    let listed = request(&d, "schedule.list", json!({})).result.unwrap();
    assert_eq!(listed.as_array().unwrap().len(), 1);
    let filtered = request(
        &d,
        "schedule.list",
        json!({"status": "pending", "agentName": "worker-1", "limit": 10}),
    )
    .result
    .unwrap();
    assert_eq!(filtered.as_array().unwrap().len(), 1);

    // In-flight guard blocks cancel during active delivery
    d.in_flight_schedules.lock().unwrap().insert(id.clone());
    let blocked = request(&d, "schedule.cancel", json!({"id": id}));
    assert_eq!(blocked.code.as_deref(), Some("not_cancellable"));
    assert_eq!(blocked.details.unwrap()["status"], "delivering");
    d.in_flight_schedules.lock().unwrap().remove(&id);

    // Cancel succeeds once not in-flight
    let cancelled = request(&d, "schedule.cancel", json!({"id": id}));
    assert!(cancelled.error.is_none(), "{:?}", cancelled.error);
    assert_eq!(cancelled.result.unwrap()["status"], "cancelled");

    // Second cancel returns not_cancellable with cancelled status
    let again = request(&d, "schedule.cancel", json!({"id": id}));
    assert_eq!(again.code.as_deref(), Some("not_cancellable"));
    assert_eq!(again.details.unwrap()["status"], "cancelled");

    // Missing id -> not_found
    assert_eq!(
        request(&d, "schedule.cancel", json!({"id": "sch_00000000"}))
            .code
            .as_deref(),
        Some("not_found")
    );

    // Unknown schedule method -> unknown_method
    assert_eq!(
        request(&d, "schedule.unknown", json!({})).code.as_deref(),
        Some("unknown_method")
    );
}
