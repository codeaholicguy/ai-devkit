---
phase: planning
title: AI DevKit Status Command Plan
description: Ordered TDD implementation and validation tasks for status readiness reporting
feature: status-command
---

# Planning: AI DevKit Status Command

## Milestones

- [x] Milestone 1: Requirements approved and committed.
- [x] Milestone 2: Architecture and output contract designed.
- [ ] Milestone 3: Canonical status service implemented through TDD.
- [ ] Milestone 4: CLI registration and human/JSON rendering implemented.
- [ ] Milestone 5: Documentation, full validation, and final review completed.
- [ ] Milestone 6: Branch published and pull request opened.

## Ordered Task Breakdown

### Phase 1: Canonical model and pure behavior

- [ ] **Task 1.1 — Define report types and aggregation helpers**
  - Outcome: typed per-agent/subsystem report with `pass | warn | fail`, auth states, deterministic leaf counts, and worst-status aggregation.
  - Dependencies: requirements output contract and design data model.
  - TDD: red tests for status precedence, leaf counting, empty arrays, and explicit nulls.
  - Evidence: targeted status service tests and TypeScript build.
  - Covers: AC-11, AC-12.

- [ ] **Task 1.2 — Add injectable status runtime boundary**
  - Outcome: service accepts cwd/home/PATH/time plus filesystem, command, npm, asset, and Codex-auth dependencies.
  - Dependencies: Task 1.1.
  - TDD: red test builds a complete report without reading the real machine.
  - Evidence: targeted service test proves deterministic output and independent probes.
  - Covers: AC-12, AC-13, AC-14.

### Phase 2: Local agent readiness checks

- [ ] **Task 2.1 — Executables and global configuration directories**
  - Outcome: Codex, Pi, and Claude report resolved executable paths plus directory presence/readability.
  - Dependencies: Task 1.2; reuse `AGENTS` command names and environment path definitions.
  - TDD: mixed-present/missing executables and directories.
  - Evidence: targeted tests.
  - Covers: AC-01, AC-02.

- [ ] **Task 2.2 — Built-in skills per agent**
  - Outcome: compare `BUILTIN_SKILL_NAMES` against three global skill roots, returning counts and missing names only.
  - Dependencies: Task 1.2.
  - TDD: complete, partial, and absent skill roots; assert no skill-index dependency.
  - Evidence: targeted tests.
  - Covers: AC-03, AC-14.

- [ ] **Task 2.3 — Codex, Claude, and Pi integration hooks**
  - Outcome: validate installed assets and registrations; validate Codex/Pi mapping files with missing/malformed/stale distinctions.
  - Dependencies: Task 1.2 and packaged assets.
  - TDD: correct/missing/mismatched scripts, unrelated hook preservation, malformed JSON, invalid entries, stale paths, absent registries.
  - Evidence: targeted tests.
  - Covers: AC-04, AC-12, AC-13.

- [ ] **Task 2.4 — Authentication state**
  - Outcome: map safe Codex auth result, parse Claude auth status, and structurally evaluate Pi auth without overclaiming validity.
  - Dependencies: Task 1.2 and existing Codex capacity API.
  - TDD: authenticated/unauthenticated/unknown, timeouts, malformed outputs, secret-sentinel failures.
  - Evidence: targeted tests proving no credential/raw error output.
  - Covers: AC-05, AC-13, AC-14.

### Phase 3: Shared subsystem checks

- [ ] **Task 3.1 — tmux readiness**
  - Outcome: resolved path and `tmux -V` result without requiring a server.
  - Dependencies: executable helper.
  - TDD: installed, absent, and command-failure cases.
  - Evidence: targeted tests.
  - Covers: AC-06.

- [ ] **Task 3.2 — Channel config validity and local readiness**
  - Outcome: distinguish absent/malformed/root-invalid config and validate secret-free Telegram/Slack projections.
  - Dependencies: Task 1.2 and channel connector types/rules.
  - TDD: ready/unready/disabled entries, malformed tokens, missing identity/authorization, unsupported types, secret sentinels, and assertion that no live connector runs.
  - Evidence: targeted tests.
  - Covers: AC-07, AC-13, AC-14.

- [ ] **Task 3.3 — Project config and registries**
  - Outcome: report project config presence/structure/environment validity and project/global registry provenance.
  - Dependencies: canonical environment validators and registry normalization helper.
  - TDD: absent, malformed, invalid environment, valid config, malformed global config, and mixed registry values.
  - Evidence: targeted tests.
  - Covers: AC-08, AC-10, AC-12.

- [ ] **Task 3.4 — Installed/latest version**
  - Outcome: compare installed package version with npm latest; npm failures yield warning/nulls.
  - Dependencies: injected command boundary and semver-safe equality/order.
  - TDD: same/newer/latest and npm unavailable/invalid output.
  - Evidence: targeted tests.
  - Covers: AC-09, AC-12.

### Phase 4: Command and rendering

- [ ] **Task 4.1 — Register `status` command**
  - Outcome: top-level command supports `-j, --json`, uses `withErrorHandler`, and invokes one report reader.
  - Dependencies: completed service.
  - TDD: Commander registration and dependency invocation.
  - Evidence: command test.
  - Covers: command UX and AC-11.

- [ ] **Task 4.2 — Canonical JSON renderer**
  - Outcome: exact pretty JSON with no alternate transformation.
  - Dependencies: Task 4.1.
  - TDD: captured stdout deep-equals supplied report and secret sentinel is absent.
  - Evidence: command test.
  - Covers: AC-11, AC-13.

- [ ] **Task 4.3 — Human renderer**
  - Outcome: shared `ui.table` sections use cyan identifiers, green/yellow/red statuses, and dim evidence; missing skills/errors render safely.
  - Dependencies: Task 4.1 and existing terminal UI conventions.
  - TDD: mocked `ui` calls for sections, rows, and status styles.
  - Evidence: command test.
  - Covers: approved human rendering and AC-13.

### Phase 5: Documentation and gates

- [ ] **Task 5.1 — Maintain implementation and testing docs**
  - Outcome: record changed files, decisions, deviations, security handling, scenarios, and current task state.
  - Dependencies: update after every implementation milestone.
  - Evidence: feature lint recognizes all five lifecycle documents.

- [ ] **Task 5.2 — Targeted and coverage validation**
  - Outcome: all new status tests pass and new/changed logic has meaningful happy/error/security coverage.
  - Dependencies: implementation complete.
  - Evidence: CLI status test command and CLI coverage command.

- [ ] **Task 5.3 — Repository validation**
  - Outcome: six-project build, full test suite, and repository/feature lint pass.
  - Dependencies: all code/docs complete.
  - Evidence: fresh command output recorded in testing doc.

- [ ] **Task 5.4 — Final lifecycle review**
  - Outcome: requirements/design alignment, caller tracing, security, dependency, scope, and rollback review has no blocking findings.
  - Dependencies: Task 5.3.
  - Evidence: review checklist and clean Git diff.

- [ ] **Task 5.5 — Publish for review**
  - Outcome: fetch/rebase onto latest `origin/main`, rerun relevant gates if rewritten, push branch, and open PR without merging.
  - Dependencies: Task 5.4 and clean committed worktree.
  - Evidence: remote branch and PR URL.

## Dependencies and Sequencing

- Tasks 1.1–1.2 establish the contract and test seams before check implementation.
- Tasks 2.1–3.4 may share pure helpers but are executed sequentially through red/green/refactor cycles to preserve TDD evidence.
- Command/rendering tasks depend on a stable service report.
- Documentation is updated during implementation, not deferred until the final gate.
- Full validation runs only after targeted status tests pass.
- Push and PR creation occur only after final review and a clean committed worktree.
- Optional task tracing is unavailable in CLI 0.55.0 (`unknown command 'task'`), so lifecycle progress remains in this plan and commits.

## Risks and Mitigations

- **Secret leakage from provider/config failures:** replace raw failures with fixed messages; test recognizable sentinels across every output path.
- **Status totals drift from nested aggregates:** count explicit leaf checks once through one helper and test exact counts.
- **Real-machine coupling:** inject filesystem/process/network boundaries; never read actual home state in unit tests.
- **Slow or hanging subprocesses:** apply bounded timeouts and make timeout a reportable finding.
- **Channel parser hides corruption:** read raw channel file instead of the repository fallback API.
- **Pi package listing varies by CLI version:** isolate parsing behind one dependency and treat unrecognized output as unknown/failure without raw output.
- **Npm outage:** warn and preserve all other findings.
- **Scope creep into live operations:** no calls to agent listing, sessions, capacity rendering, channel networking/bridges, registry fetch, task/memory, or Git inventory.

## Validation Matrix

| Gate | Command |
|---|---|
| Status unit/command tests | `npm test --workspace=ai-devkit -- --run <status test paths>` |
| CLI coverage | `npm test --workspace=ai-devkit -- --coverage` |
| Six-project build | `npm run build` |
| Full repository tests | `npm test` |
| Base docs lint | `npx ai-devkit@latest lint` |
| Feature docs/worktree lint | `npx ai-devkit@latest lint --feature status-cmd` |
| Diff integrity | `git diff --check` and final review |

## Progress Summary

Requirements and design are complete. Implementation has not started. The immediate next action is Task 1.1: write failing tests for the report/status aggregation contract, then add the minimum types and helpers to pass them.
