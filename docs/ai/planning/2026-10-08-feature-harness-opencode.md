---
phase: planning
title: harness-opencode plan
description: Task list for I7 — reconciled post-implementation
---

# I7: harness-opencode plan

- [x] opencode/locator.rs — `resolve_db_path` (+env-free `…_with`),
      `open_db` readonly, `find_session_for_directory`
- [x] opencode/parser.rs — `get_session_stats` (last role, MAX
      heartbeat, completed/error presence, first user text; single-error
      → EMPTY semantics)
- [x] opencode/mod.rs — adapter orchestration, per-proc
      session/process-only rows in pool order, `at_db` for pinned replay
- [x] Bundle format — `sqlite` field; TS materialize runs statements via
      better-sqlite3; Rust materialize via rusqlite; live capture dumps
      DDL + reachable session/message/part rows
- [x] XDG pinning — TS replay sets `XDG_DATA_HOME=<home>/.local/share`;
      Rust replay uses `at_db` so ambient env can't leak the real db
- [x] Register `OpenCodeAdapter`; ported += opencode; devkitd test updated
- [x] TS capture: `collectSqliteDumps` (session/message/part by proc
      cwds); live capture case in fixtures.test.ts
- [x] Synthetic bundles:
      - `matched.json`: session match per status — running (assistant,
        no completed), waiting (assistant, completed), idle (old
        heartbeat), session-with-no-messages (lastActive=time_created,
        lastRole null → running, default summary); newest-session-for-dir
        pick (stale older session ignored); first-user-text summary +
        trim; missing-dir session → process-only; cwd-less proc →
        unknown process-only
      - `fallback.json`: no db at all → all procs process-only;
        foreign `node` argv0 dropped
- [x] shared.ts fix — `processOnlyAgent` `cwd ?? ""` (latent
      `path.basename(undefined)` crash on cwd-less procs)
- [x] Verification: Rust harness tests, workspace tests, clippy -D
      warnings, agent-manager suite, live daemon `ported` smoke
