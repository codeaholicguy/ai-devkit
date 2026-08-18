---
phase: planning
title: Durable Agents SQLite Plan
description: Ordered implementation and validation tasks
---

# Durable Agents SQLite Plan

## Milestones

- [x] Foundation: schema migration, connection behavior, and path mapping.
- [x] Store backend: migration import and transactional CRUD/ownership behavior.
- [x] Validation: parity, concurrency, recovery, full gates, and review.

## Task Breakdown

### Phase 1: Foundation

- [x] Add failing schema tests for constraints, case-insensitive uniqueness, indexes, and migration version; implement `003_durable_agents.sql`. Evidence: focused database tests.
- [x] Add failing readonly-connection tests; make readonly open require an existing migrated database without writes. Evidence: file metadata/schema behavior tests.
- [x] Add failing JSON-to-database injected-path tests; implement `dbPath` precedence and registry-compatible mapping. Evidence: focused store constructor tests.

### Phase 2: Store Backend

- [x] Retarget identity, name conflict, canonical cwd, listing, result, and session-resume tests to SQLite; replace JSON CRUD with row mapping and transactions. Evidence: `PrintAgentStore` and Claude integration suites.
- [x] Add migration success, failure, idempotence, symlink rejection, backup, and rollback tests; implement one-time import and marker. Evidence: migration-focused tests and intact source on failure.
- [x] Retarget busy ownership, token rejection, provider liveness, and interrupted reconciliation tests; implement immediate transactions and token/observed-identity CAS. Evidence: focused ownership tests.
- [x] Add two-connection race, transaction interruption/reopen, and corrupt-database mapping tests. Evidence: concurrency/recovery tests.
- [x] Remove global/per-agent lock machinery and obsolete file-mode assertions; document accepted-but-unused options. Evidence: source search and type tests.

### Phase 3: Integration & Polish

- [x] Update implementation/testing docs after each completed group and reconcile this checklist.
- [x] Run implementation alignment check and close discovered gaps.
- [x] Run targeted coverage plus full workspace test, lint, typecheck, and build gates.
- [x] Conduct holistic review, commit conventionally, sync/rebase, and push. PR creation is the immediate publication step.

## Dependencies and Sequencing

Schema and readonly connection behavior precede the store rewrite. Row mapping precedes migration import and CAS operations. Focused tests precede full gates. `npm ci` and `npm run build` must run before any full gate or commit; both completed during workspace setup.

## Risks & Mitigation

- Competing migration number: inspect latest `origin/main` during final rebase and renumber if needed.
- Provider PR overlap: preserve provider as unconstrained text and reconcile `PrintAgentStore` conflicts minimally if either PR lands.
- One-way migration: keep the post-commit backup and document export-based rollback.
- PID reuse: include process start time in stale-observation CAS predicates.
- Long write locks: keep process inspection and filesystem validation outside immediate transactions.

## Progress Summary

All implementation, validation, and review tasks are complete. No scope changes, blocking findings, or design deviations were found. The branch is synchronized with `origin/main`; only PR creation remains.
