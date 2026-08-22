---
phase: testing
title: Skill Registry Removal Testing
description: Coverage and validation strategy for skill remove-registry
---

# Skill Registry Removal Testing

## Test Coverage Goals

- 100% statements, branches, functions, and lines for `planSkillRegistryRemove`.
- Critical command, persistence, index, and failure paths covered.
- Full workspace test and lint gates remain green.

## Unit Tests

### Pure planner

- [x] Present/absent IDs return correct status and removed URL.
- [x] Input is immutable; siblings, empty maps, and inherited properties behave correctly.
- [x] Coverage demonstrates 100% statements, branches, functions, and lines for the planner module.

### Config and local index

- [x] Project/global removers preserve unrelated registries and config keys.
- [x] Existing missing/malformed-config guarantees remain intact in the full config suites.
- [x] Index cleanup drops only target skills/head, preserves siblings, and no-ops when absent.

## Integration Tests

- [x] Default removes only project; `-g`/`--global` remove only global.
- [x] Cross-scope and built-in/default shadows report the revealed source.
- [x] Wrong-scope, protected, and missing errors use exact copy and sorted inventories.
- [x] Invalid IDs cause no reads/writes.
- [x] Index failure reports partial success and rebuild guidance.
- [x] Registry network fetch/update is mocked and asserted unused.

## End-to-End Tests

- [x] CLI help exposes only the scope option beside `add-registry`.
- [x] Full workspace build/tests/lint and lifecycle lint pass.
- [x] Adjacent add-registry behavior remains green.

## Test Data

Use command mocks and temporary filesystem fixtures. Seed mixed registry entries and heads to prove sibling preservation.

## Test Reporting & Coverage

Run targeted Vitest suites and planner coverage, then repository-native full test/lint gates. Record fresh results during completion.

Fresh results from 2026-08-22:

- Targeted suites: 5 files passed, 184 tests passed.
- Planner module: 100% statements (12/12), branches (11/11), functions (2/2), and lines (12/12).
- Workspace build: 6 projects passed.
- Workspace tests: 6 projects passed; 140 files and 1,962 tests passed.
- Workspace lint: 6 projects passed with no errors; 4 unrelated existing warnings were reported.
- Base and feature lifecycle lint: passed.
- Built CLI help: exit 0 and lists `-g, --global` plus standard `--help`, with no purge option.

## Manual Testing

Inspect CLI help and exact output assertions; no browser/device checks apply.

## Performance Testing

No load test is required; the operation is bounded local filtering.

## Bug Tracking

Fix regressions before review and document intentional follow-ups.
