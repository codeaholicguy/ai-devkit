---
phase: planning
title: "CLI Agent-Manager Package Adoption - Planning"
feature: agent-manager-package
description: Task breakdown for migrating CLI to @ai-devkit/agent-manager and cleaning duplicated files
---

# Planning: CLI Uses @ai-devkit/agent-manager

## Milestones

- [x] Milestone 1: CLI imports migrated to package
- [x] Milestone 2: Duplicated CLI agent-manager files removed/retired
- [x] Milestone 3: Tests and validation complete with no regressions

## Task Breakdown

### Phase 1: Foundation
- [x] Task 1.1: Confirm package API used by CLI (`AgentManager`, `ClaudeCodeAdapter`, core types)
- [x] Task 1.2: Add/update CLI dependency on `@ai-devkit/agent-manager` in workspace manifests
- [x] Task 1.3: Update `packages/cli/src/commands/agent.ts` imports to package equivalents

### Phase 2: Migration & Cleanup
- [x] Task 2.1: Replace any remaining direct references to duplicated CLI agent-management modules
- [x] Task 2.2: Remove migrated files in `packages/cli/src/lib` and related tests under `src/__tests__/lib`
- [x] Task 2.3: Keep or isolate CLI-specific terminal focus code based on final boundary decision

### Phase 3: Validation & Polish
- [x] Task 3.1: Update tests to cover package-backed CLI behavior
- [x] Task 3.2: Run lint/build/test for affected packages
- [x] Task 3.3: Verify manual behavior for `agent list`, `agent list --json`, and `agent open`
- [x] Task 3.4: Remove dead exports/imports and ensure clean TypeScript build

## Dependencies

- Task 1.1 must complete before Task 1.3
- Task 1.3 must complete before file deletion in Task 2.2
- Task 2.x tasks must complete before final validation in Task 3.x

## Timeline & Estimates

- Phase 1: 0.5 day
- Phase 2: 0.5-1 day
- Phase 3: 0.5 day
- Total estimate: 1.5-2 days

## Risks & Mitigation

- Risk: package/CLI type mismatch blocks migration
  - Mitigation: add small CLI adapter/mapping layer for display-only transformations
- Risk: cleanup removes code still used indirectly
  - Mitigation: use `rg` reference checks before deletion and run full TypeScript build
- Risk: behavior regression in user-facing command output
  - Mitigation: run existing tests plus targeted manual verification of output paths

## Resources Needed

- Existing `feature-agent-manager` docs and package implementation
- CLI command/test suite for `agent` commands
- Local runtime with access to Node/npm and workspace scripts

## Progress Summary

Implementation scope is complete: CLI now consumes `@ai-devkit/agent-manager`, duplicated CLI agent-manager sources/tests were removed, and validation targets passed. Post-implementation stabilization addressed a flaky `cli:test` signal by making `process` utility tests deterministic via mocking instead of host-process introspection. No scope expansion was introduced; remaining work is lifecycle closure (implementation check, final testing/code review pass).

## Next Actionable Tasks

1. Run Phase 6 implementation check and document any deviations from requirements/design.
2. Run Phase 7 test-phase documentation update with final stability notes.
3. Run Phase 8 code review for final risk scan before commit/PR.
