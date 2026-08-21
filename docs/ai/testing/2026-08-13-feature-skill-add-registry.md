---
phase: testing
title: Testing Strategy
description: Verify registry persistence, CLI behavior, safety, and regressions
---

# Testing Strategy

## Test Coverage Goals

- Achieve 100% line, branch, function, and statement coverage for all new pure logic.
- Unit-test project/global persistence and CLI routing/error handling with mocks.
- Run the full CLI and repository suites, lint, and build for regression evidence.
- Prove the add path performs no network, Git, clone, index, or cache operation.

## Unit Tests

### `ConfigManager.addSkillRegistry`

- [x] Adds the first project registry while preserving unrelated config.
- [x] Spread-merges a new registry without replacing sibling registry entries.
- [x] Treats same ID + same URL as idempotent with no write.
- [x] Rejects same ID + different URL without force and leaves config unchanged.
- [x] Replaces only the requested value with force.
- [x] Reports the established missing-project-config error.

### `GlobalConfigManager.addSkillRegistry`

- [x] Creates a missing global config and required parent directory.
- [x] Merges into existing registries while preserving unrelated fields.
- [x] Treats same ID + same URL as idempotent with no write.
- [x] Rejects a conflict without force and supports force replacement.
- [x] Refuses to overwrite a present malformed global config after read failure.

### `skill add-registry` command

- [x] Registers a valid ID and HTTPS URL in project scope by default.
- [x] Routes to global persistence for `-g` and `--global`.
- [x] Routes force intent for `-f` and `--force`.
- [x] Rejects bare, nested, and dotted registry IDs through `validateRegistryId()`.
- [x] Accepts HTTPS without `.git`, SSH/SCP syntax, and arbitrary URL strings verbatim.
- [x] Reports `already registered` for idempotent input and a clear conflict error otherwise.
- [x] Does not fetch defaults or invoke any cache/Git operation.
- [x] Leaves existing `skill add`, `list`, `remove`, `update`, `find`, and `rebuild-index` tests green.

## Integration Tests

- [x] Validate command-to-project-manager scope selection with mocked filesystem/config.
- [x] Validate command-to-global-manager scope selection with mocked filesystem/config.
- [x] Confirm a persisted project/global entry is already consumed by existing default < global < project merge behavior.
- [x] Confirm all failure modes avoid target writes.

## End-to-End Tests

- [x] Exercise CLI parsing for the documented HTTPS and SSH examples in the existing mocked command harness.
- [x] Exercise idempotent and forced-repeat flows.
- [x] Run the full existing command regression suite.

## Test Data

- Registry IDs: `anthropics/skills`, `example/private-skills`, plus invalid bare/nested/dotted forms.
- URL values: `.git` HTTPS, suffixless HTTPS, SSH/SCP syntax, and an arbitrary opaque string.
- Config fixtures: missing, valid empty, valid with sibling registries/unrelated fields, and malformed JSON.
- Mock `fs-extra`, `os.homedir`, terminal UI, and process exit using established test patterns. No production user config, cache, network, or Git repository is touched.

## Test Reporting & Coverage

- Targeted red/green tests run per implementation task.
- Task 1 evidence: `npx vitest run src/__tests__/lib/Config.test.ts --coverage --coverage.include=src/util/skill-registry.ts` — 49 tests passed; helper coverage 100% statements, branches, functions, and lines.
- Task 2 evidence: `npx vitest run src/__tests__/lib/GlobalConfig.test.ts` — 15 tests passed, including malformed-file no-write and all shared mutation outcomes.
- Task 3 evidence: CLI lint exited 0 (five pre-existing warnings), CLI build exited 0, and the combined command/config suite passed 90/90 with the helper at 100% coverage.
- Phase 7 evidence: existing downstream precedence test passed 1/1; built CLI help displayed `<id> <url>`, `-g/--global`, and `-f/--force`.
- Final focused coverage: 90/90 tests; `planSkillRegistryAdd` is 100% statements (6/6), branches (9/9), functions (1/1), and lines (6/6).
- Full regression: root `npm test` passed 954/954 tests across 79 CLI test files plus all other workspaces; `npm run lint` exited 0 with five pre-existing warnings; `npm run build` built all six projects.
- Lifecycle lint: base and `--feature skill-add-registry` both passed.

## Manual Testing

- [x] Verify `ai-devkit skill add-registry --help` documents arguments and both flag aliases.
- [x] Smoke-test command output through mocked project/global manager boundaries; no production config or home directory was touched.
- No UI accessibility or browser/device testing applies to this CLI-only feature.

## Performance Testing

No load/stress suite is warranted for a single local config mutation. Unit tests assert the absence of network/cache work; qualitative target is immediate completion bounded by config-file I/O.

## Bug Tracking

Blocking failures are fixed before review. Any deferred registry removal/listing UX is tracked as follow-up scope, not treated as a defect in this feature.
