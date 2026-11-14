---
phase: testing
title: Plugin update testing strategy
---

# Plugin update testing strategy

## Test Coverage Goals

Target all new behavior and error branches, with unit/integration tests in packages/cli/tests and isolated CLI smoke coverage. Numeric coverage target: 100% of new/changed code, with any gaps explained at testing review.

## Unit Tests

- [x] Package service reads installed versions and queries registry latest for plain/scoped names.
- [x] Package service installs explicit latest using argument arrays and private npm cwd.
- [x] Invalid names, missing/corrupt versions, registry failures and install failures are actionable.
- [x] Manager updates one configured plugin or all configured plugins sequentially.
- [x] Invalid/unconfigured target fails before mutation; empty selection is a no-op.
- [x] Equal versions are up-to-date with no install; differing versions install and validate.
- [x] Updated results show actual versions and flag major crossings.
- [x] Pre-check, install and validation failures retain the previous version when available; no rollback occurs.
- [x] Mixed bulk results continue after failure; configuration is never mutated.

## Integration Tests

- [x] Command renders all three states, version deltas, major indicators and recovery context.
- [x] Any failed result yields nonzero exit status; empty and successful runs succeed.
- [x] Existing add/remove/list behavior remains intact.

## End-to-End Tests

- [x] Required dev-smoke invokes the built CLI with disposable user state and controlled npm responses for update, up-to-date, and mixed failure paths.
- Persistent E2E placement: not applicable; no permanent E2E file added. Disposable smoke drives the built CLI; unit/integration tests remain in packages/cli/tests.

## Test Data

Inject npm runners and configuration stores for unit tests; use temporary installed package manifests. Include scoped names, same versions, patch/minor/major changes, tag movement, malformed metadata, and failure after install.

## Test Reporting & Coverage

Run dependency builds before package tests as needed, then `npx nx run-many -t test -p cli`. Record fresh command output and any coverage gaps. Revalidate after rebase before delivery.

## Manual Testing

Inspect CLI output for readable deltas and major warnings using isolated smoke fixtures. No live global plugin mutation.

## Performance Testing

Assert equal-version cases do not install and each selected plugin uses one registry version lookup. No load benchmark is needed for sequential maintenance commands.

## Bug Tracking

Record failures and regressions in implementation/testing notes and return to the relevant lifecycle phase before delivery.


## Phase 3 Design Scenarios

- [x] Version lookup accepts valid prerelease/build versions and rejects empty/non-string/invalid JSON, invalid core versions and leading-zero numeric identifiers.
- [x] Lookup does not create or write files; registry is queried only after an installed version was read.
- [x] Default npm runner captures stdout; existing mutation runners returning void remain usable.
- [x] Registry tag race reports actual installed version; major indication derives from the observed version pair.
- [x] Failed rows distinguish attempted target from actual installed version, including failure before metadata, registry failure with known previous version, post-install read failure, and manifest failure with observed new version.
- [x] Summary counts derive from all results; previous-version recovery text is emitted for every failed result.
- [x] Command exitCode is restored between tests so failed-result tests cannot contaminate later tests.
- [x] Smoke uses disposable HOME and PATH-controlled npm fixtures, exercising the real built CLI without touching live plugin state.


## Phase 5 Evidence and Remaining Gates

Full scoped CLI test run: `npx nx run-many -t test -p cli` exited 0 with 114 files and 1455 tests passing. Focused coverage command (cwd packages/cli): `npx vitest run tests/commands/plugin.test.ts tests/services/plugin --coverage --coverage.include=src/commands/plugin.ts --coverage.include=src/services/plugin/plugin-manager.service.ts --coverage.include=src/services/plugin/plugin-package.service.ts`.

Changed production files have 100% lines/statements/functions. Branch coverage gaps in manager are pre-existing default dependency construction (lines 39–41); injected unit tests intentionally supply dependencies. Formal phase 8 review will record final percentages and any remaining exceptions. Default npm subprocess stdout is exercised with a temporary executable and temporary HOME/PATH; no real npm registry is contacted.

Tests distinguish tag races, failures before/after installed metadata, attempted major target versus observed result, equality skip, config preservation and sequential continuation. No persistent E2E was added yet. Required real CLI smoke, phase 7 alignment, phase 8 coverage sign-off and phase 9 review remain pending. No performance load benchmark is needed; command count and equality-no-install assertions cover the cheap pre-check contract.

Final phase 5 focused run: 83 tests passed. Coverage: 100% statements, lines and functions across all three changed files; 95.31% branches overall. Command and package service have 100% branch coverage; only pre-existing manager default-dependency branches remain uncovered.


## Phase 7 Review

Requirements-to-implementation matrix is recorded in implementation notes. Fresh plugin-area regression run passed 83/83 tests. No test scenarios were invalidated or new product scope discovered. Phase 8 must exercise the built CLI end to end: mixed failure continuation and recovery output, observed major update, equality no-install, empty configuration, target rejection, config byte preservation and adjacent list behavior. Existing unit coverage does not substitute for this smoke.


## Phase 8 Coverage Review and CLI Smoke — 2026-11-14

Fresh focused coverage run: exit 0, 83 tests across 8 files. Statements 136/136 (100%), lines 133/133 (100%), functions 30/30 (100%), branches 61/64 (95.31%). CLI command and package service have 100% branch coverage. The three uncovered branches are pre-existing fallback construction of manager dependencies (manager lines 39–41), not update logic. Accepted coverage exception: unit tests inject boundaries; real CLI smoke exercises default construction end to end. No untested new-code branch remains in this report.

Tests: [package update](../../../../packages/cli/tests/services/plugin/plugin-update-package.test.ts), [manager update](../../../../packages/cli/tests/services/plugin/plugin-update-manager.test.ts), [plugin command](../../../../packages/cli/tests/commands/plugin.test.ts), plus existing plugin suites. Package tests exercise the default subprocess runner with a temporary executable; manager tests cover ordering/metadata preservation; command tests cover status/count/rendering and exitCode teardown.

Smoke command: `python3 /tmp/plugin-update-smoke.py`, exit 0, 8/8 scenarios passed against `packages/cli/dist/bundle/cli.js` via Node. Disposable HOME, working directory, compile cache, global git config and PATH-controlled npm executable. Seeded valid scoped/unscoped plugins and manifests. The executable simulates registry stdout, installation changes, and failures; no external registry or live plugin mutation. Temporary sandbox removed in finally cleanup.

| Scenario | Assertions | Result |
| --- | --- | --- |
| Update all | Sequential view/install calls, two changed plugins, one equality skip, counts and major delta, correct npm cwd | PASS |
| Targeted scoped update | Only selected package changed; actual version differs from lookup target and is displayed correctly | PASS |
| Up-to-date | One registry view, zero installs, unchanged delta and up-to-date output | PASS |
| Install failure with partial mutation | Previous version printed, attempted major target labeled, resulting version unknown, next plugin updated, all three counts and exit 1, no uninstall | PASS |
| Invalid installed manifest after update | Observed new version and previous version both printed, exit 1, installation retained, list marks invalid | PASS |
| Registry failure | Known previous version printed; no install; version unchanged; exit 1 | PASS |
| Invalid/unconfigured targets | Exit 1 with actionable error, zero npm calls | PASS |
| Empty config | Successful no-op warning for update and list, zero npm calls | PASS |

Every invocation asserts global configuration bytes remain exactly unchanged. Adjacent list behavior is checked for valid, invalid and empty installations. No live-network npm behavior is claimed; npm protocol and filesystem integration are covered with controlled subprocess fixtures. Add/remove are unchanged and covered by existing regression tests, not separate real-npm smoke. No server or outward-facing action was used.

No defects or product decisions discovered in phase 8. Required smoke completed; final review and post-rebase revalidation remain pending. Task tracing remains unavailable (`unknown command task`).

Fresh phase 8 full CLI regression run: `npx nx run-many -t test -p cli` exited 0; 114 files / 1456 tests passed. Disposable smoke script and sandbox were removed after execution.
