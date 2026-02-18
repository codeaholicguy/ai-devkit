---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit coverage for template parser/validator logic.
- Command-level integration coverage for `init --template` behavior.
- Regression coverage for legacy interactive init behavior.

## Unit Tests
**What individual components need testing?**

### `InitTemplate` parser/validator
- [x] YAML parse + validation success (`environments`, `phases`, `skills`).
- [x] JSON parse + validation success.
- [x] Same-registry multi-skill input accepted (`debug`, `memory`).
- [x] Invalid environment rejects with field-scoped error.
- [x] Unknown template field rejects.
- [x] Missing template file rejects.

## Integration Tests
**How do we test component interactions?**

### `init` command in template mode
- [x] Uses template values without interactive prompts when complete.
- [x] Installs multiple skills from same registry.
- [x] Deduplicates duplicate `registry+skill` entries and warns.
- [x] Continues when a skill install fails and reports warnings.
- [x] Falls back to prompts when template omits environments/phases.

## End-to-End Tests
**What user flows need validation?**

- [ ] Manual E2E run in real repo with YAML template.
- [ ] Manual E2E run in real repo with JSON template.
- [ ] Manual verification of warning-only behavior when one skill fails.

## Test Data
**What data do we use for testing?**

- Jest mocks for `ConfigManager`, `TemplateManager`, `SkillManager`, selectors, and `inquirer`.
- YAML/JSON inline fixtures for parser validation tests.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Executed:
  - `npm --workspace packages/cli test -- init.test.ts InitTemplate.test.ts`
- Result:
  - 2 suites passed, 11 tests passed.
- Remaining gap:
  - Full workspace regression not executed in this iteration.

## Manual Testing
**What requires human validation?**

- Confirm UX copy/clarity in terminal for template warnings.
- Validate behavior with real skill registries and network variability.

## Performance Testing
**How do we validate performance?**

- No dedicated perf benchmark added yet.
- Parse/validation path should remain lightweight; verify in broader CLI profiling if needed.

## Bug Tracking
**How do we manage issues?**

- Track template schema mismatches and real-world registry edge cases in normal project issue flow.
