---
phase: implementation
title: Plugin update implementation notes
---

# Plugin update implementation notes

Phase 5 implements the approved design in the existing package service, manager, and plugin command. Phase 7 alignment and analysis-only simplification review are recorded below; testing, CLI smoke and final review gates remain pending.

## Phase 5 progress

T1: added installed-version and registry lookup plus explicit latest install; injected runner returns optional stdout. New tests use real disposable filesystem fixtures and a stubbed HOME. Initial red: 23 missing-method failures; green: 23 package-update tests passed. Existing package tests passed 11/11 in the preceding run. An early fixture used an ineffective default-import os spy; replaced it with HOME isolation. No real npm subprocess ran in these tests. Workspace dependency build is required before manager tests can import existing config dependencies.

T2: added optional-target update orchestration and per-plugin results. Red: 12 missing-method failures after successful workspace build. Package and manager suites rerun together for regression verification. Previous/target/observed versions survive failures; no config mutation or uninstall in update.

T3: registered `plugin update [package]`, per-plugin table, three-state summary, version deltas, observed/attempted major labels, failure context, and exitCode handling. Red: 3 update command tests failed because the command was absent; green: plugin area 80/80, then 82/82 after coverage fixtures. Existing command tests retain their behavior.

### Phase 5 verification evidence

- `npm run build` (root): exit 0, all six projects built.
- `npx nx run cli:build`: exit 0 after production changes.
- `npx nx run-many -t test -p cli`: exit 0, 114 files / 1455 tests passed.
- Focused plugin-area coverage from packages/cli: 82 tests passed, all three changed production files at 100% statements/lines/functions. Remaining branch gaps reviewed separately in testing notes.
- Changed-file oxlint, TypeScript no-emit, formatting check, and git diff --check: exit 0.
- Fixture corrections: initial cwd mistakes caused file/config lookup failures; a shell-fixture string had a parse error and was corrected. An accidental root vitest invocation lacked package globals and failed before tests; rerun from packages/cli uses the correct config. These were harness errors, not accepted feature verification.
- Smoke: pending the required later lifecycle gate; no end-to-end functionality claim yet.

Failure-reporting accuracy review: fromVersion is captured before registry/install; targetVersion is never presented as observed toVersion; actual installed version is read before manifest validation; failed installs/read failures show unknown resulting version. Every failed row prints previous version or unknown plus manual recovery context. No automatic restoration and no config writes occur in update.

No design deviations or product scope changes. Tests live under packages/cli/tests. Task tracing remains unavailable. No commit, push or PR has been attempted.

Final phase 5 focused run: 83 tests passed. Coverage: 100% statements, lines and functions across all three changed files; 95.31% branches overall. Command and package service have 100% branch coverage; only pre-existing manager default-dependency branches remain uncovered.


## Phase 7 Alignment and Simplification Review — 2026-11-14

Reviewed tracked production diffs, new tests, existing callers, and all feature artifacts. Fresh plugin-area regression run: 83 tests passed in 8 files, exit 0. Feature lint: 12 checks passed. No production changes were made during this phase.

| Approved contract | Implementation and evidence |
| --- | --- |
| Optional package / configured-only selection | manager.update validates target and membership; targeted, invalid, unconfigured and empty tests |
| Explicit latest including majors | package service invokes view/install with name@latest argument arrays; package fixtures assert exact calls |
| Cheap pre-check / three outcomes | installed read then one registry lookup; equality returns up-to-date without install/manifest repair; sequential mixed-result test |
| Version deltas and major indicators | command derives deltas and major component changes from result metadata; tag-race and rendering tests |
| Failure recovery context | fromVersion is retained before mutation; errors retain target/observed values separately; unknown metadata and post-install failure tests |
| No rollback / config preservation | update never calls rollbackInstall, uninstall, addPlugin or removePlugin; failure and success tests assert no mutations |
| Sequential bulk / nonzero on any failure | awaited per-plugin loop; operation-order test; command sets exitCode after table/summary rendering |
| Existing behavior / package boundaries | add/remove/list implementations retained; package-service mocks updated atomically; all new tests live outside src |

Simplification analysis: each new method has a current manager caller; version validation serves two metadata sources; major comparison serves observed and attempted deltas. No unused layer, cache, persisted field or synchronized derived flag was introduced. Keep separate latest installation rather than weakening the bare-name input contract. Keep short explicit summary filters rather than introduce a generic accumulator for three categories. Rebuilding the small version regex per lookup is negligible beside filesystem/npm work and does not justify a caching abstraction. Shared test setup retains distinct failure-stage coverage. No simplification earns a code change, and no redesign or scope change is needed.

No blocking alignment findings or design deviations. Remaining validation: formal coverage review, real built-CLI smoke with disposable HOME/PATH, final pre-push review, and upstream rebase/revalidation. Read-only metadata failures and partial npm mutation limits remain as approved; no cross-process lock or rollback was added.

Skills loaded: dev-implementation, dev-simplify (analysis-only), verify, memory. Skipped: smoke execution (scheduled at phase 8 validation gate).


## Phase 8 Validation

Coverage review and real built-CLI smoke passed with no code changes. Smoke 8/8; temporary HOME/PATH fixtures cover bulk/targeted/equality/error flows, actual-versus-target versions, previous-version recovery, config byte preservation and adjacent list. See testing notes for detailed assertions, coverage exception and limitations. No registry access or live global changes. Next gate: phase 9 final review.

Skills loaded: dev-testing, dev-smoke, verify. Skipped: dev-review (awaiting phase 9 gate).

Fresh phase 8 full CLI regression run: `npx nx run-many -t test -p cli` exited 0; 114 files / 1456 tests passed. Disposable smoke script and sandbox were removed after execution.


## Phase 9 Final Review — 2026-11-14

No blocking findings. Reviewed production diffs, all new and modified test files, exported interfaces and their callers, configuration boundaries, npm execution, error metadata, and feature artifacts. Existing add/remove/list and skill update provided consistency references. No new dependency, circular import, config schema change, migration, or package version change. Names are validated before paths/execFile argument arrays; registry/installed versions are validated at the package boundary. Update retains approved manual-recovery limits and does not invoke add's uninstall rollback.

Checklist: design match, caller migration, logic/error paths, security boundaries, sequential writes, tests outside src, no published tests, documentation, coverage and smoke evidence reviewed. All passed. Existing manager fallback coverage exception is documented and exercised through real CLI smoke. Full formatting passed; lint output contains existing warnings outside changed files. Phase 8 full tests and 8/8 smoke are the current behavioral evidence; repository commit hooks and post-rebase checks will run before publishing.

Delivery is authorized by the orchestrator: conventional commit, rebase onto origin/main, rerun affected validation and publish PR with summary/validation/risks. Keep project skill-install .ai-devkit.json changes local and out of the feature commit. No release/version bump is part of this feature.

Skills loaded: dev-review, verify, dev-smoke, dev-commit, dev-pr. Skipped: dev-retro (optional; not requested).
