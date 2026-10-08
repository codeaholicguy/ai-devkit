---
phase: design
title: harness-antigravity design
description: Module layout and parity notes for the antigravity port
---

# I10: harness-antigravity design

## Layout

- `antigravity/mod.rs` — `AntigravityCliAdapter` (type
  `antigravity_cli`): `agy` pool filter + `matches_executable` +
  first-wins dedupe; per-proc cwd join → session or process-only.
  `new(home)` honors `ANTIGRAVITY_CLI_HOME`; `at_base_dir` pins the
  canonical path for replay.
- `antigravity/locator.rs` — `list_conversations` (object-shape check,
  non-empty cwd + non-empty string id) + `match_running_processes`
  (process-order 1:1, `proc.cwd || ""` join key).
- `antigravity/parser.rs` — `Summary` fold state, `reduce`,
  `record_to_message`, `extract_user_request`, `status`, `read_session`.

## Parity notes

- **`matches_executable_name` `.exe` normalization (cross-adapter
  fix).** TS `normalizeExecutableName` lowercases and strips `.exe` on
  BOTH the pattern names and each candidate basename — `agy.exe`
  matches the `agy` pool. The Rust helper only normalized the name
  list, dropping `.exe` procs before canHandle. Now applied to the
  first token, later path-like tokens, and `executableBasename` —
  faithful for every adapter using the shared pool filter.
- `stat` check is `!stat`, not `isFile` — a directory at the transcript
  path still yields a session (empty summary, dir mtime); mirrored by
  using `fs::metadata` without an `is_file` gate.
- `created_at` MAX: `lastActiveMs` updates only on `atMs > prev` — a
  later timestamp on an earlier line still wins (fixture exercises
  this).
- `extractUserRequest` equivalence: regex `\s*([\s\S]*?)\s*` inside the
  first open/close pair + `.trim()` == substring between the first
  `>` of the open tag and the first `</USER_REQUEST>`, trimmed. No
  regex dep needed. An empty capture stays `""` (a user message with
  empty content — falsy in the summary `||` chain, faithfully).
- `summary` is NOT truncated in the TS mapper — unlike other adapters.
- `reduce` treats non-object JSON lines exactly like TS (`value as
  TranscriptRecord` — `.created_at`/`.content`/`type` all undefined →
  no-op); Rust `as_object()` early-return is equivalent.
- `skip()` drops `lastUserMessage`/`lastRole`/`lastActiveMs` but keeps
  `firstUserMessage` — bounded cold-start resets to tail-only "latest".
- The `mtimes` map covers the no-`created_at` transcript (mtime
  fallback → idle in the fixture).
- `HARNESS_INDEX_DIRS` — capture's implicit `endsWith` index heuristic
  is replaced by an explicit set; `.gemini/antigravity-cli` joins
  `HARNESS_DIRS` as referenced-only (31MB brain tree → only referenced
  transcripts + the small registry `.json`).

## Out of scope

`getConversation`/`listSessions`/`findSessionsById` (as documented in
requirements).
