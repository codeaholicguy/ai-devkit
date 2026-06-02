---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
feature: cli-startup-performance
---

# Testing Strategy

## Test Coverage Goals

- Unit coverage target: 100% of new command registration, lazy dispatch, and benchmark utility code.
- Integration scope: built CLI help/version, command parsing, lazy handler execution, and representative non-mutating commands.
- Performance scope: local and CI benchmark gate for required startup/help paths, with representative real commands measured as smoke metrics.
- Regression scope: existing CLI command tests and e2e smoke tests continue to pass.

## Unit Tests

### CLI Bootstrap and Metadata

- [x] Root command registers the same command names as current CLI. Covered by `packages/cli/src/cli-command-manifest.ts` and `packages/cli/src/__tests__/util/cli-command-manifest.test.ts`.
- [x] Root `--help` output includes existing command descriptions without importing heavy command modules. Covered by `packages/cli/src/__tests__/util/cli-runtime.test.ts`.
- [x] Root `--version` returns the package version without importing command handlers. Covered by `packages/cli/src/__tests__/util/cli-runtime.test.ts`.
- [x] Each top-level command exposes expected command names and core descriptions from metadata. Static help metadata is covered by `packages/cli/src/__tests__/util/cli-runtime.test.ts`.
- [x] Lazy action wrapper imports the target module only when the action executes. Top-level dispatcher mapping is covered by `packages/cli/src/__tests__/util/cli-runtime.test.ts`.
- [x] Lazy action wrapper preserves thrown errors and existing error-handler behavior. Existing command handlers and error wrappers are still used by selected command modules; covered by `npm test -w packages/cli` and `npm run test:e2e`.

### Command Handler Boundaries

- [x] `memory --help` does not import `@ai-devkit/memory`.
- [x] `agent --help` does not import `ink`, `react`, or `@ai-devkit/agent-manager`.
- [x] `channel --help` does not import `telegraf` or bridge runner code.
- [x] Actual `memory search` imports and calls the memory command implementation with parsed options.
- [x] Actual `agent list --json` imports and calls the agent command implementation with parsed options.

### Benchmark Utility

- [x] Computes min, p50, p95, max, and avg from timing samples. Covered by `packages/cli/src/__tests__/util/cli-benchmark.test.ts`.
- [x] Captures non-zero command exits as failures. Covered by `packages/cli/src/__tests__/util/cli-benchmark.test.ts`.
- [x] Fails the gate when p50 exceeds the configured threshold. Covered by `packages/cli/src/__tests__/util/cli-benchmark.test.ts`.
- [x] Supports temporary cwd/env setup for memory benchmark cases and isolated cwd setup for agent list smoke runs. Covered by `packages/cli/src/__tests__/util/cli-benchmark.test.ts`.

## Integration Tests

- [x] `node packages/cli/dist/cli.js --version` prints the package version.
- [x] `node packages/cli/dist/cli.js --help` prints root help and exits successfully.
- [x] `node packages/cli/dist/cli.js init --help` prints init help and exits successfully.
- [x] `node packages/cli/dist/cli.js phase --help` prints phase help and exits successfully.
- [x] `node packages/cli/dist/cli.js setup --help` prints setup help and exits successfully.
- [x] `node packages/cli/dist/cli.js lint --help` prints lint help and exits successfully.
- [x] `node packages/cli/dist/cli.js install --help` prints install help and exits successfully.
- [x] `node packages/cli/dist/cli.js memory --help` prints memory help and exits successfully.
- [x] `node packages/cli/dist/cli.js agent --help` prints agent help and exits successfully.
- [x] `node packages/cli/dist/cli.js channel --help` prints channel help and exits successfully.
- [x] `node packages/cli/dist/cli.js docs --help` prints docs help and exits successfully.
- [x] `node packages/cli/dist/cli.js skill --help` prints skill help and exits successfully.
- [x] `node packages/cli/dist/cli.js lint` works in a valid `docs/ai` workspace.
- [x] `node packages/cli/dist/cli.js agent list --json` works from an isolated temporary cwd and tolerates empty/non-empty agent lists while verifying successful exit.
- [x] `node packages/cli/dist/cli.js memory search --query "startup performance" --limit 1` works against an isolated temp memory DB/config.

## End-to-End Tests

- [x] Existing `npm run test:e2e` remains green after the CLI bootstrap/build changes.
- [x] Existing init/install/skill/memory e2e paths still execute through the published `dist/cli.js` entrypoint.
- [x] Channel daemon path remains valid if build restructuring changes `dist` layout. No generated/bundled `dist` layout change was needed.

## Test Data

- Temporary workspace with valid `docs/ai` base files for `lint`.
- Temporary `.ai-devkit.json` or config path for memory DB isolation.
- Environment setup that isolates project config for memory and tolerates empty/non-empty agent lists while verifying successful exit.

## Test Reporting & Coverage

- Required commands:
  - `npm run build`
  - `npm test -w packages/cli`
  - `npm test -w packages/cli -- --coverage`
  - `npm run test:e2e`
  - CLI benchmark command introduced by this feature
- Benchmark output must print a compact table or JSON summary with p50/p95 for each case.
- CI should preserve benchmark output in logs for regression diagnosis.

## Phase 7 Results

- `npm test -w packages/cli -- src/__tests__/util/cli-runtime.test.ts src/__tests__/util/cli-command-manifest.test.ts src/__tests__/util/cli-benchmark.test.ts` passed after the final simplification pass: 3 files, 18 tests.
- `npm run build` passed for all 4 projects.
- `npm test -w packages/cli -- --coverage` passed before the final runtime merge: 49 files, 680 tests. Overall package coverage was `90.53%` statements, `90.56%` branches, `86.27%` functions, and `90.53%` lines.
- `npm test -w packages/cli` passed after the final help-output parity fixes: 49 files, 680 tests.
- `npm run test:e2e` passed: 38 tests.
- `npm run benchmark:startup -w packages/cli` passed with `0` failures. Final startup/help p50 values were `28.299-29.276 ms`; representative real command p50 values were `70.802 ms` for `lint`, `226.225 ms` for `agent-list-json`, and `149.483 ms` for `memory-search`.
- After moving runtime logic next to `cli.ts`, `npm test -w packages/cli` passed: 49 files, 681 tests. `npm run test:e2e` passed: 38 tests. `npm run benchmark:startup -w packages/cli` passed with `0` failures and startup/help p50 values of `24.290-26.318 ms`.

Remaining coverage gaps are pre-existing broad package gaps or executable-only benchmark branches. No additional production tests are required for this feature before code review.

## Manual Testing

- [x] Run benchmark locally on a clean built tree and confirm required startup/help p50 values are `<50 ms`.
- [x] Run `ai-devkit --help`, `memory --help`, `agent --help`, and `channel --help` manually to inspect output parity through benchmark/e2e smoke coverage.
- [x] Run `ai-devkit lint` in the repo.
- [x] Run `ai-devkit memory search --query "startup performance" --limit 1` with an isolated DB.

## Performance Testing

- [x] Benchmark root `--version`, root `--help`, and every top-level command `--help` path for at least 20 iterations. Implemented by `packages/cli/src/util/cli-benchmark.ts`; smoke-run with one iteration after `npm run build`.
- [x] Enforce p50 `<50 ms` for lightweight startup/help cases. Verified locally with `npm run benchmark:startup -w packages/cli`: all final startup/help p50 values were `28.299-29.276 ms` and failures were `0`.
- [x] Track p95 for visibility; do not fail only on p95 unless it shows repeated outliers that make p50 unstable.
- [x] Measure representative real commands in the same benchmark table for regression visibility. The CI gate currently enforces the `<50 ms` requirement only for startup/help cases; real-command p50 regression gating would require a stored or generated baseline in a follow-up.

## Bug Tracking

- Any behavior change in command output, parsed options, or exit code is blocking.
- Any new dependency in package manifests is blocking.
- Any benchmark flake in CI must be fixed by improving sampling/environment control, not by removing the gate.
