---
phase: design
title: harness-opencode design
description: Module layout and parity notes for the opencode port
---

# I7: harness-opencode design

## Layout

- `opencode/mod.rs` — `OpenCodeAdapter`: `["opencode"]` pool filter +
  `matches_executable` canHandle + pid dedupe; one readonly `Connection`
  per detect; per-proc cwd → session row → stats → agent, else
  process-only.
- `opencode/locator.rs` — `resolve_db_path` (`XDG_DATA_HOME`/`~/.local/share`
  + `opencode/opencode.db`), `open_db` (missing → None),
  `find_session_for_directory` (newest session for directory).
- `opencode/parser.rs` — `get_session_stats`: last-message role,
  `MAX(time_updated)` heartbeat, last-assistant `time.completed`/
  `time.error` presence, first user text part. Whole fn behind
  `stats_inner -> Option` so any query error returns `SessionStats::default()`
  (TS's single try/catch → EMPTY_STATS).
- Fixture replay: `OpenCodeAdapter::at_db(path)` pins the canonical
  `~/.local/share/opencode/opencode.db` — `new(home)` stays env-aware for
  the daemon path; TS replay pins `XDG_DATA_HOME=<home>/.local/share`.

## Parity notes

- **`sqlite` bundle section**: the db is binary — can't live in the JSON
  `home` map. `sqlite: {relpath: [stmt…]}` executes DDL+INSERTs in order
  (`better-sqlite3 exec` TS / `rusqlite execute_batch` Rust); statements
  pass through `$FIXTURE_HOME`/`$TODAY` expansion like `home` contents.
- Live capture dumps `sqlite_master` DDL + `SELECT *` rows for sessions
  whose directory is a captured proc cwd, plus those sessions'
  message/part rows — `findSessionForDirectory` and `getSessionStats`
  then answer identically; rows for other directories are unreachable.
- `lastTimeUpdated` = `maxUpdated ?? last.timeUpdated ?? 0` — the
  aggregate row always exists but its value may be NULL (session with no
  messages → falls back to last message, then 0 → `lastActive` becomes
  `session.timeCreated`).
- `!= null` completion semantics: `json_extract` returns SQL NULL for a
  missing path; any present value (incl. 0/""/false) counts as completed.
  `lastAssistantErrored` is queried for parity but never read, exactly as
  in TS.
- First user text: JOIN `part.message_id = message.id`, `p.type='text'`,
  `p.text IS NOT NULL`, earliest `p.time_created`; `text.trim()`. A
  non-string text would throw in JS → EMPTY_STATS — mirrored by treating
  a non-Text column as an error.
- `determineStatus` asymmetry: assistant+completed → **waiting**,
  assistant+!completed → running, everything else → running.
- `processOnlyAgent` shared.ts latent crash fixed (`cwd ?? ""`) — a
  cwd-less proc previously threw `path.basename(undefined)`; Rust maps it
  to `unknown-<pid>`/`""` and now TS agrees (fixtures cover the case).
