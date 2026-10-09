---
phase: testing
title: Testing — Harness Port Foundation (I0)
description: Scenarios for fixtures, devkit-harness, agent.enriched, client API
---

# Testing — Harness Port Foundation (I0)

## Unit Tests

### devkit-core

- [ ] `EnrichedAgent` serializes with TS-matching field names (camelCase,
  `type` key, ISO `lastActive`, `number` pid)
- [ ] optional fields (`pinned`, `sessionFilePath`) omitted when absent
- [ ] `export_ts_bindings` emits `EnrichedAgent.ts` + result type

### devkit-harness

- [ ] `Registry::ported_types` reflects registered adapters
- [ ] `enrich` aggregates `detect` output across adapters
- [ ] adapter not matching `can_handle` contributes nothing

### devkitd

- [ ] `agent.enriched` returns `{agents: [], ported: []}` with no adapters
- [ ] sweep refreshes cached result (registry + enriched both update)

### daemon-client

- [ ] `enrichedAgents()` returns typed `{agents, ported}` from fake socket
- [ ] generated `EnrichedAgent` type assignable from wire JSON

## Integration Tests

- [ ] socket round-trip: `agent.enriched` over real `devkitd` binary
- [ ] `agent.list` unchanged (raw rows still served)

## Fixture tool

- [ ] capture emits deterministic bundle (frozen Date → stable `lastActive`)
- [ ] `$FIXTURE_HOME` normalization: no absolute user paths in bundle
- [ ] replay: claude adapter output == `expected` for captured bundle
- [ ] replay detects drift (mutate `expected` → test fails)

## Regression

- [ ] `listAgents` path untouched: cli + agent-manager + console suites
  green unmodified
- [ ] `cargo fmt --check`, `clippy -D warnings`, `nx run-many -t lint,test,build`

## Test Data

- `fixtures/harness/claude/*.json` — live-captured, path-sanitized
- Mock processes/session files for deterministic unit cases
