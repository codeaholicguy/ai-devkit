---
phase: implementation
title: Implementation Guide
description: Implementation notes and file inventory for scheduled agent sends (#482)
---

# Implementation Guide

## Development Setup
- Worktree: `/home/ubuntu/code/ai-devkit/.worktrees/feature-scheduled-sends` (branch `feature-scheduled-sends`).
- Build Rust workspace: `cargo test --workspace` / `cargo build -p devkitd`.
- Regenerate TS bindings from Rust `proto.rs`: `cargo test -p devkit-core export_ts_bindings`.
- Build TS packages: `npm run build`.

## Code Structure (Planned & Updated as Implemented)
- `rust/crates/devkit-core/src/store/schedules.rs` — SQLite schema, RFC3339 parser, `ScheduledSend` store ops.
- `rust/crates/devkit-core/src/store.rs` — wire `init_schedules` and re-exports.
- `rust/crates/devkit-core/src/proto.rs` — wire types + `ts-rs` exports.
- `rust/crates/devkitd/src/runtime/tmux.rs` — `pane_for_pid` and `send_to_pane`.
- `rust/crates/devkitd/src/runtime/herdr.rs` — `send_prompt`.
- `rust/crates/devkitd/src/scheduler.rs` — fire-time resolution, hybrid deliverer, unified tick/late engine.
- `rust/crates/devkitd/src/rpc/schedule.rs` — `schedule.create/list/cancel` handlers.
- `rust/crates/devkitd/src/server.rs` — `in_flight` guard, `schedule.*` dispatch, dedicated 2s scheduler task.
- `packages/daemon-client/src/{client.ts,index.ts,gen/*}` — generated types + `DaemonClient` schedule methods.
- `packages/cli/src/util/time.ts` — `parseDurationMs`, `parseFutureIsoTimestamp`.
- `packages/cli/src/services/agent/agent-schedule.service.ts` — daemon-only schedule service.
- `packages/cli/src/services/agent/agent.service.ts` — `assertSendTargetOptions` schedule validation.
- `packages/cli/src/commands/agent/{send,schedule,agent}.command.ts` — CLI commands.

## Implementation Notes
- All components match the design doc: `scheduled_sends` SQLite table with partial pending index and amortized retention pruning (`1000` rows / `30d`), zero-`chrono` RFC3339 parser, `ts-rs` generated bindings in `packages/daemon-client/src/gen/`, `schedule.create`/`list`/`cancel` RPC handlers with `in_flight_schedules` cancel guard, dedicated 2s `tokio::time::interval` scheduler loop spawned after socket bind, hybrid delivery engine (`herdr` → exact TTY-matched `tmux` bracketed paste → CLI fallback), and daemon-only CLI commands (`agent send --in/--at`, `agent schedule list/cancel`).
- Follow-up (non-blocking): `schedule.cancel` checks `in_flight_schedules` before acquiring the SQLite connection lock, leaving a narrow theoretical race window if a cancel arrives in the same microsecond a due schedule begins delivery; acceptable for v1 and can be tightened with a shared lock if needed.
