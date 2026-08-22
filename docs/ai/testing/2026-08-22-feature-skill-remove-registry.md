---
phase: testing
title: Skill Registry Removal Testing
description: Coverage and validation strategy for skill remove-registry
---

# Skill Registry Removal Testing

## Test Coverage Goals

- 100% statements, branches, functions, and lines for `planSkillRegistryRemove`.
- Critical command, persistence, cache containment, and failure paths covered.
- Full workspace test and lint gates remain green.

## Unit Tests

### Pure planner

- [x] Present/absent IDs return correct status and registry maps.
- [x] Input is immutable; siblings, empty maps, and inherited properties behave correctly.
- [x] Coverage demonstrates 100% statements, branches, functions, and lines for the planner module.

### Config and cache behavior

- [x] Project/global removers preserve unrelated registries and config keys.
- [x] Existing missing/malformed-config guarantees remain intact in the full config suites.
- [x] Project removal preserves cache; global removal deletes only the resolved registry cache path.

## Integration Tests

- [x] Default removes only project; `-g`/`--global` remove only global.
- [x] Built-in removal is rejected before config mutation.
- [x] Missing selected-scope registrations use the concise `try --global` error.
- [x] Invalid IDs cause no config reads or cache deletion.
- [x] Global cache deletion targets a strict descendant of the cache root (unit-tested in `SkillManager.removeRegistryCache`).
- [x] The discovery index is not touched during removal.

## End-to-End Tests

- [x] CLI help exposes only the scope option beside `add-registry`.
- [x] Full workspace build/tests/lint and lifecycle lint pass.
- [x] Adjacent add-registry behavior remains green.

## Test Data

Use command mocks and temporary filesystem fixtures. Seed mixed registry maps to prove sibling preservation and assert the global cache target path.

## Test Reporting & Coverage

Run targeted Vitest suites and planner coverage, then repository-native full test/lint gates. Record fresh results during completion.

Fresh simplification results from 2026-08-22:

- Targeted suites: 5 files passed, 176 tests passed.
- Planner module: 100% statements (11/11), branches (11/11), functions (2/2), and lines (11/11).
- Workspace build: 6 projects passed.
- Workspace tests: 6 projects passed; 140 files and 1,954 tests passed.
- Workspace lint: 6 projects passed with no errors; 4 unrelated existing warnings were reported.
- Base and feature lifecycle lint: passed.
- Built CLI help: exit 0 and lists `-g, --global` plus standard `--help`.

## Manual Testing

Inspect CLI help and exact output assertions; no browser/device checks apply.

## Performance Testing

No load test is required; the only size-dependent operation is recursive global cache deletion.

## Bug Tracking

Fix regressions before review and document intentional follow-ups.
