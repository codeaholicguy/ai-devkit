---
phase: testing
title: Session Reconciliation Test Strategy
description: Required regressions and repository gates
---

# Session Reconciliation Test Strategy

## Required regressions

- [x] Name, pin, tmux, and start metadata survive same-session PID migration and
  restoration from soft deletion.
- [x] A different session reusing a PID inherits nothing; the old row is
  soft-deleted and later restorable.
- [x] Undetected rows receive `deleted_at` and remain stored.
- [x] Thrown adapter types remain untouched.
- [x] Successful empty results soft-delete their type; globally successful empty
  detection soft-deletes all interactive rows.
- [x] Blind sandbox detection followed by full detection restores all metadata.
- [x] An injected mid-transaction constraint failure rolls back every mutation.
- [x] Refresh and pin paths never invoke a process-liveness probe.
- [x] Kill hard-deletes live or soft-deleted rows without signaling a stale PID.
- [x] Display remains detected/restored-only.
- [x] Migration reaches schema version 5 and creates `deleted_at` plus
  `idx_agents_identity` without changing `durable_agents`.

## Fresh evidence

- Focused agent-manager suites: 93/93 passed.
- Focused CLI suites: 110/110 passed.
- Full agent-manager package: 626/626 passed before the final compatibility
  additions; it will be rerun in the complete gate.

## Repository gates

- [x] Build: all six projects passed.
- [x] Full tests: all six projects passed (1,084 CLI, 627 agent-manager,
  115 channel-connector, 113 memory, 112 task-manager, 22 dashboard).
- [x] Lint: all six projects passed with four pre-existing warnings and zero errors.
- [x] E2E: 41/41 passed.

Regression reversal removed the implementation while retaining the tests:
18 agent-manager and 2 CLI regressions failed, then 93/93 and 110/110 passed
after restoration.
