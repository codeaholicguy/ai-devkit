---
phase: planning
title: Agent Pinning Implementation Plan
description: Ordered test-first tasks for SQLite-backed console pins
---

# Agent Pinning Implementation Plan

## Milestones

- [x] Milestone 1: SQLite migration and registry pin semantics are complete and regression-tested.
- [x] Milestone 2: Manager API propagates pin state and handles dead/readonly failures.
- [x] Milestone 3: Console ordering, routing, rendering, selection, and feedback are complete.
- [ ] Milestone 4: Full verification, lifecycle reconciliation, and release-ready review are complete.

## Task Breakdown

### Task 1: Database and registry foundation

- [x] Write failing migration/registry tests for default pin state, atomic toggles, timestamp updates, missing rows, refresh preservation, rename preservation, prune deletion, and readonly behavior.
- [x] Add `002_pins.sql`, ensure build packaging includes it, and map `pinned` between SQLite integers and `RegistryEntry` Booleans.
- [x] Add `AgentRegistry.togglePin(type, pid)` and explicit missing-row behavior.
- [x] Thread readonly configuration through registry/connection construction and provide a clear mutation failure without attempting startup writes.
- [x] Verify `pinned` is absent from the `ON CONFLICT DO UPDATE SET` list and registry merge/equality/write decisions.

Outcome: process-scoped pins persist safely in the existing row. Dependencies: approved design. Evidence: focused AgentRegistry/database tests, build artifact inspection, typecheck. Scenarios: migration, toggle, refresh, rename, prune, missing/dead, readonly.

### Task 2: Manager propagation and mutation API

- [x] Write failing manager tests for `AgentInfo.pinned`, persisted-state joins, name-to-identity toggle delegation, stale agents, and readonly errors.
- [x] Add optional `AgentInfo.pinned`, carry persisted state through list results, and preserve it through registry entry conversion without poll writes.
- [x] Add `AgentManager.togglePin(agentName)` with clear stale/dead and readonly error contracts.

Outcome: callers can read and mutate pins without direct registry access. Dependencies: Task 1. Evidence: focused AgentManager tests and typecheck. Scenarios: propagation, refresh preservation, missing/dead, readonly.

### Task 3: Pure console ordering and layout helpers

- [x] Write failing exhaustive tests for `partitionPinned`: zero, all, mixed, equal/unequal recency, immutable input, and unpinned stability.
- [x] Implement/export the pure partition function and boundary/marker helpers.
- [x] Test all four marker states, exact two-column width, mixed-only `OTHERS` boundary, and pinned-plus-remote coexistence.

Outcome: ordering and row presentation policy are deterministic and 100%-covered. Dependencies: Task 2 types. Evidence: focused console helper tests with 100% branch/function/line coverage. Scenarios: partition, divider, marker arithmetic, remote marker.

### Task 4: Console interaction and selection

- [x] Write failing routing tests for lowercase `p` in list focus and unchanged uppercase/detail/input behavior.
- [x] Add `toggle-pin` action handling using context manager plus refresh, including transient success/error messages.
- [x] Feed the partitioned list consistently into navigation/rendering and choose first pinned for initial fallback selection.
- [x] Add `p pin` to footer/help hints and verify counts/continuous scrolling remain unchanged.

Outcome: the complete list-focused UX works across refresh and races. Dependencies: Tasks 2–3. Evidence: focused routing, hook/component, and console integration tests. Scenarios: hotkey scope, startup selection, refresh, errors, indicators/hints.

### Task 5: Verification and documentation

- [x] Correct phase-7 recency propagation so pinned agents use registry `updated_at` as `lastActive` while unpinned agents retain adapter activity timestamps.
- [ ] Run formatting/diff checks, feature lint, affected lint/typecheck/build/test suites, coverage, then the full workspace suite.
- [ ] Confirm `dist/database/migrations/002_pins.sql` exists after build and inspect coverage for all new pure logic.
- [ ] Update implementation/testing docs with commands and evidence; mark all validated planning/testing checkboxes.
- [ ] Run phase-7 implementation alignment, phase-8 test review, and phase-9 holistic code review; fix blockers and rerun evidence.
- [ ] Commit and push each checkpoint, open PR `feat(agent): pin agents in console`, and verify remote CI is green.

Outcome: merged-ready PR with traceable evidence. Dependencies: Tasks 1–4. Evidence: command logs summarized in lifecycle docs and remote checks.

## Dependencies

Task order is 1 → 2 → 3 → 4 → 5. Phase 6 planning reconciliation runs after each implementation task. No external service or new package is required. Task tracing is unavailable because this checkout's CLI reports `unknown command 'task'`.

## Timeline & Estimates

- Registry foundation: medium, highest migration/data-integrity risk.
- Manager integration: small-to-medium.
- Console helpers and UX: medium, highest layout/selection regression risk.
- Full verification/review: medium, dependent on workspace suite duration and CI.

## Risks & Mitigation

- Poll refresh clears pins: prohibit `pinned` in conflict updates and add a dedicated regression test.
- Readonly startup fails before mutation: test connection construction/configuration and mutation separately.
- Partition order diverges between render/navigation: derive one list and use it everywhere.
- Divider changes row height: replace an existing divider rather than add a row.
- Pin changes are hidden by poll equality: include `pinned` in console `agentsEqual` while excluding it from registry write equality.
- Migration missing from published output: retain build copy step and assert artifact presence.

## Resources Needed

- Existing npm/Nx/Vitest/SWC/TypeScript toolchain and repository fixtures.
- No new dependencies, infrastructure, or external coordination.

## Progress Summary

Tasks 1–4 completed on 2026-08-16. Persistence/API verification passed 92 focused tests after phase 7 found and corrected missing `updated_at` recency propagation; console verification passed 72 focused tests, build, and 100% coverage for the new pure layout module. No scope changes or blockers remain. Next: finish phase-7 alignment and phase-8 full-suite/coverage verification.
