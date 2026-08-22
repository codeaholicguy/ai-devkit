---
phase: planning
title: Skill Registry Removal Plan
description: TDD implementation and validation tasks
---

# Skill Registry Removal Plan

## Milestones

- [x] Planner and persistence behavior implemented with tests.
- [x] Command and local index behavior implemented with exact-copy tests.
- [x] Documentation and full local validation gates completed.
- [ ] Commit and PR publication completed.

## Task Breakdown

### Phase 1: Pure behavior and persistence

- [x] Add failing planner tests covering every branch and immutability.
- [x] Implement `planSkillRegistryRemove`; final coverage gate remains.
- [x] Add failing project/global config preservation tests, then removal methods.

### Phase 2: Index and command

- [x] Add failing focused-index tests for filtering, sibling preservation, missing index, and metadata.
- [x] Implement local-only index cleanup and SkillManager delegation.
- [x] Add failing command tests for validation, scopes, shadows, defaults, messages, index failure, and no network.
- [x] Implement `remove-registry` beside `add-registry` without purge flags.

### Phase 3: Integration and polish

- [x] Update user docs, changelog, implementation, and testing records.
- [x] Run targeted tests/coverage, build, full workspace tests, lint, and lifecycle lint.
- [ ] Create a conventional commit and open a PR when requested.

## Dependencies

Planner precedes persistence; persistence/index APIs precede command integration. Existing add-registry patterns and the approved exploration are authoritative. No external service is required.

## Timeline & Estimates

Single feature iteration: implementation and targeted tests, documentation, full gates, review/publish.

## Risks & Mitigation

- Stale discovery: focused local cleanup after config write.
- Wrong-scope deletion: inspect both maps, mutate one, emit actionable hints.
- Broken installed skills: never delete cache or installations.
- Default deletion: only configured shadows reach removal.
- Partial failure: print repair instructions without unsafe rollback.

## Resources Needed

Existing CLI/config/index modules, Vitest suites, approved exploration, lifecycle skills, npm workspace tooling, and GitHub CLI.
