---
phase: planning
title: harness-devin plan
description: Task list for I8 — reconciled post-implementation
---

# I8: harness-devin plan

- [x] devin/locator.rs — db path, `list_active_locks` (parseInt pid),
      find_by_id / find_for_directory (`hidden=0`, seconds→ms)
- [x] devin/parser.rs — frontier role, MAX(created_at) heartbeat,
      two-tier `user_prompt` summary (prompt_history → node scan)
- [x] devin/mod.rs — utility-subcommand gate (`firstPositionalToken`
      flag skipping), lock→slug pid/ppid map, acp-backend skip, per-proc
      resolution, mapper
- [x] Register `DevinAdapter`; ported += devin; devkitd test updated
- [x] TS capture: `.local/share/devin/cli/session_locks` index dir;
      `collectSqliteDumps` devin branch (sessions by cwd ∪ lock slugs;
      bounded reachable message_nodes/prompt_history); `dumpSqliteDb`
      refactor with caller-owned clauses; live capture case
- [x] fixtures.rs — float `mtimeMs` parse (`as_f64`)
- [x] Synthetic bundles:
      - `matched.json`: lock→TUI via backend ppid; `devin acp` child
        skipped; standalone `devin acp` (ppid outside snapshot) kept;
        stale/dead-pid and malformed locks ignored; cwd fallback;
        hidden session excluded; slug wins over cwd (projectPath from
        session.directory); newest-for-dir pick; prompt_history summary
        (shell + slash filtered) vs message_nodes fallback vs title
        fallback; utility subcommands (`list`, `ssh`,
        `--config x list`) dropped; `-p`/`--print` flag-value skipping
      - `fallback.json`: locks present + no db → all process-only;
        acp child still skipped; cwd-less proc → unknown
- [x] Live capture: `live.json` (2 real agents; 47 SQL stmts bounded)
- [x] Verification: Rust harness tests, workspace tests, clippy -D
      warnings, agent-manager suite, live daemon `ported` smoke
