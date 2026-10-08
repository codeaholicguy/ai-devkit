---
phase: implementation
title: harness-opencode implementation notes
description: What the I7 opencode port shipped and parity decisions made
---

# I7: harness-opencode implementation

## Shipped

- `rust/crates/devkit-harness/src/opencode/mod.rs` — `OpenCodeAdapter`
  (type `opencode`): `["opencode"]` pool filter + argv0
  `matches_executable` + first-wins pid dedupe; one readonly rusqlite
  `Connection` per detect; each proc's cwd → newest `session` row →
  stats → mapped agent, else `"OpenCode process running"` process-only.
- `rust/crates/devkit-harness/src/opencode/locator.rs` — db-path
  resolution (`XDG_DATA_HOME`/`~/.local/share` + `opencode/opencode.db`,
  empty env falls back), readonly open, directory→session query.
- `rust/crates/devkit-harness/src/opencode/parser.rs` — `getSessionStats`
  port: last message role by `time_created DESC`, `MAX(time_updated)`
  heartbeat (NULL → last message's own → 0), last-assistant
  `time.completed`/`time.error` presence via `ValueRef::Null` checks,
  first user `part` text (JOIN message, `type='text'`, trimmed).
- Bundle format: `sqlite` — `{relpath: [sql stmt…]}` executed in order to
  materialize binary stores (`db.exec` TS / `execute_batch` Rust), with
  `$FIXTURE_HOME`/`$TODAY` expansion on statements.
- `capture.ts` `collectSqliteDumps` — for opencode: real `sqlite_master`
  DDL + `SELECT *` rows for sessions at captured proc cwds and their
  message/part rows, serialized as `INSERT … VALUES` with proper literal
  quoting (strings `''`-escaped, numbers, NULL, blob `X'hex'`).
- `OpenCodeAdapter::at_db(path)` — fixture replay pins
  `~/.local/share/opencode/opencode.db`; `new(home)` keeps env-aware
  resolution for the daemon.
- Daemon: `OpenCodeAdapter` registered → `ported` =
  `["claude","codex","pi","gemini_cli","copilot","grok_cli","opencode"]`.

## Parity decisions

- `stats_inner() -> Option<SessionStats>` with `unwrap_or_default`
  reproduces the TS single-try/catch: any query error → EMPTY_STATS. A
  non-TEXT first user `part.text` is treated as an error (JS `.trim()`
  would throw → EMPTY_STATS).
- `lastTimeUpdated` uses `Option<Option<i64>>` flattening to mirror
  `heartbeat?.maxUpdated ?? last?.timeUpdated ?? 0` — the aggregate row
  always exists, its value may be NULL.
- `XDG_DATA_HOME` is pinned on both replay sides (`process.env` in the
  vitest file, `at_db` in Rust) so an ambient XDG dir can't resolve the
  real opencode.db during tests; capture always records under the
  canonical relpath.
- Shared fix in `processOnlyAgent` (`cwd = processInfo.cwd ?? ""`):
  TS crashed `path.basename(undefined)` for any cwd-less process —
  previously unreachable (all callers passed explicit cwds or enrichment
  guaranteed them). Rust already yielded `unknown-<pid>`/`""`; the fix
  makes TS identical and keeps the fixture expressible.
- `sessionFilePath` = `<dbPath>::<sessionId>` — always present for a
  session-matched agent; the `$FIXTURE_HOME` prefix sanitizes the dot-dir
  segment like other harness paths.
