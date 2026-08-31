---
phase: testing
title: Session Reconciliation Test Strategy
description: Required regressions and repository gates
---

# Session Reconciliation Test Strategy

## Required regressions

- [x] Name, pin, tmux, and start metadata survive same-session PID migration.
- [x] Empty and `pid-*` start rows adopt a detected bound identity without metadata loss.
- [x] Bound different-session PID reuse inherits nothing and deletes the old row.
- [x] Undetected rows are hard-deleted; thrown adapter types remain untouched.
- [x] Successful type/global empty results delete the corresponding interactive rows.
- [x] Blind detection deletes metadata and later detection regenerates defaults (accepted).
- [x] Mid-transaction failure rolls back every mutation.
- [x] Refresh and pin paths never invoke a process-liveness probe.
- [x] Explicit kill deletes rows, including retained adapter-error rows.
- [x] Display remains detected-only.
- [x] Schema version 5 creates `idx_agents_identity` without `deleted_at` or durable changes.

## Fresh evidence

- Focused agent-manager suites: 95/95 passed.
- Focused CLI suites: 110/110 passed.

## Repository gates

- [x] Build: all six projects passed; agent-manager rebuild also verified clean migration output.
- [x] Full tests: all six projects passed.
- [x] Lint: all six projects passed with four pre-existing warnings and zero errors.
- [x] E2E: 41/41 passed after removing the stale migration artifact at build time.
