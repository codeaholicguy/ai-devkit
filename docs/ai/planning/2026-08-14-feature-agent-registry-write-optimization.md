---
phase: planning
title: Agent Registry Write Optimization Plan
description: TDD plan for conditional writes and controlled pruning
---

# Plan

## Task Queue

- [x] Add SQL operation tracing and fake-clock test fixtures.
- [x] Red: prove unchanged refreshes currently write and transact.
- [x] Green: skip unchanged upserts and the surrounding write transaction.
- [x] Red/green: persist changed fields exactly once and retain `updated_at` meaning.
- [x] Red/green: add 30-second passive prune cadence plus immediate forced prune.
- [x] Red/green: cover dead-name cleanup, cross-type PID reuse, and rename conflicts.
- [x] Update implementation/testing records and cross-check design alignment.
- [x] Run focused and full agent-manager/CLI tests, lint, typecheck, builds, and docs lint.
- [ ] Commit, rebase on `origin/main`, push, and open a PR without merging.

## Risks

- Preflight comparisons could race with another process. Mitigation: re-read and re-merge entries inside the single write transaction.
- Cadence could delay stale-name cleanup. Mitigation: keep `prune()` forced, preserve targeted conflict liveness checks, and bound passive delay to 30 seconds.
- Process-snapshot work could cause merge conflicts. Mitigation: land registry work first and rebase snapshot work afterward.
