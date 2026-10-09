---
phase: planning
title: harness-gemini plan
description: Task list for I4 — reconciled post-implementation
---

# I4: harness-gemini plan

- [x] shared.rs: wrapper helpers (`is_same_terminal_process`,
      `find_wrapper_pid`, `wrapper_pids`) + `registry_agent_rows`
- [x] gemini/parser.rs: `.jsonl` replay (upsert/$set/$rewindTo), `.json`
      doc, summary/status
- [x] gemini/locator.rs: candidate roots + sha256, hash/slug/marker
      gating, mtime window, metadata head, json-shadow listing
- [x] gemini/mod.rs: node pool + canHandle + dedupe, registry cache,
      wrapper naming, process-only, deduplicate
- [x] daemon sweep: runtime binaries (node/bun) + missing names
      (agy/kiro/kiro-cli); apply_sweep visibility gate via
      `Registry::any_can_handle`
- [x] Register `GeminiAdapter`; ported += gemini_cli; server test updated
- [x] TS capture: `.gemini/tmp` index dir; gemini_cli REGISTRY_AWARE;
      live capture case
- [x] Synthetic bundles: matched.json (hash-dir match + registry cache +
      wrapper-name + process-only + non-gemini/argv0 drops + hash/marker
      negative gating); fallback.json (missing file, stale-type row,
      unparseable session, wrapper-named process-only)
- [x] Live bundle captured (1 real gemini agent, process-only)
- [x] Fix `materialize_home` temp-dir race (same-ms collision across
      parallel parity tests → shared agents.db)
- [x] Verification: workspace tests + clippy green, agent-manager suite
      green, live daemon smoke (ported list + node visibility gate)
