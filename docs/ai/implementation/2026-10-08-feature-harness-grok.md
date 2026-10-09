---
phase: implementation
title: harness-grok implementation notes
description: What the I6 grok port shipped and parity decisions made
---

# I6: harness-grok implementation

## Shipped

- `rust/crates/devkit-harness/src/grok/mod.rs` — `GrokAdapter`
  (type `grok_cli`): pool filter + argv0 `matches_executable` + pid dedupe;
  `match_running` per-process session/process-only rows in process order.
- `rust/crates/devkit-harness/src/grok/locator.rs` — `active_sessions.json`
  pid→cwd (numeric pid + non-empty string cwd only); `latest_session_dir`
  max-mtime pick among session dirs inside
  `sessions/<encodeURIComponent(cwd)>/`; `GROK_HOME` env base override.
- `rust/crates/devkit-harness/src/grok/parser.rs` — bounded
  `chat_history.jsonl` fold: `<user_query>` prompt extraction (context
  injections skipped), flattenTextBlocks content, first/last prompt +
  lastRole tracking, `skip` keeps head's first prompt; `lastActive` from
  file mtime; idle > waiting(assistant) > running.
- `shared.rs` — `flatten_text_blocks`, `encode_uri_component`.
- Daemon: `GrokAdapter` registered → `ported` =
  `["claude","codex","pi","gemini_cli","copilot","grok_cli"]`.
- Bundle format: `mtimes` — `{relpath: epochMs | "$NOW"}` applied after
  file writes (`fs.utimesSync` TS / `File::set_modified` Rust); live
  capture now records `statSync().mtimeMs` for every captured file so
  mtime-driven behavior replays.

## Parity decisions

- `mtimes` added to the bundle schema rather than normalizing
  mtime-derived `lastActive` — file mtimes can't be inferred from
  content, and `$NOW` normalization would be off by the write/read delta.
- `active_sessions.json` is a HARNESS_FILE (not index dir): only pid/cwd
  pairs matter and it stays small.
- `.grok/sessions` captured referenced-style (not index): a non-captured
  sibling dir can't outrank the captured max-mtime pick, so replay keeps
  the same winner.
- `sessionStart` (dir birthtime) is computed in TS `toSession` but only
  feeds `toSessionSummary` — not carried into the agent row.
- `flatten_text_blocks` joins every block's `text` — TS does not filter
  blocks by `type` ("text"), only by object-ness and string `text`.
