---
phase: design
title: harness-grok design
description: Module layout and parity notes for the grok port
---

# I6: harness-grok design

## Layout

- `grok/mod.rs` — `GrokAdapter`: `["grok"]` pool filter + `matches_executable`
  canHandle + pid dedupe; per-process match → session or process-only,
  output in process order.
- `grok/locator.rs` — `GrokSessionLocator`: `GROK_HOME`/`~/.grok` base,
  `read_active_sessions` pid→cwd map, `latest_session_dir` max-mtime pick
  over session dirs inside the encoded group dir.
- `grok/parser.rs` — `SummaryState` reducer for `fold_jsonl_bounded`,
  `to_message` (user_query extraction, assistant text, system skipped),
  `read_session` (stat-gated, mtime → lastActive), `determine_status`,
  `group_dir_for`.
- `shared.rs` — `flatten_text_blocks`, `encode_uri_component` (JS
  encodeURIComponent unreserved set, UTF-8 percent-encoding).

## Parity notes

- `lastActive` = chat_history.jsonl **mtime**, not a parsed timestamp —
  the bundle `mtimes` map makes it deterministic on replay; live capture
  records `statSync().mtimeMs` per file.
- `latestSessionDir` tie-break is readdir order — bundles use distinct
  mtimes for competing session dirs; single-dir groups don't depend on it.
- `<user_query>` extraction mirrors the lazy-regex semantics: first open
  tag to the first close tag, inner trimmed; unclosed → not a message
  (context injection); empty inner → a user message with "" content
  (still flips lastRole to "user").
- `firstUserMessage` is tracked in the fold but only feeds
  `toSessionSummary` (out of scope); the reducer keeps it because `skip`
  semantics gate it behind `pastHead` — needed if the middle is skipped.
- `encodeURIComponent` also escapes UTF-8 bytes — group dirs for non-ASCII
  cwds match TS byte-for-byte.
- `active_sessions.json` malformed/not-an-array → empty map (proc cwd
  fallback for every process).
- `GROK_HOME` empty string falls back to `~/.grok` (JS `||`).
