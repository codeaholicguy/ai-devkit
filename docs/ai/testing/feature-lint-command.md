---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit target: 100% of new/changed lint utilities and feature normalization logic.
- Integration target: CLI command invocation, rendered output categories, and exit code behavior.
- Manual target: run lint flows on real workspace states (healthy and missing prerequisites).

## Unit Tests
**What individual components need testing?**

### `packages/cli/src/services/lint/lint.service.ts` + `packages/cli/src/services/lint/rules/*`
- [x] Feature name normalization accepts both `lint-command` and `feature-lint-command`.
- [x] Invalid feature names fail fast as required failures before git checks run.
- [x] Base docs missing case returns required failures and non-zero exit code.
- [x] Branch exists + no dedicated worktree returns pass with warning.
- [x] Missing feature branch returns required failure.
- [x] Non-git directory in feature mode returns required failure.

## Integration Tests
**How do we test component interactions?**

- [x] Command-level test verifies `lintCommand` calls `runLintChecks` and `renderLintReport` with parsed options.
- [x] Command-level test verifies `process.exitCode` is set from report exit code (`0` and `1` paths).
- [x] Output rendering tests verify human-readable sections and `--json` serialization behavior.

## End-to-End Tests
**What user flows need validation?**

- [x] Real workspace state (current repo) via utility execution: feature check passes with required checks satisfied.
- [x] Missing docs scenario (temporary directory): required failures and non-zero exit code.
- [x] Branch exists/no dedicated worktree scenario (temporary git repo): warning-only worktree result with zero exit code.

## Test Data
**What data do we use for testing?**

- Dependency-injected stubs for `existsSync` and `execFileSync`.
- Synthetic git command outputs for branch/worktree combinations.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Executed:
  - `nx run cli:test -- --runInBand lint.test.ts` (pass, 2 suites / 9 tests)
  - `npm run lint` in `packages/cli` (pass with pre-existing repo warnings unrelated to lint command)
- Manual verification runs:
  - Current repo + `feature=lint-command`: pass `true`, exit code `0`, zero required failures.
  - Temporary directory with no docs: pass `false`, exit code `1`, required failures `5`.
  - Temporary git repo with `feature-sample` branch but no dedicated worktree: pass `true`, exit code `0`, git warning present.
- Current gap:
  - Full CLI binary invocation (`npm run dev -- lint ...`) remains blocked by unrelated pre-existing TypeScript issues in `src/commands/memory.ts`.

## Manual Testing
**What requires human validation?**

- Validate output readability and remediation commands in terminal.
- Validate warning-only behavior when worktree is missing but branch exists.
- Validate JSON consumers in CI pipelines that parse `--json` output.

## Performance Testing
**How do we validate performance?**

- Confirm command remains sub-second for standard repository size during manual verification.

## Bug Tracking
**How do we manage issues?**

- Track unrelated pre-existing TypeScript issues in `src/commands/memory.ts` separately from this feature.
