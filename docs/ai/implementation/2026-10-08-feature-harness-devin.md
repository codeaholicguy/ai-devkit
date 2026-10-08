---
phase: implementation
title: harness-devin implementation notes
description: What the I8 devin port shipped and parity decisions made
---

# I8: harness-devin implementation

## Shipped

- `rust/crates/devkit-harness/src/devin/mod.rs` — `DevinAdapter`
  (type `devin`): `["devin"]` pool filter + argv0 match + utility
  subcommand gate (`first_positional_token` with required/optional
  flag-value skipping, `=` form never skips, `--` terminates) + pid
  dedupe; `session_locks` slug map (holder pid + holder ppid);
  acp-backend-child skip; slug→by-id (no cwd fallback on miss) else
  cwd→by-directory; process-only fallback.
- `rust/crates/devkit-harness/src/devin/locator.rs` — sessions.db
  resolution + readonly open; `.lock` listing with JS `parseInt`
  semantics; `find_session_by_id`/`find_session_for_directory`
  (`hidden = 0`; `created_at`/`last_activity_at` seconds → ms).
- `rust/crates/devkit-harness/src/devin/parser.rs` — `getSessionStats`
  port: frontier role, `MAX(created_at)*1000` heartbeat, two-tier
  `user_prompt` (prompt_history `is_shell=0` non-`/%` newest →
  `message_nodes` newest-8 user nodes filtered by
  `is_user_input !== false` + non-empty string content; truncate 120).
- `DevinAdapter::at_db(path)` — canonical path for fixture replay;
  `new(home)` env-aware for the daemon.
- `capture.ts` — `dumpSqliteDb` helper (DDL + caller-selected rows),
  opencode branch refactored onto it, devin branch added (sessions by
  proc cwds ∪ lock slugs; bounded reachable node/prompt rows per
  session); `.local/share/devin/cli/session_locks` index dir;
  `fixtures.rs` float `mtimes` parse.
- Daemon: `DevinAdapter` registered → `ported` += `devin`.

## Parity decisions

- `parse_int_prefix` mirrors `parseInt(trim,10)`: sign + digit prefix,
  `>0` required, NaN→skip; `"99999"` (dead pid) filtered by the live-
  proc check, `notapid` skipped.
- Lock iteration stays in readdir order (Map last-wins) — same
  underlying syscall order on both sides; no sorting.
- `session.directory || proc.cwd` fallback: empty-string directory
  falls to proc cwd; `title` empty string also falls through to the
  default summary (JS `||` falsy semantics).
- `is_acp_backend_child` checked before session resolution and needs
  no db — a `devin acp` under a live devin parent produces no agent row
  even when the db is absent.
- Seconds→ms uses `saturating_mul(1000)`; NULL `last_activity_at` → 0
  → `|| timeCreated` fallback (JS `null*1000===0`, `0||x` → x).
- Bounded live dump is exact-reachability: every row a detection query
  could return is present; extra rows can't change LIMIT-k results.
- Clippy `if_same_then_else`: required/optional flag branches merged —
  identical `i += 1` bodies.
