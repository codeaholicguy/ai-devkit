---
phase: design
title: harness-pi design
description: Module layout and parity notes for the pi port
---

# I3: harness-pi design

## Layout

- `pi/mod.rs` — `PiAdapter`: `is_pi_executable` token scan, `SessionTracker`
  (sessions.json read + trusted-path check), detect pipeline
  (tracker → registry → locator → process-only) in TS output order.
- `pi/locator.rs` — `encode_project_dir`, filename timestamp parse,
  `PiSessionLocator::match_running` → per-project-dir session discovery,
  `SessionFile` head read, windowed candidacy, then
  `shared::match_processes_to_sessions` greedy pairing.
- `pi/parser.rs` — bounded fold over head(1MiB)/tail(4MiB):
  `PiSummary` reducer (session_id, project_path, first/last timestamps,
  last role, last user message), `read_session` returns `None` when
  entryCount==0 (empty/garbage files → process-only path), filename
  session-id fallback.
- `shared.rs` — no new helpers needed beyond I1/I2 set
  (`fold_jsonl_bounded`, `match_processes_to_sessions`,
  `registry_session_paths`, `parse_timestamp_ms`, `process_only_agent`,
  `normalize_path`, `basename`).

## Parity notes

- Tracker values are only honored when the (normalized, fixture-home
  expanded) path starts with the sessions root — mirrors TS
  `isTrusted`.
- Registry rows are rejected when `type !== 'pi'` (stale cross-type
  rows) or when the session file no longer exists.
- A session counts as "parseable" iff it produced ≥1 object entry —
  blank/non-object lines don't count (TS `readSession` semantics).
- Legacy matching caveat: filename timestamp only gates *candidacy*;
  final match still requires `|start − birthtime| ≤ 3min` — so
  deterministic replay needs `"startTime": "$NOW"` on the process,
  since materialized files get now-ish birthtimes.
- Role extraction tolerates both `role` field and `type`-field role
  markers (entryToMessage parity).
