---
phase: planning
title: harness-grok plan
description: Task list for I6 — reconciled post-implementation
---

# I6: harness-grok plan

- [x] shared.rs — `flatten_text_blocks`, `encode_uri_component`
- [x] grok/parser.rs — SummaryState reducer, `<user_query>` extraction,
      read_session (mtime → lastActive), determine_status
- [x] grok/locator.rs — active_sessions.json map, encodeURIComponent group
      dir, max-mtime session pick
- [x] grok/mod.rs — adapter orchestration, process-only with resolved cwd
- [x] Bundle format — `mtimes` field; TS materialize applies utimesSync;
      Rust materialize applies File::set_modified; live capture records
      real mtimes for every captured file
- [x] Register `GrokAdapter`; ported += grok_cli; devkitd test updated
- [x] TS capture: `.grok/sessions` referenced-dir +
      `.grok/active_sessions.json` file; live capture case
- [x] Synthetic bundles:
      - `matched.json`: active_sessions cwd override beats proc.cwd,
        two session dirs → max-mtime pick, user_query extraction with
        context-injection record skipped, array-content flatten, running
        (lastRole user) + waiting (assistant) statuses, process-only,
        node/grok-helper pool drops
      - `fallback.json`: group dir w/o transcript → process-only, no-cwd
        proc → "unknown-<pid>" process-only, empty transcript → session
        with "Grok CLI session active" summary, old mtime → idle
- [x] Verification: Rust harness tests, workspace tests, clippy -D warnings,
      agent-manager suite, live daemon `ported` smoke
