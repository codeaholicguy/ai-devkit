---
phase: testing
title: harness-copilot test report
description: Coverage and results for the I5 copilot port
---

# I5: harness-copilot testing

## Fixture parity (the oracle)

Three committed bundles replay byte-identical TS↔Rust
(`vitest -t copilot` and `cargo test copilot_adapter_matches`):

- `matched.json` — events.jsonl lock match (sessionId/projectPath from
  `session.start`, waiting on assistant.message); second `inuse.<same
  pid>.lock` in an empty dir (null session, skipped); dead-pid lock
  ignored; copilot wrapper pair (parent suppressed, child process-only
  takes registry name `wrapped-copilot`); plain process-only;
  `node server.js` and `copilot-helper` argv0 dropped by the pool filter.
- `fallback.json` — events session with last event `user.message` →
  running; lock into a metadata-free dir → process-only; wrong-type
  (`pi`) registry row doesn't apply; child of a non-copilot parent still
  surfaces (wrappers are searched in the copilot pool only).
- `workspace.json` — workspace.yaml-only session (no events.jsonl):
  sessionId/cwd/name/updated_at from yaml scalars → idle status;
  `sessionFilePath` still points at the absent events.jsonl.

## Unit coverage (Rust)

- `lock_pid`: `inuse.<digits>.lock` accepted; empty/non-digit/suffixed
  names rejected.
- Parser: event fold (session.start override, summary = first user
  message, waiting→idle boundary), workspace-only session, empty dir →
  None, `extract_event_text` chain (content > message > text >
  result.content > result.detailedContent; non-string truthy → "").

## Results

- `cargo test --workspace`: 74 tests green; `clippy -D warnings` clean.
- `vitest` agent-manager: 1332 passed.
- Live daemon smoke: `ported: ["claude","codex","pi","gemini_cli","copilot"]`.
- No live copilot process at port time — live-bundle capture case is in
  place for a future machine with one running.
