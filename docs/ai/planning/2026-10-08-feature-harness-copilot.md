---
phase: planning
title: harness-copilot plan
description: Task list for I5 — reconciled post-implementation
---

# I5: harness-copilot plan

- [x] copilot/parser.rs — EventState reducer, workspace.yaml scalars,
      read_session_dir (bounded fold + toSession), determine_status
- [x] copilot/locator.rs — known-lock cache (Mutex), discover_active_locks,
      scan_locks mtime window, inuse.<pid>.lock pattern
- [x] copilot/mod.rs — adapter orchestration + wrapper registry naming
- [x] Register `CopilotAdapter`; ported += copilot; devkitd test updated
- [x] TS capture: `.copilot/session-state` index dir (lock files must all
      materialize); REGISTRY_AWARE += copilot; live capture case
- [x] Synthetic bundles:
      - `matched.json`: events.jsonl lock match (waiting), duplicate-pid
        lock in empty dir (null session), dead-pid lock, wrapper pair +
        registry name, process-only, node/copilot-helper pool drops
      - `fallback.json`: events session (running, user.message last),
        lock into empty dir → process-only, wrong-type registry row,
        non-copilot parent → child still surfaces
      - `workspace.json`: workspace.yaml-only session → idle
- [x] Fixture determinism: `$NOW` proc starts keep lock-dir mtime window
      inside materialization; one productive lock per bundle (readdir
      order can't skew expected)
- [x] Verification: Rust harness tests, workspace tests, clippy -D warnings,
      agent-manager suite, live daemon `ported` smoke
