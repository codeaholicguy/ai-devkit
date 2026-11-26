---
phase: requirements
title: Requirements & Problem Understanding
description: Scheduled agent sends (#482) — persistent one-shot delayed message delivery via devkitd
---

# Requirements & Problem Understanding

## Problem Statement

Waking or messaging an agent at a future time currently requires external machinery (host `crontab` shelling `ai-devkit agent send`, or ad-hoc `tmux` sleep scripts). Those workarounds are machine-local, invisible to `ai-devkit`, unlistable/uncancellable, and break when `cron` is unavailable or `devkitd` restarts.

`devkitd` is the natural owner: it runs persistently, owns `daemon.db`, owns live agent discovery and registration lookup, and can resolve exact terminal panes for running agents.

## Goals & Objectives

### Primary Goals
- Persist one-shot scheduled sends in `daemon.db` (`scheduled_sends`) owned exclusively by `devkitd`.
- Deliver due messages server-side to the target agent's exact terminal pane (exact tmux pane via TTY matching, `herdr` pane via `herdr agent prompt`, and narrow subprocess fallback for unmanaged desktop terminals).
- Resolve target `agent_name` at fire time (never pinning PIDs at schedule time), failing honestly when renamed, exited, ambiguous, or durable.
- Apply an explicit late/skip policy when `devkitd` was down or the host slept past `due_at`: deliver as `late` if age ≤ 1 hour, else mark `skipped`.
- Expose daemon RPC methods (`schedule.create`, `schedule.list`, `schedule.cancel`) with generated TypeScript wire types in `@ai-devkit/daemon-client`.
- Expose CLI UX:
  - `ai-devkit agent send --id <agent> (--in <duration> | --at <iso-8601>) [message] [--stdin] [--json]`
  - `ai-devkit agent schedule list [--status <status>] [--agent <name>] [--limit <n>] [--json]`
  - `ai-devkit agent schedule cancel <id> [--json]`

### Non-Goals (Out of Scope for v1)
- Recurring schedules, `--every`, or cron expressions.
- Telegram/Slack relay of scheduled messages (direct pane delivery only).
- Scheduled sends to `--group` or durable (print-mode) agents.
- Real-time delivery SLA tighter than the 2s scheduler tick or guarantees beyond the 1h late policy.
- Speculative `schedule.*` daemon events (no v1 subscriber).

## User Stories & Use Cases

- **Self-wakeup orchestration:** As an orchestrator agent, I want to run `ai-devkit agent send --id <self> --in 15m "checkin orchestration"` and end my turn so `devkitd` wakes me reliably even across daemon restarts or machine reboots (with `devkitd install`).
- **Absolute scheduling:** As a user or agent, I want to schedule a message for an exact UTC/offset ISO-8601 timestamp with `--at 2026-11-25T21:00:00Z`.
- **Visibility and cancellation:** As a user or agent, I want to inspect pending and historical schedules via `ai-devkit agent schedule list [--json]` and cancel pending ones via `ai-devkit agent schedule cancel <id>`.
- **Multi-pane tmux accuracy:** As a user running multiple agents in panes of one tmux session, I want scheduled sends delivered to the exact pane hosting the target agent, not the active pane.

## Success Criteria

- Scheduling with `--in` or `--at` persists a `pending` row in `daemon.db` and returns its `id` and canonical UTC `dueAt`.
- Due sends deliver to the exact tmux pane (`%pane_id` matched by TTY) using bracketed paste (`load-buffer` + `paste-buffer -p -d` + `150ms` + `send-keys Enter`), or to `herdr` via `herdr agent prompt`, or via subprocess fallback for unmanaged non-tmux/non-herdr terminals.
- `agent schedule list [--json]` reflects `pending | sent | late | cancelled | failed | skipped`; `agent schedule cancel <id>` cancels `pending` rows and rejects unknown or terminal rows with clear errors.
- Daemon restart (or host sleep/wake) past `due_at` delivers as `late` if age ≤ 1h and marks `skipped` if age > 1h.
- Target renamed or exited at fire time transitions to `failed` with an explicit `failure_reason`.
- CLI validates `--in` XOR `--at`, rejects incompatible `--group`/`--wait`/`--timeout`, rejects durable agents upfront, and warns non-fatally if no live interactive agent currently matches `--id`.
- Unit tests cover store/state machine, delivery engine, RPC handlers, scheduler ticks, duration/ISO parsing, and CLI flag validation; stub-provider integration/E2E tests verify full flow without real provider APIs.

## Constraints & Assumptions

- Build independently on `main` without depending on unmerged PR #481 (`feature-channel-resolution`); implement a small internal `TmuxRuntime::pane_for_pid(pid)` that can later unify with #481's `terminal_target()`.
- Keep `devkit-core` free of `chrono` (use existing `iso8601_utc` + `days_from_civil`).
- Tests follow `AGENTS.md`: package tests in `packages/<pkg>/tests/` and Rust crate tests in `rust/crates/<crate>/tests/` or `#[cfg(test)]`.
- Scheduled sends require a running `devkitd` (no local fallback, matching `agent group`).

## Resolved Rulings

All open design questions were resolved before implementation (A/A/A):
1. **PR #481 sequencing:** Independent on `main` via internal `TmuxRuntime::pane_for_pid(pid)`.
2. **Create-time target check:** Allow any non-empty `agent_name` with a non-fatal CLI warning if not currently live; fail fast upfront if `--id` resolves to a durable agent.
3. **Unmanaged terminal fallback:** Include narrow subprocess fallback (`ai-devkit agent send --id <name> --stdin`, 15s timeout) when a live agent is outside `tmux`/`herdr`.
