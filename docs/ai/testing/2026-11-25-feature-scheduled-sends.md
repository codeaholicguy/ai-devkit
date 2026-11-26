---
phase: testing
title: Testing Strategy
description: Unit, integration, and smoke test plan for scheduled agent sends (#482)
---

# Testing Strategy

## Test Coverage Goals

- Unit tests covering 100% of new state-machine transitions, validation branches, duration/ISO parsers, delivery adapters, and CLI option validation.
- Integration tests exercising real `devkitd` RPC (`schedule.create/list/cancel`), scheduler ticks, startup restart reconciliation, and multi-pane tmux fixture delivery.
- Disposable sandboxed smoke test driving real compiled `devkitd` + built `ai-devkit` CLI end to end.

## Unit Tests

### `devkit-core` Store & Timestamp Parser (`rust/crates/devkit-core/tests/schedules.rs`)
- [x] Create schedule persists canonical UTC ISO-8601 `due_at`, `created_at`, `pending` status, short `sch_` ID, optional `created_by`.
- [x] Validation rejects blank `agent_name`, `agent_name > 128` chars, blank `message`, `message > 64 KiB`, invalid ISO-8601, missing timezone, past `due_at`.
- [x] ISO-8601 parser accepts `Z` and `±HH:MM` offsets, fractional seconds, and rejects invalid dates (e.g. Feb 30).
- [x] State transitions: `pending -> sent`, `pending -> late`, `pending -> skipped`, `pending -> failed`, `pending -> cancelled`.
- [x] Cancel on non-existent ID returns `not_found`; cancel on terminal row returns `not_cancellable` with current status.
- [x] `list_schedules` supports `status` filter, `agent_name` filter, `limit` clamping, and ordering (pending soonest-first, terminal newest-first).
- [x] `due_pending` returns only `pending` rows with `due_at <= now`, ordered by `(due_at ASC, id ASC)`.
- [x] Amortized pruning deletes old terminal rows past retention cap while never deleting `pending` rows.

### `devkitd` Runtimes & Scheduler (`rust/crates/devkitd/src/runtime/{tmux,herdr}.rs`, `scheduler.rs`)
- [x] `TmuxRuntime::pane_for_pid` selects exact TTY-matched `%pane_id` in multi-pane tmux output (not first pane).
- [x] `TmuxRuntime::send_to_pane` pipes stdin to `load-buffer`, calls `paste-buffer -t %pane -p -d`, and sends `send-keys -t %pane Enter`; deletes buffer on paste failure.
- [x] `HerdrRuntime::send_prompt` runs `herdr agent prompt <paneId> <message>` and surfaces JSON errors.
- [x] Scheduler tick marks `age > 1h` as `skipped` without invoking deliverer.
- [x] Scheduler tick marks overdue `<= 1h` (when `due_at < started_at` or `age > 60s`) as `late` on delivery success.
- [x] Scheduler tick marks on-time due sends as `sent` with `sent_at`.
- [x] Renamed/missing, dead/tombstoned, ambiguous unregistered, and durable targets mark `failed` with explicit `failure_reason`.
- [x] Concurrent same-tick due rows deliver sequentially in `(due_at, id)` order.
- [x] `in_flight` guard rejects `schedule.cancel` with `not_cancellable` while delivery is active.
- [x] Unmanaged live agent (outside tmux/herdr) routes to subprocess fallback; missing CLI fails with clear PATH-aware reason.

### CLI & Daemon Client (`packages/cli/tests/...`, `packages/daemon-client/tests/...`)
- [x] `parseDurationMs`: valid single/compound (`30s`, `15m`, `2h`, `1d`, `1h30m`, uppercase); rejects bare numbers, `0m`, negatives, duplicates (`1h2h`), `>365d`.
- [x] `parseFutureIsoTimestamp`: valid `Z` and offset timestamps normalized to UTC; rejects missing TZ, invalid calendar dates (`2026-02-30`), and past timestamps.
- [x] `assertSendTargetOptions`: `--in` XOR `--at`, rejects `--group` + `--in/--at`, rejects `--wait`/`--timeout` + `--in/--at`, preserves immediate sends.
- [x] `AgentScheduleService`: daemon-only error when no daemon, `unknown method` upgrade hint, coded error mapping (`not_found`, `not_cancellable`, `invalid_params`).
- [x] `agent send --id <agent> --in/--at`: creates schedule, rejects durable target upfront, warns non-fatally when target not currently live, outputs `--json` or human summary.
- [x] `agent schedule list [--status] [--agent] [--limit] [--json]` and `agent schedule cancel <id> [--json]`.

## Integration Tests (`rust/crates/devkitd/tests/rpc/schedules.rs`)
- [x] Full socket RPC round-trip: `schedule.create` → `schedule.list` → `schedule.cancel` → verify cancelled state.
- [x] Restart recovery: seed DB with one due 5m ago and one due 2h ago → start fresh `Daemon` → verify first fires as `late` and second marks `skipped`.

## End-to-End / Smoke Tests (Disposable Sandboxed Script)
- [x] Real built `devkitd` + built `ai-devkit` CLI in isolated `HOME` with stub tmux session (multi-pane): schedule send via `agent send --id <agent> --in 2s "hello"`, verify exact pane receives message, verify `agent schedule list --json` shows `sent`.
- [x] Schedule future send, cancel via `agent schedule cancel <id>`, verify `cancelled` and never delivered.
- [x] Restart `devkitd` with pre-seeded overdue rows (5m late + 2h late), verify `late` and `skipped` statuses.
- [x] Schedule for non-existent target, verify warning on create and `failed` status with reason at fire time.

## Test Reporting & Coverage
- Rust: `cargo test --workspace`
- TS build & tests: `npm run build && npx vitest run` (in `packages/daemon-client`, `packages/cli`)
- Lint: `npx ai-devkit@latest lint --feature scheduled-sends`
