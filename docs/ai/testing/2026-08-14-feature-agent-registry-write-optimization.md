---
phase: testing
title: Agent Registry Write Optimization Testing
description: Deterministic SQL operation-count and fake-clock coverage
---

# Testing Strategy

## Required Deterministic Cases

- [x] Unchanged `listAgents()` refresh performs zero INSERT/UPDATE/DELETE and opens no write transaction.
- [x] A changed persisted field produces exactly one upsert and advances `updated_at` once.
- [x] Passive prune scans immediately, skips before 30 seconds, and removes newly dead entries at the boundary.
- [x] Forced `prune()` removes newly dead entries even before the passive boundary.
- [x] Cross-type reuse of the same PID replaces stale identity without inheriting its name.
- [x] Dead name conflicts are cleaned up atomically.
- [x] Live rename conflicts still throw and dead rename conflicts are cleaned up.
- [x] A live name conflict rolls back all earlier writes in the same batch.

## Validation Commands

- `npm test --workspace @ai-devkit/agent-manager -- AgentRegistry.test.ts AgentManager.test.ts`
- `npm test --workspace @ai-devkit/agent-manager`
- `npm test --workspace ai-devkit`
- `npm run lint --workspace @ai-devkit/agent-manager`
- `npm run lint --workspace ai-devkit`
- `npm run typecheck --workspace @ai-devkit/agent-manager`
- `npm run build --workspace @ai-devkit/agent-manager`
- `npm run build --workspace ai-devkit`
- `npx ai-devkit@latest lint --feature agent-registry-write-optimization`

## Evidence

- Red run: focused suite failed 7 tests, and SQL trace showed an unchanged refresh issuing `BEGIN`, `INSERT`, `COMMIT`, `BEGIN`, `COMMIT`.
- Regression red: changed-field timestamp test failed after temporarily restoring wall-clock writes.
- Green run: focused suite passed 67 tests in 2 files.
- `npm run typecheck --workspace @ai-devkit/agent-manager`: exit 0.
- `npm run lint --workspace @ai-devkit/agent-manager`: exit 0.
- `npm test --workspace @ai-devkit/agent-manager`: 24 files, 509 tests passed (rerun with OS process visibility for the existing print-agent integration).
- `npm test --workspace ai-devkit`: 79 files, 959 tests passed after workspace packages were built.
- `npm run build`: all 6 projects built successfully.
- `npm run lint`: all 6 projects linted successfully; 0 errors and 6 unrelated pre-existing warnings.
- `npx ai-devkit@latest lint --feature agent-registry-write-optimization`: all feature checks passed.
