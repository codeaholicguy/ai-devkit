---
phase: design
title: harness-codex design
description: Module layout and parity notes for the codex port
---

# I2: harness-codex design

## Layout

- `codex/mod.rs` — `CodexAdapter`: canHandle filter, detect pipeline
  (mapping → registry-cache → locator → process-only); registry cache reads
  `agents.db` readonly via `shared::registry_session_paths`; unmatched
  negative cache stays in-memory on the reused locator
- `codex/locator.rs` — resume/uuidv7/date-dir discovery + session_meta head
  parse + legacy match via `shared::match_processes_to_sessions`
- `codex/parser.rs` — bounded JSONL fold (`shared::fold_jsonl_bounded`),
  `CodexSummary` state → session + status
- `shared.rs` additions: `birthtime_ms`, `local_day_key` (libc localtime_r),
  `is_idle`, `truncate`, `parse_timestamp_ms`, `fold_jsonl_bounded`,
  `read_file_head`

## Parity notes

- Date dirs use **local** civil time (`YYYY/MM/DD`) — libc `localtime_r`.
- `session_meta` files >64KiB head fall back to regex extraction of
  id/cwd/timestamp from the payload prefix.
- Birthtime comes from `Metadata::created()`; `$NOW` fixtures make it
  deterministic on replay.
- Process without startTime defaults `new Date()` (frozen `ctx.now`) for
  day-key derivation.
- Fixture bundles gained a `registry` field (agents.db rows, seeded on both
  replay sides) and `$TODAY` normalization applies only to pids whose
  startTime is `$NOW` — static-start live bundles keep concrete dates.
- Live capture snapshots the registry *before* `detectAgents` and now
  includes `.codex/ai-devkit/` (sessions.json mapping) in the home dump —
  both were ordering leaks discovered via the live bundle.
