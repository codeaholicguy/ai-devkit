---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
feature: install-command
---

# Testing Strategy - Install Command

## Test Coverage Goals

- Validate config parsing and normalization for install command.
- Validate install command behavior and exit-code policy.
- Validate config skill metadata persistence path used by `skill add`.

## Unit Tests

### Config Validation (`util/config.ts`)

- [x] Normalizes duplicated environments/phases/skills.
- [x] Accepts legacy `skills[].skill` and normalizes to `name`.
- [x] Fails for unsupported environment values.
- [x] Fails for invalid skill entries.

### Config Loading (`services/config/config.service.ts`)

- [x] Fails for missing config file.
- [x] Fails for invalid JSON parsing.
- [x] Returns resolved config path and parsed data on success.

### `install` Command Handler

- [x] Returns exit code `1` when config loading fails.
- [x] Returns exit code `1` for empty install sections.
- [x] Calls orchestrator with provided options and uses orchestrator exit code.

### Existing Modules Updated

- [x] `ConfigManager.addSkill` adds unique entries.
- [x] `ConfigManager.addSkill` skips duplicates.
- [x] `SkillManager.addSkill` persists skill metadata (`registry`, `name`) to config.

### Install Orchestration (`services/install/install.service.ts`)

- [x] Installs environments/phases/skills in happy path.
- [x] Prompts once and skips conflicting artifacts when overwrite is declined.
- [x] Overwrites conflicting artifacts when prompted confirmation is accepted.
- [x] Auto-overwrites without prompt when `--overwrite` is set.
- [x] Skill failures are collected as warnings and do not change exit code.
- [x] Exit code is non-zero when environment/phase failures occur.

## Integration Tests

- [x] Command-level flow covered via `install` command tests with mocked orchestrator.
- [x] Service-level integration flow covered with mocked dependencies for overwrite and partial-failure branches.
- [ ] Real filesystem integration test for `ai-devkit install` happy path.
- [ ] Real filesystem integration test for `--overwrite` confirmation flow.
- [ ] Real skill install partial-failure integration with network errors.

## Test Reporting & Coverage

Executed on February 23, 2026:

```bash
npm run test -- --runInBand \
  src/__tests__/services/install/install.service.test.ts \
  src/__tests__/util/config.test.ts \
  src/__tests__/commands/install.test.ts \
  src/__tests__/services/config/config.service.test.ts \
  src/__tests__/lib/Config.test.ts \
  src/__tests__/lib/SkillManager.test.ts \
  src/__tests__/commands/init.test.ts
```

Result: targeted suites pass locally (command/config/config-service/config-manager/init/skill-manager coverage).
Additional focused run:

```bash
npm run test -- --runInBand \
  src/__tests__/services/install/install.service.test.ts \
  src/__tests__/commands/install.test.ts \
  src/__tests__/util/config.test.ts \
  src/__tests__/services/config/config.service.test.ts
```

Result: `4 passed, 4 total` suites and `16 passed, 16 total` tests.

## Manual Testing

Pending manual verification:

- [ ] `ai-devkit install` in a repo with existing `.ai-devkit.json`.
- [ ] `ai-devkit install --overwrite` prompt and overwrite behavior.
- [ ] `ai-devkit install` with skill install failure path and warning output.

## Outstanding Gaps

- End-to-end filesystem and network-backed integration tests are still pending.
