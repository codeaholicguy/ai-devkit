---
phase: planning
title: Agent group daemon implementation plan
description: Ordered TDD tasks and validation gates for issue 413
---

# Implementation plan

Requirements and the three design rulings are approved. Dependencies below are
sequential; each task starts with failing behavioral tests, then implementation
and focused green checks. Reconcile this checklist after each completed task.

- [x] P1: Add core ordered group storage, domain errors and transactional CRUD.
  Depends on approved design; covers R2/R5 and T1-T3. Evidence: focused core tests
  fail before implementation, pass afterward; persistence/concurrency verified.
- [x] P2: Add atomic version-1 JSON import, ownership fence and post-commit cleanup.
  Depends on P1; covers R4 and T4-T5. Evidence: import rollback/restart/recreated
  source tests and cleanup retry tests, including absent source ownership.
- [x] P3: Add typed protocol and eight group RPCs, initialize import without
  disrupting unrelated daemon calls, map domain errors. Depends on P1/P2;
  covers R1/R5 and T6. Evidence: RPC integration and generated binding checks.
- [x] P4: Add daemon client methods and asynchronous CLI group service; route
  seven commands with availability/capability handling and no JSON fallback.
  Depends on P3; covers R1/R5/R6 and T7. Evidence: client and CLI routing/error
  tests including all domain categories and daemon/transport failure.
- [x] P5: Route group fanout through group.lookup and strict per-member agent.lookup
  while preserving delivery/reporting. Depends on P4; covers R3/R6 and T8.
  Evidence: target-order and missing/dead-member tests; single-agent regressions.
- [x] P6: Build dependencies and add real-daemon/built-CLI root E2E. Depends on P5;
  covers T9. Evidence: npx vitest run --config e2e/vitest.config.ts with isolated
  fixtures, plus full cargo tests and npx nx test cli.
- [x] P7: Verify implementation against design, analysis-only simplification pass,
  coverage review, disposable-home smoke and final code review. Depends on P6;
  covers T10-T11. Evidence: smoke, lint, format, clippy and review findings resolved.
- [ ] P8: Fetch/rebase onto origin/main without incorporating PR #456 as a
  dependency, rerun affected validation, then safe commit, push and open PR.
  Depends on every prior gate; covers A8. Record PR URL and stop after creation.

## Risks and sequencing

Import commit and filesystem unlink cannot share a transaction: ownership must
commit first; cleanup errors are warnings, retried next startup, never imports.
Old CLI writers must stop before upgrade. Preserve existing error precedence and
fanout reporting while removing legacy reads. Inspect main's protocol generation
rather than hand-maintaining generated types. Keep unrelated changes out of the
commit. Rebase conflicts or new main changes require renewed affected checks.

## Status

P1-P6 implemented. Implementation/coverage review and smoke passed; final format
and suite checks in progress before publication. P7/P8 remain pending final evidence. Optional task tracing is
unavailable: npx ai-devkit@latest task list --name group-daemon --json returned
unknown command 'task'. Track progress and evidence in these feature documents.

Rebased successfully onto origin/main 30da3467 using a temporary autostash of
this task's tracked changes. No conflicts; PR #456 remains open. P8 validation,
commit and publication follow.

Final post-rebase validation passed: build, workspace tests, 53 E2E tests, six
smoke checks, lint, fmt and clippy. P8 implementation/rebase/validation complete;
commit/push/PR are the remaining publication steps at this checkpoint.
