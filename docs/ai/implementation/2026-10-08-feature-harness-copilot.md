---
phase: implementation
title: harness-copilot implementation notes
description: What the I5 copilot port shipped and parity decisions made
---

# I5: harness-copilot implementation

## Shipped

- `rust/crates/devkit-harness/src/copilot/mod.rs` — `CopilotAdapter`
  (type `copilot`): `["copilot"]` pool filter + argv0 `matches_executable`
  canHandle + pid dedupe; per-lock agent mapping (no dedupe); wrapper
  registry-name override; `wrapper_pids` suppression; process-only.
- `rust/crates/devkit-harness/src/copilot/locator.rs` — lock discovery
  with the `knownLocks` (pid,startTime) cache behind `Mutex` so the
  `Send + Sync` adapter can keep it across sweeps; dir-mtime lower-bound
  scan; unambiguous-lock memorization.
- `rust/crates/devkit-harness/src/copilot/parser.rs` — `EventState`
  reducer for `fold_jsonl_bounded`: entryCount on parseable-only,
  timestamp/type tracking, `session.start` overrides, user/assistant
  text; `skip()` semantics; naive `workspace.yaml` scalar reader with
  quote stripping; `toSession` fallback chain (events > workspace >
  file stat > now); `determine_status`.
- Daemon: `CopilotAdapter` registered → `ported` =
  `["claude","codex","pi","gemini_cli","copilot"]`.
- TS capture: `copilot: [".copilot/session-state"]` (index-style — lock
  files are the attribution index and must all materialize);
  `REGISTRY_AWARE` += `copilot`; `adapterFor` constructs
  `CopilotAdapter(registry)`; live capture case added.

## Parity decisions

- `knownLocks` ported as state (Mutex) rather than dropped: a hit is
  re-validated by stat so output matches a rescan unless a pid's lock
  moved session dirs between sweeps — mirroring TS exactly removes the
  question.
- Lock files have no content contract — discovery is filename+dir-mtime
  only; bundles store empty lock files.
- `dir_with` test helper uses an atomic counter (same pattern as
  `materialize_home`) — two parser tests otherwise collide on
  `files.len()`-named temp dirs.
- Fixture processes use `startTime: "$NOW"` so the lock-dir mtime window
  (`earliest start − 5min`) includes materialized dirs deterministically;
  omitted start would also force a full scan but leaves the window path
  unexercised.
- `sessionId`/`projectPath` accept strings only — a truthy non-string
  `data.sessionId` would emit a non-string wire value in TS; out of
  scope for the wire schema (`session_id: String`).
