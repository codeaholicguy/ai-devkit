use devkit_core::store::{
    iso8601_utc, parse_iso8601_utc_ms, ScheduleFilter, Store, MAX_SCHEDULE_MESSAGE_BYTES,
};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static N: AtomicU64 = AtomicU64::new(0);
        let p = std::env::temp_dir().join(format!(
            "schedule-store-{}-{}",
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

#[test]
fn iso8601_parser_handles_utc_offsets_fractions_and_rejects_invalid() {
    let base = parse_iso8601_utc_ms("2026-11-25T20:00:00Z").unwrap();
    assert_eq!(iso8601_utc(base), "2026-11-25T20:00:00.000Z");

    assert_eq!(
        parse_iso8601_utc_ms("2026-11-25T20:00:00.250Z").unwrap(),
        base + 250
    );
    assert_eq!(
        parse_iso8601_utc_ms("2026-11-25T20:00:00.5Z").unwrap(),
        base + 500
    );
    // -05:00 -> +5h in UTC
    assert_eq!(
        parse_iso8601_utc_ms("2026-11-25T15:00:00-05:00").unwrap(),
        base
    );
    // +02:30 -> -2h30m in UTC
    assert_eq!(
        parse_iso8601_utc_ms("2026-11-25T22:30:00+02:30").unwrap(),
        base
    );
    // Leap year Feb 29 valid, non-leap invalid
    assert!(parse_iso8601_utc_ms("2024-02-29T12:00:00Z").is_ok());
    assert!(parse_iso8601_utc_ms("2026-02-29T12:00:00Z").is_err());
    assert!(parse_iso8601_utc_ms("2026-02-30T12:00:00Z").is_err());
    // Missing timezone rejected
    assert!(parse_iso8601_utc_ms("2026-11-25T20:00:00").is_err());
    assert!(parse_iso8601_utc_ms("not-a-date").is_err());
}

#[test]
fn create_list_cancel_and_restart_persistence() {
    let f = Fixture::new();
    let s = f.store();
    let now_ms = parse_iso8601_utc_ms("2026-11-25T20:00:00Z").unwrap();

    let created = s
        .create_schedule_at(
            " worker-1 ",
            "check status",
            "2026-11-25T20:15:00+00:00",
            Some("orchestrator"),
            now_ms,
        )
        .unwrap();
    assert!(created.id.starts_with("sch_"));
    assert_eq!(created.id.len(), 12);
    assert_eq!(created.agent_name, "worker-1");
    assert_eq!(created.message, "check status");
    assert_eq!(created.due_at, "2026-11-25T20:15:00.000Z");
    assert_eq!(created.status, "pending");
    assert_eq!(created.created_by.as_deref(), Some("orchestrator"));
    assert_eq!(created.sent_at, None);
    assert_eq!(created.failure_reason, None);

    drop(s);
    let s2 = f.store();
    let listed = s2.list_schedules(&ScheduleFilter::default()).unwrap();
    assert_eq!(listed, vec![created.clone()]);

    let cancelled = s2.cancel_schedule(&created.id).unwrap();
    assert_eq!(cancelled.status, "cancelled");
    assert_eq!(cancelled.id, created.id);

    // Re-cancelling terminal row returns not_cancellable with current status
    let err = s2.cancel_schedule(&created.id).unwrap_err();
    assert_eq!(err.code, "not_cancellable");
    assert_eq!(err.details["status"], "cancelled");

    // Unknown ID returns not_found
    let err = s2.cancel_schedule("sch_00000000").unwrap_err();
    assert_eq!(err.code, "not_found");
}

#[test]
fn create_validation_enforces_limits_and_future_due_at() {
    let f = Fixture::new();
    let s = f.store();
    let now_ms = parse_iso8601_utc_ms("2026-11-25T20:00:00Z").unwrap();
    let future = "2026-11-25T20:05:00Z";

    assert_eq!(
        s.create_schedule_at("   ", "hi", future, None, now_ms)
            .unwrap_err()
            .code,
        "invalid_params"
    );
    assert_eq!(
        s.create_schedule_at(&"a".repeat(129), "hi", future, None, now_ms)
            .unwrap_err()
            .code,
        "invalid_params"
    );
    assert_eq!(
        s.create_schedule_at("agent-1", "  \n ", future, None, now_ms)
            .unwrap_err()
            .code,
        "invalid_params"
    );
    let too_big = "x".repeat(MAX_SCHEDULE_MESSAGE_BYTES + 1);
    assert_eq!(
        s.create_schedule_at("agent-1", &too_big, future, None, now_ms)
            .unwrap_err()
            .code,
        "invalid_params"
    );
    let exact_max = "x".repeat(MAX_SCHEDULE_MESSAGE_BYTES);
    assert!(s
        .create_schedule_at("agent-1", &exact_max, future, None, now_ms)
        .is_ok());

    // Past due_at rejected
    assert_eq!(
        s.create_schedule_at("agent-1", "hi", "2026-11-25T19:59:59Z", None, now_ms)
            .unwrap_err()
            .code,
        "invalid_params"
    );
    // Invalid timestamp rejected
    assert_eq!(
        s.create_schedule_at("agent-1", "hi", "2026-11-25T20:05:00", None, now_ms)
            .unwrap_err()
            .code,
        "invalid_params"
    );
}

#[test]
fn state_transitions_due_ordering_and_list_filters() {
    let f = Fixture::new();
    let s = f.store();
    let t0 = parse_iso8601_utc_ms("2026-11-25T20:00:00Z").unwrap();

    let a = s
        .create_schedule_at("alpha", "m1", "2026-11-25T20:01:00Z", None, t0)
        .unwrap();
    let b = s
        .create_schedule_at("beta", "m2", "2026-11-25T20:01:00Z", None, t0)
        .unwrap();
    let c = s
        .create_schedule_at("alpha", "m3", "2026-11-25T20:05:00Z", None, t0)
        .unwrap();
    let d = s
        .create_schedule_at("gamma", "m4", "2026-11-25T20:10:00Z", None, t0)
        .unwrap();

    // At 20:01:00Z only a and b are due, ordered by (due_at ASC, id ASC)
    let t1 = parse_iso8601_utc_ms("2026-11-25T20:01:00Z").unwrap();
    let due = s.due_pending_schedules(t1).unwrap();
    let mut expected_ids = vec![a.id.clone(), b.id.clone()];
    expected_ids.sort();
    assert_eq!(
        due.iter().map(|r| r.id.clone()).collect::<Vec<_>>(),
        expected_ids
    );

    // Transition a -> sent, b -> late, c -> failed, d -> skipped
    assert!(s.mark_schedule_delivered(&a.id, t1, false).unwrap());
    // Double transition is a no-op returning false
    assert!(!s.mark_schedule_delivered(&a.id, t1, false).unwrap());
    assert!(s.mark_schedule_delivered(&b.id, t1 + 90_000, true).unwrap());
    assert!(s.mark_schedule_failed(&c.id, "target gone").unwrap());
    assert!(s
        .mark_schedule_skipped(&d.id, "missed due time by >1h")
        .unwrap());

    assert!(s.due_pending_schedules(t1 + 999_999).unwrap().is_empty());

    // Filter by status
    let failed = s
        .list_schedules(&ScheduleFilter {
            status: Some("failed".into()),
            agent_name: None,
            limit: None,
        })
        .unwrap();
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0].id, c.id);
    assert_eq!(failed[0].failure_reason.as_deref(), Some("target gone"));
    assert_eq!(failed[0].sent_at, None);

    // Filter by agent_name
    let alphas = s
        .list_schedules(&ScheduleFilter {
            status: None,
            agent_name: Some("alpha".into()),
            limit: None,
        })
        .unwrap();
    assert_eq!(alphas.len(), 2);

    // Invalid status filter rejected
    assert_eq!(
        s.list_schedules(&ScheduleFilter {
            status: Some("bogus".into()),
            agent_name: None,
            limit: None,
        })
        .unwrap_err()
        .code,
        "invalid_params"
    );

    // Pending rows sort before terminal rows in list
    let e = s
        .create_schedule_at("alpha", "future", "2026-11-25T21:00:00Z", None, t0)
        .unwrap();
    let all = s.list_schedules(&ScheduleFilter::default()).unwrap();
    assert_eq!(all[0].id, e.id);
}

#[test]
fn retention_pruning_preserves_pending_and_caps_terminal_rows() {
    let f = Fixture::new();
    let s = f.store();
    let t0 = parse_iso8601_utc_ms("2026-11-25T20:00:00Z").unwrap();

    let pending = s
        .create_schedule_at("keep", "stay", "2026-11-25T22:00:00Z", None, t0)
        .unwrap();
    for i in 0..10 {
        let due = iso8601_utc(t0 + (i + 1) * 1000);
        let row = s.create_schedule_at("a", "m", &due, None, t0).unwrap();
        s.mark_schedule_delivered(&row.id, t0 + (i + 1) * 1000, false)
            .unwrap();
    }
    let deleted = s.prune_terminal_schedules(3, t0 + 100_000).unwrap();
    assert_eq!(deleted, 7);

    let remaining = s
        .list_schedules(&ScheduleFilter {
            limit: Some(50),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(remaining.len(), 4);
    assert_eq!(remaining[0].id, pending.id);
}
