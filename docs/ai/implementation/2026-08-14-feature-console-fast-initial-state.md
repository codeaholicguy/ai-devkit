---
phase: implementation
title: Agent Console Fast Initial State Implementation
description: Implementation notes for cached first-frame rendering and live reconciliation
---

# Agent Console Fast Initial State Implementation

## Changed Areas

- `AgentManager.ts` exposes a synchronous, read-only cached identity snapshot filtered by adapter registration and PID liveness.
- `useAgentList.ts` converts snapshots to `unknown` placeholders in its lazy initial state, tracks cached PIDs and initial refreshing state, and clears both atomically on live success.
- `AgentListPane.tsx` marks cached rows, uses cwd rather than a fabricated summary, and keeps refresh errors visible alongside retained cached rows.
- `StatusFooter.tsx` distinguishes cached refresh, cached refresh failure, initial no-cache loading, and normal live update states.
- `PreviewPane.tsx` replaces registry-derived relative time with an explicit cached refresh label until live reconciliation.

## Compatibility

`listAgents()`, registry writes/pruning, sorting, adapter error handling, polling cadence, refresh in-flight suppression, and every non-console caller remain unchanged. No schema or dependency change is introduced.

## Merge Note

Merge before `feature-console-main-thread-responsiveness` when possible. Both branches may touch console list state; retain this branch's synchronous snapshot initializer and atomic live replacement while accepting that branch's scheduling changes.

## Validation Evidence

- Focused manager contract: 34/34 tests passed.
- Focused console stale-while-revalidate/UI: 19/19 tests passed.
- Full agent-manager: 24 files, 504/504 tests passed (`--maxWorkers=1`; process-identity permission enabled for the existing print integration).
- Full CLI: 81 files, 966/966 tests passed.
- Agent-manager lint, typecheck, and build passed.
- CLI lint passed with five pre-existing warnings and zero errors; CLI build passed.
- Feature docs lint passed.
