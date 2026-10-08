---
phase: planning
title: harness-antigravity plan
description: Task list for I10 — reconciled post-implementation
---

# I10: harness-antigravity plan

- [x] antigravity/locator.rs — `list_conversations` + cwd join
      (process-order, `proc.cwd || ""`)
- [x] antigravity/parser.rs — bounded `Summary` fold (MAX `created_at`,
      USER_REQUEST extract, role tracking), `status`, `read_session`
      (`!stat` not isFile, mtime fallback)
- [x] antigravity/mod.rs — pool filter, dedupe, session-or-process-only;
      `ANTIGRAVITY_CLI_HOME` env in `new(home)`, `at_base_dir` for replay
- [x] shared `matches_executable_name` — `.exe` normalization on
      candidate basenames (parity fix for all adapters)
- [x] Register `AntigravityCliAdapter`; ported += antigravity_cli;
      devkitd test updated
- [x] capture: explicit `HARNESS_INDEX_DIRS` (behavior-preserving);
      `.gemini/antigravity-cli` referenced-only; replay pins/clears
      `ANTIGRAVITY_CLI_HOME`; live capture case
- [x] Synthetic bundles:
      - `matched.json`: waiting (last PLANNER_RESPONSE), running
        (USER_INPUT last + MAX created_at on an earlier line), idle
        (mtime fallback); USER_REQUEST-wrapped vs unwrapped content;
        string vs `[{text}]` content; missing transcript → process-only;
        unregistered cwd; empty key/id and non-string id registry rows
        skipped; `agy.exe` in pool; `agy --verbose` canHandle; `notagy`
        invisible; untruncated summary
      - `fallback.json`: malformed registry JSON → all process-only;
        cwd-less proc → `unknown-*`
- [x] Verification: 63 harness tests, workspace tests, clippy -D
      warnings, agent-manager suite (1343), live daemon `ported` smoke
