---
phase: design
title: harness-kiro design
description: Module layout and parity notes for the kiro port
---

# I9: harness-kiro design

## Layout

- `kiro/mod.rs` — `KiroAdapter`: pool filter (`matches_executable_name`
  with the five process names) → `relevant`; canHandle + first-wins
  dedupe → `processes`; per-lock match → session read → agent, then
  process-only sweep. `is_kiro_executable` + `kiro_basename`
  (`.exe`/`.js` strip) live here.
- `kiro/locator.rs` — `discover_active_locks` (sorted names, JSON
  `{pid}`, `to_pid` safe-int/string-digit semantics), `find_kiro_ancestor`
  (ppid walk through `relevant`, outermost kiro wins),
  `match_sole_process_on_tty`.
- `kiro/parser.rs` — `KiroSummary` fold state, `reduce` (last kind +
  assistant-toolUse reset per line, timestamps, Prompt text),
  `read_metadata`, `status`.
- `KiroAdapter::new(home)` → `~/.kiro/sessions/cli`;
  `at_sessions_dir(dir)` pins the canonical path for fixture replay.

## Parity notes

- **readdir sorting (cross-adapter fix).** Node ≥20.1 `fs.readdirSync`
  returns entries sorted; raw Rust `read_dir` does not. Kiro's match
  order is lock order, so a shared `list_dir_names` (sorted) now backs
  every adapter site that mirrors `safeReaddir` (kiro, devin, copilot,
  grok, gemini, pi, codex, claude locators). Previously-ordered-by-luck
  sites get identical-or-better parity.
- `toPid`: JS safe-integer check admits integral floats (`5.0` → 5) —
  Rust uses `as_f64` + `fract()==0` + ≤2^53−1, not `as_i64`, so serde's
  float-number variant isn't dropped. Digit strings parse then bound.
- `kiroBasename` lowercases + strips `.exe`/`.js` — a `node /x/kiro-cli.js`
  script resolves through `executable_path` (space-joining prefixes,
  same argv0-slice caveat as devin: multi-space commands can mis-slice,
  matching JS's byte-slice quirk).
- `by_pid` is built from `relevant` (not `processes`): `kiro-cli-chat`
  and runtime helpers are walkable intermediates but never surface as
  agents (they're not in `processes`).
- `metadata.cwd || fallbackCwd` — empty-string cwd falls to the proc's
  cwd; `session_id`/`sessionId` first-non-empty-string; `updated_at`/`updatedAt`
  via `??` (null/absent falls to camelCase). `created_at` is parsed in
  TS only for `sessionStart`, which isn't in the wire output — skipped.
- `lastEventKind` is set by EVERY parsed object line (not just message
  kinds); `lastAssistantHasToolUse` resets each line — the fold keeps
  exactly the last line's values.
- Multiple locks for one proc are legal (one agent each); `matched_pids`
  only gates the process-only fallback.
- mtime fallback for `lastActive` is exercised via the `mtimes` bundle
  map (s3 transcript carries no parseable timestamps).

## Out-of-scope

`getConversation`/`listSessions`/`findSessionsById` (as documented in
requirements).
