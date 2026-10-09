---
phase: planning
title: harness-kiro plan
description: Task list for I9 — reconciled post-implementation
---

# I9: harness-kiro plan

- [x] kiro/locator.rs — `discover_active_locks` (JSON `{pid}`, `to_pid`),
      `find_kiro_ancestor` ppid walk, `match_sole_process_on_tty`
- [x] kiro/parser.rs — bounded `KiroSummary` fold, `text_content`,
      `entry_timestamp_ms` (direct ISO or `meta.timestamp`), metadata
      (`session_id`/`cwd`/`title`/`updated_at`), `status`
- [x] kiro/mod.rs — `is_kiro_executable` (argv0 or node/bun script),
      pool filter → relevant, canHandle dedupe → processes, per-lock
      matches → agents, process-only fallback
- [x] `list_dir_names` shared helper (sorted, matching Node ≥20.1
      `readdirSync`); swapped in at every `safeReaddir` mirror site
      (kiro, devin, copilot, grok, gemini, pi, codex, claude)
- [x] Register `KiroAdapter`; ported += kiro; devkitd test updated
- [x] TS capture: `.kiro/sessions/cli` index dir; live capture case
- [x] Synthetic bundles:
      - `matched.json`: helper-held lock → outermost-kiro ppid walk;
        direct lock; broken chain → sole-kiro-on-tty fallback; ambiguous
        tty (2 kiros) → no match; orphan tty `??` → none; node-script
        `kiro-cli.js` canHandle; non-kiro node proc invisible; lock
        without transcript → process-only; malformed/invalid/string-pid
        locks skipped; multi-lock same proc → two agents; metadata
        sessionId override; meta `updated_at` precedence; mtime
        fallback; waiting/running/idle statuses; lastUserMessage/title/
        default summary chain
      - `fallback.json`: no sessions dir → all process-only; bun-script
        kiro; cwd-less proc → `unknown-*`
- [x] Verification: 62 harness tests, workspace tests, clippy -D
      warnings, agent-manager suite (1341), live daemon `ported` smoke
