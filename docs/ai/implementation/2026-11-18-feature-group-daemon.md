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
- [ ] P4: Add daemon client methods and asynchronous CLI group service; route
  seven commands with availability/capability handling and no JSON fallback.
  Depends on P3; covers R1/R5/R6 and T7. Evidence: client and CLI routing/error
  tests including all domain categories and daemon/transport failure.
- [ ] P5: Route group fanout through group.lookup and strict per-member agent.lookup
  while preserving delivery/reporting. Depends on P4; covers R3/R6 and T8.
  Evidence: target-order and missing/dead-member tests; single-agent regressions.
- [ ] P6: Build dependencies and add real-daemon/built-CLI root E2E. Depends on P5;
  covers T9. Evidence: npx vitest run --config e2e/vitest.config.ts with isolated
  fixtures, plus full cargo tests and npx nx test cli.
- [ ] P7: Verify implementation against design, analysis-only simplification pass,
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

P1-P3 implemented with focused red/green evidence. P4 in progress. Optional task tracing is
unavailable: npx ai-devkit@latest task list --name group-daemon --json returned
unknown command 'task'. Track progress and evidence in these feature documents.


P4-P6: all seven CLI group commands now await daemon calls; the JSON service was
removed. Generated Rust protocol types expose ordered groups and request params.
Daemon-client tests: 8 red missing-method failures, then 8 green. Group-service
tests: 17 red legacy-routing failures, then 17 green including error mapping and
availability. An initial red fixture accidentally wrote a test-only group at the
default home; the verified single fixture was removed and home resolution was
isolated. No existing group data was present in that file.

Fanout red: 5 failures against legacy resolution. Green focused suite initially
left one stale assertion expecting no daemon use; updated that assertion to the
approved behavior. The full CLI suite subsequently passed 1497 tests. Fanout now
resolves exact registered members, refuses all sends if any lookup fails/dead,
deduplicates targets, and preserves ordered delivery and per-member summaries.
It reuses sendAgentPrompt and the extracted daemon-entry registry helper for
runtime selection; single-agent callers retain the same helper implementation.
Status is unknown from agent.lookup, so existing unknown-status warnings apply.

The build identified agent wait --group as another in-repo group-service caller;
it now awaits authoritative daemon detail. Its async membership regression is
covered by command tests. No change to wait's status-watching behavior.

Real-daemon E2E uses a transparent socket recorder and dead stub registrations.
All responses come from devkitd; observed group.lookup and ordered agent.lookup
requests prove fanout targeting without terminal sends. Full E2E: 53 passed.
Disposable smoke passed import/list/detail/deletion, conflict/empty/name errors,
restart fence against malformed recreated JSON, cleanup failure reporting,
next-startup cleanup retry and daemon-unavailable behavior.

Analysis-only simplification review: obsolete JSON and local group resolution
paths removed; no additional abstraction needed. Shared daemon-entry conversion
was moved to the service layer to avoid a service-to-command dependency.
Review covered caller migration, domain/error precedence, SQL transaction/fence
boundaries, source cleanup, ordering, wire contracts and runtime delivery.
Added a write-failure trigger test proving membership/timestamp and create rollback.
Daemon RPC tests live outside src in tests/rpc/groups.rs.

Fetched origin/main at 30da3467 (Cursor Marketplace metadata only); PR #456 remains
open and unmerged. Rebase and final publication still pending.


Review complete with no remaining blockers. SQL fault injection proves rollback;
all group state readers were traced, including wait. No new dependencies or
unrelated changes. User-facing upgrade/rollback guidance added to README.
Rebase onto origin/main 30da3467 succeeded without conflicts; only upstream delta
was unrelated Cursor metadata. Final post-rebase evidence follows in testing doc.

All post-rebase validation gates passed; final evidence is in the testing doc.
Implementation and review are complete. Publication is the remaining step.
