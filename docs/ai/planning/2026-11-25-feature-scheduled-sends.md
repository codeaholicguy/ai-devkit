---
phase: planning
title: Project Planning & Task Breakdown
description: Ordered TDD implementation plan for scheduled agent sends (#482)
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Rust store, RFC3339 parser, and wire protocol (`devkit-core` + `daemon-client` gen types)
- [x] Milestone 2: Rust delivery engine, RPC handlers, and dedicated scheduler task (`devkitd`)
- [x] Milestone 3: TypeScript `DaemonClient`, CLI `agent send --in/--at`, and `agent schedule list/cancel`
- [x] Milestone 4: Full unit/integration test suites, real-daemon end-to-end smoke test, review, rebase, and PR

## Task Breakdown

### Phase 1: Rust Store & Wire Types (`devkit-core`)
- [x] Task 1.1: Implement `parse_iso8601_utc_ms` and `scheduled_sends` store module (`rust/crates/devkit-core/src/store/schedules.rs`) with TDD unit tests (`rust/crates/devkit-core/tests/schedules.rs`): create, list (filters/ordering/limit), cancel (pending/missing/terminal), due query, state transitions (`sent`/`late`/`skipped`/`failed`/`cancelled`), validation (64 KiB cap, blank fields, past/invalid timestamps), retention pruning.
- [x] Task 1.2: Add `ScheduledSend`, `ScheduleCreateParams`, `ScheduleListParams`, `ScheduleCancelParams` to `rust/crates/devkit-core/src/proto.rs` and regenerate `packages/daemon-client/src/gen/*.ts` via `cargo test -p devkit-core`.

### Phase 2: Rust Delivery Engine, RPC & Scheduler (`devkitd`)
- [x] Task 2.1: Add `TmuxRuntime::pane_for_pid` and `TmuxRuntime::send_to_pane` (stdin `load-buffer` + `paste-buffer -p -d` + 150ms + `send-keys Enter` + cleanup/timeouts) and `HerdrRuntime::send_prompt` with `FixtureDir` unit tests.
- [x] Task 2.2: Implement `rust/crates/devkitd/src/scheduler.rs` (fire-time resolution, hybrid delivery engine with injectable deliverer, unified late/skip policy, sequential `(due_at, id)` execution, `in_flight` guard) and `rust/crates/devkitd/src/rpc/schedule.rs` (`schedule.create/list/cancel`).
- [x] Task 2.3: Wire `schedule.*` dispatch and dedicated 2s scheduler task in `rust/crates/devkitd/src/server.rs`, plus integration tests in `rust/crates/devkitd/tests/rpc/schedules.rs`.

### Phase 3: Daemon Client & CLI (`packages/daemon-client`, `packages/cli`)
- [x] Task 3.1: Add `createSchedule`, `listSchedules`, `cancelSchedule` to `packages/daemon-client/src/client.ts` and re-export generated types in `packages/daemon-client/src/index.ts`.
- [x] Task 3.2: Add `parseDurationMs` and `parseFutureIsoTimestamp` to `packages/cli/src/util/time.ts` with unit tests.
- [x] Task 3.3: Create `packages/cli/src/services/agent/agent-schedule.service.ts`, extend `assertSendTargetOptions` in `packages/cli/src/services/agent/agent.service.ts`, wire `--in`/`--at` into `packages/cli/src/commands/agent/send.command.ts`, and add `packages/cli/src/commands/agent/schedule.command.ts` (registered in `agent.command.ts`). Add unit tests for all new service and command paths.

### Phase 4: Verification, Smoke, Review & PR
- [x] Task 4.1: Run full Rust tests (`cargo test --workspace`), TS build (`npm run build`), TS tests (`npx vitest run` across affected packages), and linter/formatter.
- [x] Task 4.2: Run disposable sandboxed `dev-smoke` script against real built `devkitd` + real CLI + real/stub tmux session verifying schedule creation, exact multi-pane delivery, cancel, late/skip on daemon restart, and missing-target failure.
- [x] Task 4.3: Reconcile docs, perform `dev-simplify` + `dev-review`, commit cleanly, rebase onto `origin/main`, push, and open PR referencing #482.

## Dependencies

- Task 1.2 depends on 1.1 (`ScheduledSend` type).
- Task 2.2 depends on 1.1, 1.2, 2.1.
- Task 2.3 depends on 2.2.
- Task 3.1 depends on 1.2 (generated TS types).
- Task 3.3 depends on 3.1 and 3.2.
- Task 4.1–4.3 depend on all implementation tasks.

## Risks & Mitigation

- **PR #481 merge conflict:** Avoid touching `proto.rs` `AgentLookup*`, `lookup.rs`, or `registry.rs`; keep `pane_for_pid` internal in `tmux.rs`.
- **Autostart 3s timeout:** Spawn scheduler task strictly after `UnixListener::bind()` in `serve()`.
- **Subprocess hangs:** Enforce hard timeouts on tmux/herdr (10s) and CLI fallback (15s).
