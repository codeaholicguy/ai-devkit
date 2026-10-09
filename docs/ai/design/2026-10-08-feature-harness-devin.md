---
phase: design
title: harness-devin design
description: Module layout and parity notes for the devin port
---

# I8: harness-devin design

## Layout

- `devin/mod.rs` — `DevinAdapter`: `["devin"]` pool filter +
  `matches_executable` + subcommand gate + pid dedupe; `sessionByPid`
  lock map (holder pid + holder ppid); per-proc acp-backend skip, then
  slug → by-id or cwd → by-directory session lookup; process-only rows
  when no db/session.
- `devin/locator.rs` — db-path resolution, readonly `open_db`,
  `list_active_locks` (`.lock` suffix, `parseInt` pid semantics),
  `find_session_by_id` / `find_session_for_directory` (both `hidden=0`),
  seconds→ms `toDevinSession` row mapping.
- `devin/parser.rs` — `get_session_stats` (frontier role, MAX heartbeat,
  `user_prompt` two-tier summary) behind `stats_inner -> Option` (TS
  single-try → EMPTY).
- Fixture replay: `DevinAdapter::at_db(path)` pins
  `~/.local/share/devin/cli/sessions.db`; locks dir derives as
  `<db>/../session_locks`.

## Parity notes

- `first_positional_token` slices `command.trim()[argv0.len()..]` —
  `executable_path` can return a multi-token space-joined prefix whose
  byte length may not align with the original spacing; `str::get`
  returns empty rather than panicking on a non-boundary (JS mis-slices
  harmlessly the same way).
- `parseInt` lock parsing: optional sign + digit prefix (`"123abc"`→123),
  NaN on non-digit start, `> 0` required; overflow → None (a 1e21 pid
  never matches a live process anyway).
- `sessionByPid` order = readdir order of `session_locks`, Map
  last-wins — Rust `read_dir` returns the same underlying order, no
  sorting either side.
- The lock-holder `canHandle` recheck is redundant (processByPid only
  holds canHandle'd procs) — kept for parity.
- `userPrompt` tiers are independent try/catches: a malformed
  prompt_history row or non-string content falls through to the node
  scan, NOT to EMPTY_STATS; only frontier/heartbeat query failures
  yield EMPTY.
- `hidden = 0` filters at query level — hidden rows are dumped in live
  capture but never selected.
- Live dump bounds `message_nodes`/`prompt_history` to the rows
  getSessionStats can return (frontier-1 + max-created-1 + user-8 +
  prompt-1 per session). `created_at = MAX(created_at)` unbounded
  exploded when batch-written nodes shared a timestamp — replaced by
  `ORDER BY created_at DESC LIMIT 1` (same max value).
- Live `mtimes` parse: `fs.statSync().mtimeMs` is float — Rust fixture
  materialize reads `as_f64` (was `as_i64().unwrap()` panic).
