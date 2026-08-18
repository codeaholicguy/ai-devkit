---
phase: planning
title: Durable Agents SQLite Plan
description: Ordered implementation and validation tasks
---

# Durable Agents SQLite Plan

## Milestones

- [ ] Foundation: schema migration, connection behavior, and path mapping.
- [ ] Store backend: migration import and transactional CRUD/ownership behavior.
- [ ] Validation: parity, concurrency, recovery, full gates, and review.

## Task Breakdown

### Phase 1: Foundation

- [ ] Add failing schema tests for constraints, case-insensitive uniqueness, indexes, and migration version; implement `003_durable_agents.sql`. Evidence: focused database tests.
- [ ] Add failing readonly-connection tests; make readonly open require an existing migrated database without writes. Evidence: file metadata/schema behavior tests.
- [ ] Add failing JSON-to-database injected-path tests; implement `dbPath` precedence and registry-compatible mapping. Evidence: focused store constructor tests.

### Phase 2: Store Backend

- [ ] Retarget identity, name conflict, canonical cwd, listing, result, and session-resume tests to SQLite; replace JSON CRUD with row mapping and transactions. Evidence: `PrintAgentStore` and Claude integration suites.
- [ ] Add migration success, failure, idempotence, symlink rejection, backup, and rollback tests; implement one-time import and marker. Evidence: migration-focused tests and intact source on failure.
- [ ] Retarget busy ownership, token rejection, provider liveness, and interrupted reconciliation tests; implement immediate transactions and token/observed-identity CAS. Evidence: focused ownership tests.
- [ ] Add two-connection race, transaction interruption/reopen, and corrupt-database mapping tests. Evidence: concurrency/recovery tests.
- [ ] Remove global/per-agent lock machinery and obsolete file-mode assertions; document accepted-but-unused options. Evidence: source search and type tests.

### Phase 3: Integration & Polish

- [ ] Update implementation/testing docs after each completed group and reconcile this checklist.
- [ ] Run implementation alignment check and close discovered gaps.
- [ ] Run targeted coverage plus full workspace test, lint, typecheck, and build gates.
- [ ] Conduct holistic review, commit conventionally, sync/rebase, push, and open the requested PR.

## Dependencies and Sequencing

Schema and readonly connection behavior precede the store rewrite. Row mapping precedes migration import and CAS operations. Focused tests precede full gates. `npm ci` and `npm run build` must run before any full gate or commit; both completed during workspace setup.

## Risks & Mitigation

- Competing migration number: inspect latest `origin/main` during final rebase and renumber if needed.
- Provider PR overlap: preserve provider as unconstrained text and reconcile `PrintAgentStore` conflicts minimally if either PR lands.
- One-way migration: keep the post-commit backup and document export-based rollback.
- PID reuse: include process start time in stale-observation CAS predicates.
- Long write locks: keep process inspection and filesystem validation outside immediate transactions.

## Progress Summary

Requirements, architecture, rollout, and validation scope are fixed by the approved brief. Workspace bootstrap is complete. Implementation begins with failing foundation tests, proceeds through the SQLite adapter and import, then closes with concurrency/recovery validation and full gates.
