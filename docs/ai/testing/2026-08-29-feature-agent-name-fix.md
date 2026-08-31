---
phase: testing
title: Registry Reconciliation Test Strategy
description: Focused regressions and repository gates
---

# Registry Reconciliation Test Strategy

## Required regressions

- [x] Name, tmux mapping, and pin survive first detection through empty-row binding.
- [x] Name and managed metadata survive same-session PID rollover.
- [x] Empty-session detections cause no insert, update, delete, or display entry.
- [x] Bound PID reuse deletes the old row and inserts without metadata inheritance.
- [x] Undetected bound rows are hard-deleted; empty-session rows remain.
- [x] Adapter exceptions skip their type; successful empty results delete bound rows.
- [x] Refresh and pin paths perform no liveness probe.
- [x] Kill reaches a skipped empty-session start row by registry name.
- [x] Schema remains version 4 with no interactive identity migration or index.

## Fresh evidence

- Focused agent-manager suites: 95/95 passed.
- Focused CLI suites: 110/110 passed.

## Repository gates

- [x] Build: all six projects passed.
- [x] Full tests: all six projects passed sequentially with workspace-backed `TMPDIR`.
- [x] Lint: all six projects passed with four pre-existing warnings and zero errors.
- [x] E2E: 41/41 passed.
