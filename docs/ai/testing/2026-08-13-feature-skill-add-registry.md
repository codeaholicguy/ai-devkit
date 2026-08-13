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

- [ ] Adds the first project registry while preserving unrelated config.
- [ ] Spread-merges a new registry without replacing sibling registry entries.
- [ ] Treats same ID + same URL as idempotent with no write.
- [ ] Rejects same ID + different URL without force and leaves config unchanged.
- [ ] Replaces only the requested value with force.
- [ ] Reports the established missing-project-config error.

### `GlobalConfigManager.addSkillRegistry`

- [ ] Creates a missing global config and required parent directory.
- [ ] Merges into existing registries while preserving unrelated fields.
- [ ] Treats same ID + same URL as idempotent with no write.
- [ ] Rejects a conflict without force and supports force replacement.
- [ ] Refuses to overwrite a present malformed global config after read failure.

### `skill add-registry` command

- [ ] Registers a valid ID and HTTPS URL in project scope by default.
- [ ] Routes to global persistence for `-g` and `--global`.
- [ ] Routes force intent for `-f` and `--force`.
- [ ] Rejects bare, nested, and dotted registry IDs through `validateRegistryId()`.
- [ ] Accepts HTTPS without `.git`, SSH/SCP syntax, and arbitrary URL strings verbatim.
- [ ] Reports `already registered` for idempotent input and a clear conflict error otherwise.
- [ ] Does not fetch defaults or invoke any cache/Git operation.
- [ ] Leaves existing `skill add`, `list`, `remove`, `update`, `find`, and `rebuild-index` tests green.

## Integration Tests

- [ ] Validate command-to-project-manager scope selection with mocked filesystem/config.
- [ ] Validate command-to-global-manager scope selection with mocked filesystem/config.
- [ ] Confirm a persisted project/global entry is already consumed by existing default < global < project merge behavior.
- [ ] Confirm all failure modes avoid target writes.

## End-to-End Tests

- [ ] Exercise CLI parsing for the documented HTTPS and SSH examples in an isolated mocked/temp environment if existing conventions support it.
- [ ] Exercise idempotent and forced-repeat flows.
- [ ] Run the full existing command regression suite.

## Test Data

- Registry IDs: `anthropics/skills`, `shopback/skills`, plus invalid bare/nested/dotted forms.
- URL values: `.git` HTTPS, suffixless HTTPS, SSH/SCP syntax, and an arbitrary opaque string.
- Config fixtures: missing, valid empty, valid with sibling registries/unrelated fields, and malformed JSON.
- Mock `fs-extra`, `os.homedir`, terminal UI, and process exit using established test patterns. No production user config, cache, network, or Git repository is touched.

## Test Reporting & Coverage

- Targeted red/green tests run per implementation task.
- CLI coverage: `npm run test:coverage --workspace=packages/cli` (adjust to repository-native invocation if required by scripts).
- Full regression: root `npm test`, `npm run lint`, and `npm run build`.
- Record final commands, outcomes, and any justified exclusions in this document.

## Manual Testing

- [ ] Verify `ai-devkit skill add-registry --help` documents arguments and both flag aliases.
- [ ] Smoke-test project/global command output in isolated temporary homes/directories only.
- No UI accessibility or browser/device testing applies to this CLI-only feature.

## Performance Testing

No load/stress suite is warranted for a single local config mutation. Unit tests assert the absence of network/cache work; qualitative target is immediate completion bounded by config-file I/O.

## Bug Tracking

Blocking failures are fixed before review. Any deferred registry removal/listing UX is tracked as follow-up scope, not treated as a defect in this feature.
