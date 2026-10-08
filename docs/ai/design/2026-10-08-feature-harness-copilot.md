---
phase: design
title: harness-copilot design
description: Module layout and parity notes for the copilot port
---

# I5: harness-copilot design

## Layout

- `copilot/mod.rs` — `CopilotAdapter`: pool filter (`matches_executable_name`
  `["copilot"]`) + `can_handle` (`matches_executable`) + pid dedupe;
  locks → sessions → agents (lock order), wrapper registry-name override;
  `wrapper_pids` suppression; process-only fallback in process order.
- `copilot/locator.rs` — `CopilotSessionLocator`: `Mutex<HashMap>`
  known-locks cache (adapters are shared `&self` across sweeps),
  `discover_active_locks`, `scan_locks` mtime window, `lock_pid` for
  `inuse.<digits>.lock` (no regex dep).
- `copilot/parser.rs` — `EventState` + `reduce`/`skip` for
  `fold_jsonl_bounded`, `extract_event_text` (JS `||`-chain truthiness),
  `read_workspace_metadata` (naive yaml scalars), `read_session_dir`
  (`toSession`), `determine_status`.
- `shared.rs` — reuses `fold_jsonl_bounded` (IncrementalJsonlSummary
  cold-start parity), `registry_agent_rows`, `wrapper_pids`,
  `find_wrapper_pid`, `process_only_agent`, `is_idle`, `truncate`,
  `birthtime_ms`, `parse_timestamp_ms`, `iso_utc`.

## Parity notes

- Lock-produced agents are NOT deduplicated — one agent per parseable
  lock, even multiple per pid (mirrors TS).
- `entry_count` increments only for parseable JSON lines (incl.
  non-objects like `"str"`/`42`/`null`); unparseable lines don't count —
  the session gate is `entryCount==0 && !workspace metadata`.
- `session.start` entries set id/cwd/start and return early — no text
  extraction from them.
- `skip()` clears `last_active_ms`/`last_event_type`/`last_text`, keeps
  `first_user_message` (`pastHead` blocks tail refills).
- `extractEventText` picks the first JS-truthy of content/message/text/
  result.content/result.detailedContent — truthy non-strings yield ""
  (`typeof raw !== "string"`); `verbose` path unused (detect passes false).
- Lock-mtime window is a lower bound only — dirs materialized at replay
  always pass when proc starts are `$NOW` or undefined; static past starts
  make `minMtime` older than every materialized dir equally.
- `knownLocks` is per-adapter-instance daemon state; fixture replay always
  sees the empty-cache path (same output either way — a stale cache hit
  re-validates the file's existence first).
- `sessionStart` is computed by `toSession` but only feeds
  `toSessionSummary`/`listSessions` (out of scope) — not carried into the
  agent row.
