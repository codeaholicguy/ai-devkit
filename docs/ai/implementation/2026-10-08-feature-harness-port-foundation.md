---
phase: implementation
title: Implementation — Harness Port Foundation (I0)
description: What was built, where, and deviations from design
---

# Implementation — Harness Port Foundation (I0)

## What landed

### Rust

- `rust/crates/devkit-core/src/agent.rs` — `EnrichedAgent` (mirrors
  `AgentInfo` field-for-field via serde camelCase + `type` rename, ISO
  `lastActive`, `number` pid) and `EnrichedAgentsResult {agents, ported}`,
  both `TS`-derived. Wire-shape unit tests assert the exact JSON keys.
- `proto.rs::export_ts_bindings` now also emits `EnrichedAgent.ts` +
  `EnrichedAgentsResult.ts` into `packages/daemon-client/src/gen/`.
- `rust/crates/devkit-harness/` — new crate: `SweepContext`, `HarnessAdapter`
  trait (`type_id`/`can_handle`/`detect`), `Registry` (`ported_types`,
  `enrich`). MockAdapter tests cover ported list + aggregation.
- `devkitd` — `Daemon.enricher: devkit_harness::Registry` +
  `enriched: RwLock<EnrichedAgentsResult>` refreshed inside `apply_sweep`;
  `agent.enriched` RPC serves the cache (O(1) per call). Server test proves
  the cache path.

### TypeScript

- `daemon-client`: `client.enrichedAgents()` + `EnrichedAgent(sResult)`
  re-exports; integration test round-trips against a real spawned `devkitd`.
- `agent-manager/src/fixtures/bundle.ts` — bundle schema + `sanitize`
  (dot-dir-scoped home rewriting), `expand`, `normalizeAgents`,
  `withFrozenClock`.
- `agent-manager/src/fixtures/capture.ts` — live capture: frozen clock,
  `captureProcessSnapshot` + `detectAgents`, records referenced session
  files + pid/index dirs into `fixtures/harness/<type>/<case>.json`.
- `agent-manager/src/__tests__/fixtures.test.ts` — replay every committed
  bundle in a materialized fake HOME and require byte-identical
  `normalizeAgents` output; `AI_DEVKIT_FIXTURE_CAPTURE=1` gates live
  capture.

## Deviations from design

1. **Live bundles are gitignored, not committed.** Real transcripts contain
   private conversation content; committing them was never acceptable once
   seen. `fixtures/harness/**/live*.json` is ignored — live capture stays a
   local dev oracle; synthetic committed fixtures land per-iteration in I1+
   (where the format work happens anyway). Requirements doc updated.
2. **Sanitization narrowed to dot-dir prefixes.** Blanket `$HOME` rewriting
   broke claude's cwd→encoded-projects-dir matching (project paths share
   the home prefix but aren't inside it). `sanitize` now rewrites only
   `<home>/.<dir>` occurrences.
3. **No AgentManager merge wiring in I0** — deferred per design; the ported/
   local merge lands in I1 with the first real adapter.

## Metrics (for I12 report)

- I0 Rust: ~200 LOC net new (agent.rs 96, harness lib.rs ~120).
- Fixture bundles: 1 live claude (4 agents, 12 files, local-only).

## Verification

- `cargo test --workspace`: 20 tests green (15 core + 2 harness + 3 devkitd).
- `clippy -D warnings`, `fmt --check`: clean.
- `nx run @ai-devkit/daemon-client:test`: 11 green incl. real-socket
  `enrichedAgents`.
- `nx run agent-manager:test`: 1312 green incl. fixture replay.
- `tsc --noEmit`, `oxlint`: clean on touched package.
