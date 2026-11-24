---
phase: planning
title: Agent group daemon implementation plan
description: Ordered TDD tasks and validation gates for issue 413
---

# Implementation plan

Requirements and design decisions are approved. Tasks below were executed
sequentially with TDD and reconciled after review, simplification, and removal
of the unused legacy JSON migration path.

- [x] P1: Add core ordered group storage (`groups`, `group_members`), domain
  errors, and transactional CRUD in `devkit-core`.
- [x] P2: Add typed protocol structs (`ts-rs` bindings) and all eight `group.*`
  RPCs in `devkitd` with coded domain error mapping.
- [x] P3: Add typed group methods to `DaemonClient` and asynchronous
  `AgentGroupService`; route all seven `agent group` commands (plus `--debug`)
  and `agent wait --group` with availability/capability handling and no JSON
  fallback.
- [x] P4: Route `agent send --group` through a single daemon connection
  (`group.lookup` + strict per-member `agent.lookup`) while preserving ordered
  client-side delivery and per-member reporting.
- [x] P5: Build workspace dependencies and add real-daemon/built-CLI root E2E
  (`e2e/agent-groups.e2e.ts`) with isolated fixtures and dead stub
  registrations.
- [x] P6: Rebase onto `origin/main` (`7528c760`), resolve review findings,
  run simplification pass, add `--debug` support, and remove the unused legacy
  `agent-groups.json` migration path.
- [x] P7: Re-run full workspace build, Rust/TS/E2E tests, formatting, lint,
  clippy, and feature docs lint.

## Risks and sequencing

- Preserve existing validation/error precedence and fanout reporting while
  enforcing daemon availability without silent fallback.
- Keep TypeScript unit/integration tests under `packages/<pkg>/tests/` and E2E
  tests under root `e2e/`.
- Keep generated `packages/daemon-client/src/gen/*.ts` bindings synchronized
  with `devkit-core` via `ts-rs`.

## Status

All tasks (P1–P7) are complete on branch `feature-group-daemon` (PR #458),
rebased onto `origin/main` (`7528c760`). Legacy `agent-groups.json` migration
code was removed per the 2026-11-24 decision since no users rely on it yet.
