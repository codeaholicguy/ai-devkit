---
phase: testing
title: Agent group validation plan
description: Acceptance coverage and evidence for issue 413
---

# Agent group validation

## Scenarios

- [x] T1 (A1/A2): CRUD, insertion/member order, persistence and timestamp behavior.
- [x] T2 (A2/A3): normalization, duplicate/blank/empty rejection, domain error
  precedence, no-op add, absent-member and final-member removal.
- [x] T3 (A1/A2): concurrent mutations and transaction rollback preserve invariants.
- [x] T4 (A5): valid, absent, malformed, unsupported-version, invalid-domain and
  conflicting imports; all-or-nothing data and fence with preserved timestamps.
- [x] T5 (A6): pre/post-commit restart boundaries, recreated source and deleted-group
  resurrection prevention; failed cleanup reported and retried at next startup.
- [x] T6 (A1/A3): eight RPCs, malformed wire types and coded domain errors.
- [x] T7 (A1/A3/A7): seven CLI routes, client requests, error mapping, unsupported
  methods, unavailable daemon and transport failure without legacy fallback.
- [x] T8 (A4): ordered group.lookup then agent.lookup targeting, missing/dead members
  and existing per-member reporting; ordinary single-agent path unchanged.
- [x] T9 (A8): root E2E through built CLI and real daemon: create/add/send/detail/list
  using stub registration or wire targeting verification; disposable HOME only.
- [x] T10 (A8): smoke import/fence/restart, conflict and empty-members errors,
  list/detail after import with real built CLI.
- [x] T11 (A8): full Rust and CLI suites, dependency build, lint, fmt, clippy,
  implementation review and post-rebase verification before commit/push/PR.

## Fixtures and placement

Rust core store tests and daemon integration tests follow main's crate layout.
TypeScript unit/integration tests stay in packages/<pkg>/tests; root e2e uses its
own vitest configuration. Use isolated database paths, disposable HOME/data
paths, controlled source fixtures and stub agent registrations, never real agents.
Use deterministic cleanup-failure injection instead of permissions when running
as a privileged user. Protocol tests assert errors and state, not only call counts.

## Coverage target and evidence

Every acceptance criterion A1-A8 must have evidence. TDD starts with a failing
behavior test before production changes. Capture red/green command output during
implementation, then record exact final command results here. No numeric coverage
threshold is imposed; cover failure/ownership branches explicitly. Evidence below records the executed checks. Final post-rebase checks remain pending.


## Evidence before rebase

- Core groups: cargo test --manifest-path rust/Cargo.toml -p devkit-core --test
  groups: 9 passed, including injected SQL write rollback.
- RPC: cargo test --manifest-path rust/Cargo.toml -p devkitd group_tests: 2 passed.
- Full cargo test workspace: passed before the added rollback coverage; rerun pending.
- npm run build: exit 0 after migrating the wait --group caller.
- npx nx test cli: exit 0, 115 files / 1497 tests; rerun after final cleanup pending.
- npx nx test daemon-client: exit 0, 4 files / 28 tests.
- npx vitest run --config e2e/vitest.config.ts: exit 0, 4 files / 53 tests.
- npm run lint: exit 0; existing unrelated warnings, new unused imports removed.
- cargo clippy --workspace --all-targets -- -D warnings: exit 0.
- Smoke: python3 /tmp/group-daemon-smoke.py: exit 0, six checks passed.
- Feature docs lint: 12 checks passed. Format recheck pending after test cleanup.

TDD evidence is recorded in the implementation document. This feature is not a
bug fix; missing-behavior red/green tests precede production implementation.
Skills loaded: dev-lifecycle, dev-worktree, dev-design, dev-requirements,
dev-planning, dev-implementation, tdd, memory, verify, dev-testing, dev-simplify,
dev-smoke, dev-review. Task tracing skipped (installed CLI lacks task command).


## Final post-rebase evidence

Rebased onto origin/main 30da3467 without conflicts; no dependency on open PR #456.
All commands below exited 0:

- npm run build: all seven projects built.
- npm run test: all seven projects passed; CLI 1498, daemon-client 28, and Rust
  191 unit/integration tests. The agent-manager suite retains 12 existing skips.
- npx vitest run --config e2e/vitest.config.ts: 53 tests passed across four files.
- npm run lint: all six configured lint projects passed; existing unrelated
  warnings remain, no newly introduced unused imports.
- npm run fmt:check and cargo fmt --all -- --check: passed.
- cargo clippy --workspace --all-targets -- -D warnings: passed.
- python3 /tmp/group-daemon-smoke.py: six disposable-home checks passed again.
- npx ai-devkit@latest lint --feature group-daemon: 12 checks passed.
- git diff --check: passed.

Code/design and analysis-only simplification reviews found no remaining blockers.
No tests were added under TypeScript src. Smoke script and fixtures are disposable;
only the permanent root E2E and package/crate tests are included in the change.
Skills loaded additionally for publication: dev-commit and dev-pr. Skipped: task
tracing (unsupported installed command); no requested validation gate skipped.
