---
phase: requirements
title: Agent Registry Write Optimization Requirements
description: Avoid redundant registry writes and bound passive stale-entry pruning
---

# Agent Registry Write Optimization

## Problem

`AgentManager.listAgents()` is called every three seconds by the console. Every refresh currently upserts every detected agent, advances `updated_at`, and opens a write transaction even when no persisted field changed. It also scans every registry row for process liveness and opens a prune transaction on every refresh.

## Goals

- Perform zero SQLite writes and no write transaction for an unchanged refresh.
- Persist each changed or new entry once, while retaining atomic batch behavior.
- Define `updated_at` as the time a persisted field actually changed.
- Put passive pruning on a deterministic cadence so console polling does not scan every three seconds.
- Keep an immediate forced prune for start and other correctness-sensitive callers.
- Preserve name conflict cleanup, rename behavior, live-process checks, PID reuse safeguards, and the existing SQLite schema/migrations.
- Preserve existing public calls to the `AgentRegistry` constructor, `register`, `registerBatch`, `prune`, `rename`, `lookup`, and `list`.

## Success Criteria

- SQL operation-count tests prove an unchanged refresh issues zero write statements.
- A changed field produces one row upsert in one batch transaction and advances `updated_at` once.
- A fake clock proves passive pruning runs immediately, is skipped before 30 seconds, and removes newly dead rows at 30 seconds.
- `prune()` remains an immediate forced operation independent of the passive cadence.
- Dead name conflicts, cross-type PID reuse, and rename conflicts retain their cleanup/error behavior.
- Focused and full agent-manager and CLI tests, lint, typecheck, and builds pass.

## Scope Boundaries

- Do not add or consume a shared process snapshot.
- Do not change adapter process enumeration or console refresh scheduling.
- Do not change the database schema or migration history.
- Same-type PID reuse remains the previously accepted limitation because reliable detection requires process-start metadata.

## Integration Constraint

The separate `feature-console-main-thread-responsiveness` work may replace repeated adapter process enumeration with a per-refresh process snapshot. This feature must land first because it changes only registry persistence and prune scheduling. The snapshot branch should then rebase on this work and preserve the write-elision/cadence tests while resolving any overlap in `AgentManager.ts` and `AgentManager.test.ts`.
