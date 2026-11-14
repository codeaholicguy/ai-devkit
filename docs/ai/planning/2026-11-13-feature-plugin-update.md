---
phase: planning
title: Plugin update implementation plan
---

# Plugin update implementation plan

## Status and execution rules

Phase 4 plan prepared on 2026-11-14 from approved requirements and design. T1–T3 are implemented with focused regression tests. T4–T6 remain pending their lifecycle gates. Stay in feature-plugin-update; preserve the user's skill-install configuration changes. Task tracing is unavailable (`npx ai-devkit@latest task list --name plugin-update --json` returned unknown command task); record evidence in implementation/testing docs instead.

Phase 5 loads dev-implementation and tdd. For each behavior, write a meaningful failing test, observe the expected failure, implement the smallest change, and rerun the focused suite. Load verify before completion claims. Reconcile this plan via phase 6 after each completed task; report the boundary for approval under the standing gate protocol. Do not commit, push, or open a PR until phases 8–9 pass.

## Ordered tasks

### T1 — Package version operations

- [x] Add installed-version and registry-latest reads plus explicit latest installation to the existing package service.

Dependencies: none. Extend NpmRunner output compatibly; preserve existing add/remove behavior. Validate npm names before paths or subprocesses, validate canonical versions, capture stdout, and attach operation/package context to errors. Version reads must not create files.

TDD scenarios: plain/scoped names, valid release/prerelease/build versions, leading-zero and malformed versions, invalid/empty/non-string JSON, missing manifests, rejected npm calls, exact view/install arguments and private cwd, and void-returning mutation runners. Exercise the default stdout capture path with a controlled child-process mock or isolated fixture.

Evidence: focused `plugin-package.service.test.ts` red/green output and existing package-service regressions. Covers testing Unit scenarios 1–3 and Phase 3 scenarios 1–3.

### T2 — Manager update orchestration

- [x] Add update selection and sequential per-plugin results without config writes or rollback.

Dependencies: T1. Validate target and configured membership before npm calls; read previous version before registry lookup; skip equal versions; otherwise install latest, read actual version, validate manifest, and retain metadata through every error.

TDD scenarios: targeted/all/empty selections, invalid/unconfigured target, equality without install or repair, differing versions, registry tag race, missing installed metadata, registry failure, install failure, post-install read failure, manifest failure after observing actual version, continued mixed bulk outcomes, and no config mutation/uninstall. Assert operation ordering and no concurrent installs.

Evidence: focused `plugin-manager.service.test.ts` red/green output plus existing add/remove/list regressions. Covers Unit scenarios 4–9, Phase 3 scenario 2 ordering, scenario 4 actual versions, and scenario 5 failure metadata.

### T3 — CLI command and result rendering

- [x] Register optional-target update command and render the three statuses, version deltas, major indicators, recovery context and summary.

Dependencies: T2. Derive counts and major flags from results; distinguish attempted target from observed version on failure. Preserve unknown metadata explicitly, warn for empty selection, and set exitCode 1 after printing failed results.

TDD scenarios: optional target forwarding, mixed results/counts, observed major change, patch/minor and unchanged versions, attempted major target on failure, unknown versions, every failure's previous-version text, zero/success/failure exit outcomes, and existing add/remove/list output. Restore process.exitCode between tests.

Evidence: focused `commands/plugin.test.ts` red/green output. Covers all Integration scenarios, Unit scenario 7 major display, and Phase 3 scenarios 4–7 rendering/exit behavior.

### T4 — Implementation alignment and coverage

- [x] Reconcile plan and implementation notes; perform phase 7 alignment and analysis-only simplification review.
- [x] Complete phase 8 testing review and close meaningful coverage gaps.

Dependencies: T1–T3. Load dev-implementation, verify and dev-simplify for phase 7; dev-testing and verify for phase 8. Compare every requirement/design contract to implementation. Apply simplification only where it improves the approved implementation. Record deviations and any coverage exceptions explicitly.

Evidence: dependency builds (`npm run build` as needed), focused coverage report targeting 100% changed code, package lint/format checks for changed files, and `npx nx run-many -t test -p cli`. Tests stay in packages/cli/tests; no tests enter src or published build input. Covers coverage/reporting, performance assertions and adjacent-command regressions.

### T5 — CLI smoke and final review

- [x] Run required dev-smoke against the real built CLI with disposable user state.
- [x] Complete phase 9 dev-review with verify and resolve all blocking findings.

Dependencies: T4. Use disposable HOME and PATH-controlled npm fixtures: update with observed major change, up-to-date with no install, mixed failure with continuation/nonzero status, and empty configuration. Assert live user state is untouched. Persistent E2E tests, if warranted, belong only in root e2e and run with its own vitest config.

Evidence: reproducible smoke command, assertions and exit codes, plus review findings/disposition. Covers both End-to-End scenarios and Phase 3 scenario 8. Record manual inspection of deltas/recovery text and command-count performance checks. Return to implementation/testing if smoke or review finds a defect.

### T6 — Sync and PR delivery

- [ ] After phases 8–9 pass, load dev-commit, dev-pr and verify; sync with origin/main and revalidate.
- [ ] Create conventional commit, push feature branch, and open PR via gh; report URL and stop.

Dependencies: T5. Fetch/rebase onto current origin/main (the user reports main moved to 0.76.1). Inspect upstream changes and resolve conflicts without changing scope. If meaningful changes result, return to affected lifecycle review/testing before delivery. Use fresh dependency installation/build if manifests or lockfile changed. For a clean rebase, rerun scoped tests and smoke against the rebased tree, plus required repository commit checks. Preserve unrelated user changes and never bypass hooks.

Evidence: rebase status, fresh verification output, reviewed staged diff, commit hash, push result and PR URL. No commit before the approved testing/review gates.

## Scenario coverage and risks

Every testing checklist scenario maps to T1 (package metadata/processes), T2 (selection/orchestration), T3 (display/status), T4 (coverage/regressions), or T5 (real CLI flow). T6 preserves that evidence after upstream sync. No migration or new dependency is planned.

Primary risks: registry latest moves during the operation; npm changes the installation before failing; manifest validation fails after installation; version metadata is absent or malformed. Preserve observed metadata, report unknown honestly, and never auto-rollback. Sequential operations avoid this command racing itself; cross-process locking remains outside the approved scope. Environment blockers must be reported immediately without live-state workarounds.

## Next gate

Phase 8 coverage and isolated CLI smoke passed; see testing notes for scenarios and coverage exception. Approve phase 9 dev-review with verify: inspect full feature diff and artifacts, check integration/publication risks and validation evidence, resolve any blocking findings. No commit/push/PR until phase 9 passes. After review, rebase onto origin/main, revalidate and deliver the PR per T6.


## Phase 5 / ongoing phase 6 reconciliation

T1–T3 implemented in order with observed red/green cycles. No new scope or blockers. Plan reconciled after each task; the orchestrator authorized uninterrupted execution through the phase 5 task queue. Next: phase 7 alignment/simplification, phase 8 formal coverage review, then required CLI smoke and phase 9 review. No commit/push/PR yet.


Phase 9 final review passed with no blocking findings. T6 delivery authorized; commit hooks, rebase and post-rebase validation remain before PR publication.
