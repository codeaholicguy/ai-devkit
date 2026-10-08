---
phase: planning
title: Plan — Harness Port Foundation (I0)
description: Task breakdown for fixtures, devkit-harness, agent.enriched, client API
---

# Plan — Harness Port Foundation (I0)

## Milestones

- [x] M1: `devkit-core` wire types (`EnrichedAgent`, `EnrichedAgentsResult`)
  + generated TS bindings
- [x] M2: `devkit-harness` crate (trait, SweepContext, Registry, mock test)
- [x] M3: `devkitd` serves `agent.enriched` from sweep-cached enrichment
- [x] M4: daemon-client `enrichedAgents()` + gen types wired
- [x] M5: fixture tool (`capture`/`replay`) + claude live-capture bundle
  round-trips TS↔TS (live bundles gitignored — private transcripts)
- [x] M6: docs reconciled, full verification, commit

## Task Breakdown

### M1 — wire types

- [ ] T1.1: `devkit-core/src/agent.rs` — `EnrichedAgent`, `EnrichedAgentsResult`
  with serde camelCase (`type`, `projectPath`, `sessionId`, `lastActive`,
  `sessionFilePath` renames), `TS` derive, `#[ts(type="number")]` on pid.
- [ ] T1.2: `lib.rs` `pub mod agent;`; extend `export_ts_bindings` test to
  emit the new types; regen `gen/` files.

### M2 — devkit-harness crate

- [ ] T2.1: `rust/crates/devkit-harness/Cargo.toml` + `lib.rs` with
  `SweepContext`, `HarnessAdapter` trait, `Registry{enrich, ported_types}`.
- [ ] T2.2: `MockAdapter` unit test: registry reports ported types, enrich
  returns adapter output; workspace `members` already `crates/*` — verify.

### M3 — daemon RPC

- [ ] T3.1: `devkitd` Cargo.toml dep `devkit-harness`; `Daemon` holds
  `enricher` + `enriched: RwLock<EnrichedAgentsResult>`; refresh in
  `apply_sweep`.
- [ ] T3.2: `server.rs` method `agent.enriched`; integration test: RPC
  returns `{agents: [], ported: []}` in I0.

### M4 — client API

- [ ] T4.1: `gen/` new files exported via `gen/index.ts` + package index.
- [ ] T4.2: `client.ts` `enrichedAgents()` → typed result; unit test with
  fake socket.

### M5 — fixture tool

- [ ] T5.1: `packages/agent-manager/src/fixtures/types.ts` bundle schema +
  `capture.ts` (frozen Date, $FIXTURE_HOME path normalization, live mode).
- [ ] T5.2: `replay.ts` — materialize bundle to temp dir, run adapter, deep
  compare; vitest `fixtures.test.ts` covering claude bundle round-trip.
- [ ] T5.3: Capture ≥1 live claude bundle into `fixtures/harness/claude/`
  (sanitized); `.gitignore` check that fixtures are committed.

### M6 — reconcile + verify

- [ ] T6.1: Update planning/implementation/testing docs; verify fmt/clippy/
  test/nx green; commit.

## Dependencies

- M1 blocks M2–M4 (types). M5 independent of M2–M4.
- I1 (harness-claude) consumes M5 fixtures + M2 trait.
