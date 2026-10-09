---
phase: implementation
title: harness-gemini implementation notes
description: What the I4 gemini port shipped and where parity needed fixes
---

# I4: harness-gemini implementation

## Shipped

- `rust/crates/devkit-harness/src/gemini/mod.rs` — `GeminiAdapter`
  (type `gemini_cli`): node-pool + any-token executable detection,
  registry cache (wrappers excluded), greedy match via shared matcher,
  wrapper registry-name override, session dedupe (highest pid in place),
  process-only fallback.
- `rust/crates/devkit-harness/src/gemini/locator.rs` — sha256 candidate
  roots over cwd ancestors; legacy hash dirs (`/^[0-9a-f]{64}$/`) gated
  by `cwdByHash`, slug dirs by `.project_root` ∈ roots (absent marker →
  scan); mtime window `earliestStart − 3min − 2s`; `.json` shadowed by
  `.jsonl` skipped; 8KiB metadata head (log line 1 / doc head / regex
  prefix / full-file fallback).
- `rust/crates/devkit-harness/src/gemini/parser.rs` — `parse_session`
  with `.jsonl` log replay: insertion-ordered message map,
  `$set` merges (messages replace), `$rewindTo` truncate-from-id
  (unknown id → clear), sessionId+projectHash metadata merge; summary =
  last user text (displayContent > content, Part[] `text` join, 120
  truncate); status idle > waiting(gemini|assistant) > running.
- `shared.rs` — `is_same_terminal_process`/`find_wrapper_pid`/
  `wrapper_pids` (utils/process.ts port), `RegistryRow` +
  `registry_agent_rows` (started_at/name order; pid map last-wins).
- Daemon: `GeminiAdapter` registered → `ported` is
  `["claude","codex","pi","gemini_cli"]`; `apply_sweep` now sweeps
  `node`/`bun` runtime argv0s and gates visibility on
  `Registry::any_can_handle` (mirrors `isCandidateProcess`) — node-script
  harnesses become detectable without flooding agent.list/events with
  unclaimed node procs. Also fixes the latent gap where `node …/pi.js`
  procs never reached the pi adapter.
- TS capture: `gemini_cli: [".gemini/tmp"]` (index-style — keeps
  `.project_root` markers); `REGISTRY_AWARE` += `gemini_cli`;
  `adapterFor` returns `GeminiCliAdapter(registry)`.

## Parity fixes during implementation

- Node-pool prefilter: TS `findHarnessProcesses` applies
  `filterByProcessNames(processes, ["node"])` INSIDE detect — a bare
  `gemini` argv0 proc never reaches `canHandle`. Rust now applies
  `matches_executable_name(command, ["node"])` first.
- sha256 test constant corrected (verified against node crypto).
- `materialize_home` temp dirs collided across parallel parity tests
  (same `pid-ms-tag` when two adapters both materialize `matched.json`)
  → shared `agents.db` "table already exists". Added an atomic counter.
- Log replay's metadata-gate check restructured to avoid the
  borrow-of-metadata vs move conflict; `sessionId` non-string → None
  (empty string still fails buildSession's truthy check, same as TS).
- `fileSignature` caches intentionally omitted — they are
  signature-keyed and output-transparent; noted for a later perf pass.
