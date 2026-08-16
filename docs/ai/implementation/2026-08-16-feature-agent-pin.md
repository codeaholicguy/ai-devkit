---
phase: implementation
title: Agent Pinning Implementation Guide
description: Shipped code, invariants, and verification evidence for agent pins
---

# Agent Pinning Implementation Guide

## Development Setup

- Node.js 20.20+ with the repository lockfile and npm workspaces.
- The parent workspace's existing `node_modules` is available from this worktree; no dependency or lockfile change was needed.
- Feature docs validate with `npx ai-devkit@latest lint --feature agent-pin`.

## Code Structure

- `packages/agent-manager/src/database/migrations/002_pins.sql`: additive schema migration.
- `packages/agent-manager/src/utils/AgentRegistry.ts`: Boolean mapping, atomic toggle, process-row lifetime.
- `packages/agent-manager/src/database/connection.ts`: readonly-safe initialization.
- `packages/agent-manager/src/AgentManager.ts`: pin propagation and name-based mutation API.
- `packages/agent-manager/src/adapters/AgentAdapter.ts`: additive public `AgentInfo.pinned` field.
- `packages/cli/src/tui/console/agentListLayout.ts`: pure ordering, selection, marker, and divider policy.
- `packages/cli/src/tui/console/ConsoleApp.tsx`: consistent derived list and toggle orchestration.
- `packages/cli/src/tui/console/AgentListPane.tsx`: pinned markers and boundary rendering.

## Implementation Notes

### Completed: storage and registry

- Migration 002 adds only `pinned INTEGER NOT NULL DEFAULT 0`.
- `RegistryEntry.pinned` is required and row mapping converts integer values to Boolean.
- `togglePin` performs one update that flips the value and advances `updated_at`; zero changed rows return `null`.
- `pinned` remains absent from the conflict-update list and from merge/equality/write comparisons, preserving registry-owned state across poll upserts.
- Rename updates the same row; prune deletes the row and pin.

### Completed: manager API

- `AgentInfo.pinned` is optional/additive.
- Existing persisted pin state is copied during the same identity join that restores names.
- Pinned entries map existing registry `updated_at` to `AgentInfo.lastActive`, delivering most-recently-touched ordering; unpinned entries preserve adapter `lastActive` behavior.
- `AgentManager.togglePin(name)` resolves the registry identity, rejects missing/dead agents with `AgentNotRunningError`, delegates the final atomic update, and propagates readonly errors.

### Completed: console

- `partitionPinned` recency-sorts only the pinned block and preserves unpinned input/status order.
- The same memoized derived order drives fallback selection, keyboard navigation, and rendering.
- Four exact two-cell markers preserve `ROW_CHROME`; `OTHERS` replaces an existing divider line.
- List-only lowercase `p` calls the manager, refreshes after success, and maps failures to transient errors.
- Poll equality observes pin changes, while registry write equality intentionally does not.
- Help/footer hints expose `p pin`; uppercase/detail/input behavior remains unchanged.

## Integration Points

- Agent-manager's existing build command copies `src/database/migrations` into `dist/database`.
- Console context already exposes `manager` and `refresh` for Task 4.
- Poll inputs may carry `pinned` through typed objects, but registry upserts intentionally never write it.

## Error Handling

- Missing or dead names throw `AgentNotRunningError` with “no longer running”.
- Registry missing-row races return `null`, which the manager maps to the same error.
- Readonly registries throw `Agent registry is readonly; cannot toggle pin.` before executing SQL.

## Performance Considerations

- Toggle is one primary-key update plus one identity read for the returned Boolean.
- Existing WAL and five-second busy timeout remain unchanged for writable handles.
- Readonly handles skip migrations and write-oriented PRAGMAs.

## Security Notes

- All mutation values use prepared-statement parameters.
- No external input reaches SQL identifiers or migration selection.
- No new files outside the existing local registry database are created.

## Verification Evidence

- `npm test --workspace @ai-devkit/agent-manager -- --run src/__tests__/utils/AgentRegistry.test.ts src/__tests__/AgentManager.test.ts`: 2 files, 90 tests passed.
- `npm run typecheck --workspace @ai-devkit/agent-manager`: exit 0.
- `npm run lint --workspace @ai-devkit/agent-manager`: exit 0.
- `npm run build --workspace @ai-devkit/agent-manager`: exit 0; `002_pins.sql` matched the source via `cmp`.
- Phase-7 recency correction: 2 focused files, 92 tests passed; agent-manager typecheck and lint exited 0.
- `npm test --workspace ai-devkit -- --run ...`: 6 focused files, 72 tests passed.
- `npm run lint --workspace ai-devkit`: exit 0 with five pre-existing warnings and no errors.
- `npm run build --workspace ai-devkit`: exit 0 after deterministic `npm ci` and local dependency builds.
- Focused V8 coverage for `agentListLayout.ts`: 100% statements (18/18), branches (13/13), functions (8/8), and lines (15/15).
