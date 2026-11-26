---
phase: design
title: System Design & Architecture
description: Implementation architecture for scheduled agent sends (#482)
---

# System Design & Architecture

## Architecture Overview

```mermaid
flowchart LR
    CLI["CLI: agent send --in/--at & agent schedule list/cancel"] -->|JSON-RPC over Unix socket| RPC["devkitd rpc/schedule.rs"]
    RPC --> Store["devkit-core Store (daemon.db: scheduled_sends)"]
    Loop["devkitd Dedicated 2s Scheduler Task (server.rs)"] -->|tick_schedules(now_ms)| Store
    Loop -->|fire-time lookup| Lookup["Registry + enriched cache"]
    Lookup --> Deliver["ScheduleDeliverer"]
    Deliver -->|runtime=herdr| Herdr["HerdrRuntime::send_prompt"]
    Deliver -->|TTY matches tmux| Tmux["TmuxRuntime::pane_for_pid + send_to_pane"]
    Deliver -->|unmanaged terminal| Fallback["Subprocess: ai-devkit agent send --id <name> --stdin"]
```

### Key Components
1. **Storage (`rust/crates/devkit-core/src/store/schedules.rs`):** Owns `scheduled_sends` DDL, partial index, canonical RFC3339/ISO-8601 UTC parsing/normalization (no `chrono`), short `sch_<8-hex>` ID generation, CRUD, state transitions, and amortized terminal-row pruning (keep newest 1,000 terminal rows / 30 days).
2. **Wire Protocol (`rust/crates/devkit-core/src/proto.rs` + `packages/daemon-client`):** `ScheduledSend`, `ScheduleCreateParams`, `ScheduleListParams`, `ScheduleCancelParams` exported via `ts-rs`, plus `DaemonClient::{createSchedule, listSchedules, cancelSchedule}`.
3. **RPC Handlers (`rust/crates/devkitd/src/rpc/schedule.rs`):** Routes `schedule.create`, `schedule.list`, `schedule.cancel` from `server.rs`, enforcing the in-memory `in_flight` cancel guard so `cancel` cannot race an active delivery.
4. **Delivery Engine (`rust/crates/devkitd/src/scheduler.rs`, `runtime/tmux.rs`, `runtime/herdr.rs`):**
   - Fire-time resolution by exact `agent_name` against `store.lookup_name` (after `import_legacy_agents`), falling back to unique live match in `daemon.enriched`, rejecting tombstoned/dead/ambiguous/durable targets.
   - `HerdrRuntime::send_prompt(pane_id, message)` (`herdr agent prompt <paneId> <msg>`, 10s timeout).
   - `TmuxRuntime::pane_for_pid(pid)` (`ps -p <pid> -o tty=` + `tmux list-panes -a -F "#{pane_tty}|#{pane_id}"`) and `TmuxRuntime::send_to_pane(pane_id, message)` (`load-buffer` stdin + `paste-buffer -p -d` + `150ms` + `send-keys Enter`, 10s timeout per step, best-effort `delete-buffer` on error).
   - Narrow subprocess fallback (`ai-devkit agent send --id <name> --stdin`, 15s timeout) only for live agents outside `herdr`/`tmux`.
5. **Dedicated 2s Scheduler Task (`rust/crates/devkitd/src/server.rs`):** Spawned in `serve()` **after** `UnixListener::bind()` and `main.rs`'s initial `apply_sweep()`. Immediate first tick (`t=0`) runs startup reconciliation; subsequent 2s ticks run on `spawn_blocking` independently of `apply_sweep()`.
6. **CLI (`packages/cli`):**
   - `util/time.ts`: `parseDurationMs` (`s`/`m`/`h`/`d`, compound ok, `<=365d`) and `parseFutureIsoTimestamp` (strict TZ-required RFC3339, rollover check).
   - `services/agent/agent-schedule.service.ts`: Daemon-only service matching `agent-group.service.ts`.
   - `services/agent/agent.service.ts`: Extended `assertSendTargetOptions` (`--in` XOR `--at`, rejects `--group`/`--wait`/`--timeout`).
   - `commands/agent/send.command.ts`: Branches to scheduled create when `--in`/`--at` is present, rejects durable targets upfront, warns non-fatally if target is not currently live, computes `dueAt` after `ensureDaemon()`.
   - `commands/agent/schedule.command.ts`: `agent schedule list` and `agent schedule cancel <id>`.

## Data Models

```sql
CREATE TABLE IF NOT EXISTS scheduled_sends (
    id             TEXT PRIMARY KEY,
    agent_name     TEXT NOT NULL,
    message        TEXT NOT NULL,
    due_at         TEXT NOT NULL,
    status         TEXT NOT NULL CHECK(status IN ('pending','sent','late','cancelled','failed','skipped')),
    failure_reason TEXT,
    created_by     TEXT,
    created_at     TEXT NOT NULL,
    sent_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_pending_due
    ON scheduled_sends(due_at, id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due
    ON scheduled_sends(due_at DESC, id DESC);
```

### State Machine

- Initial state: `pending`
- Terminal states (immutable):
  - `pending -> sent`: delivered on time (`due_at >= daemon.started_at` and `age <= 60s`), `sent_at` set.
  - `pending -> late`: delivered overdue within 1h (`age <= 3_600_000` and (`due_at < daemon.started_at` or `age > 60s`)), `sent_at` set.
  - `pending -> skipped`: overdue beyond 1h (`age > 3_600_000`), `failure_reason` set, `sent_at` NULL.
  - `pending -> failed`: target missing/exited/ambiguous/durable or delivery error, `failure_reason` set, `sent_at` NULL.
  - `pending -> cancelled`: cancelled via `schedule.cancel` while not in-flight.

## API Design

| Method | Params | Result | Coded Errors |
| :--- | :--- | :--- | :--- |
| `schedule.create` | `{ agentName, message, dueAt, createdBy? }` | `ScheduledSend` | `invalid_params`, `storage` |
| `schedule.list` | `{ status?, agentName?, limit? }` (default 50, max 500) | `ScheduledSend[]` | `invalid_params`, `storage` |
| `schedule.cancel` | `{ id }` | `ScheduledSend` | `invalid_params`, `not_found`, `not_cancellable`, `storage` |

## Design Decisions

- **Dedicated 2s interval task vs piggyback in `apply_sweep()`:** Separate task prevents delivery I/O from stalling `agent.list`/`agent wait` events and keeps `agent.start`'s synchronous `apply_sweep()` side-effect-free. Wall-clock polling avoids monotonic-sleep drift across OS suspend.
- **`load-buffer` + `paste-buffer -p -d` vs `send-keys -l`:** Mirrors TS `tmuxBackend`, avoids `ARG_MAX` and key-name interpretation, preserves multiline prompts via bracketed paste.
- **64 KiB message cap:** Protects PTY buffers, DB size, and stays safely under Linux's 128 KiB `MAX_ARG_STRLEN` for `herdr agent prompt <paneId> <msg>`.
- **Independent from PR #481:** Uses crate-internal `TmuxRuntime::pane_for_pid(pid)` to avoid blocking on #481 or creating merge conflicts in `proto.rs`/`lookup.rs`/`registry.rs`.
- **In-memory `in_flight` guard:** Prevents `schedule.cancel` racing an active paste without introducing a 7th DB status.

## Non-Functional Requirements

- **Security:** `execFile`/argv-only subprocess calls (no shell); socket remains `0600` same-uid (`SO_PEERCRED`); `64 KiB` message cap; per-command timeouts (10s tmux/herdr, 15s CLI fallback).
- **Reliability:** WAL SQLite persistence across crashes/reboots; sequential same-tick execution ordered by `(due_at ASC, id ASC)`; amortized history pruning keeps DB bounded.
