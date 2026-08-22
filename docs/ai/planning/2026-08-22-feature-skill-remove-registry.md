---
phase: planning
title: Skill Registry Removal Plan
description: TDD implementation and validation tasks
---

# Skill Registry Removal Plan

## Milestones

- [x] Planner and persistence behavior implemented with tests.
- [x] Simplified scoped command and guarded global cache deletion implemented with tests.
- [x] Documentation and full local validation gates completed.
- [x] Initial feature commit published in PR #196; review simplification prepared for the same PR.

## Task Breakdown

### Phase 1: Pure behavior and persistence

- [x] Add failing planner tests covering every branch and immutability.
- [x] Implement `planSkillRegistryRemove`; final coverage gate remains.
- [x] Add failing project/global config preservation tests, then removal methods.

### Phase 2: Command and cache behavior

- [x] Add command tests for validation, selected-scope guards, project cache preservation, and global cache deletion.
- [x] Implement `remove-registry` beside `add-registry` with resolved-path containment.
- [x] Remove focused index cleanup because seed catalog entries are valid without local configuration.
- [x] Remove the frozen default-registry ID snapshot and rely on config-map structure.

### Phase 3: Integration and polish

- [x] Update user docs, changelog, implementation, and testing records.
- [x] Run targeted tests/coverage, build, full workspace tests, lint, and lifecycle lint.
- [x] Create a conventional commit and open PR #196.
- [x] Validate and prepare the reviewed simplification follow-up for commit and push.

## Dependencies

Planner precedes persistence. The command uses existing config managers and `SKILL_CACHE_DIR`; no index API or external service is required.

## Timeline & Estimates

Single feature iteration: implementation and targeted tests, documentation, full gates, review/publish.

## Risks & Mitigation

- Unsafe recursive deletion: validate the registry ID and require the resolved target to remain inside the cache root.
- Wrong-scope deletion: read and mutate only the selected config map.
- Seed catalog inconsistency: leave the discovery index unchanged, matching its unconfigured-registry semantics.
- Default deletion: defaults are absent from user config maps and fail the own-property guard.

## Resources Needed

Existing CLI/config/cache modules, Vitest suites, lifecycle skills, npm workspace tooling, and GitHub CLI.
