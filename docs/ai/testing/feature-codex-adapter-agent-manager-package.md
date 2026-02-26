---
phase: testing
title: "Codex Adapter in @ai-devkit/agent-manager - Testing"
feature: codex-adapter-agent-manager-package
description: Test strategy and coverage plan for Codex adapter integration
---

# Testing Strategy: Codex Adapter in @ai-devkit/agent-manager

## Test Coverage Goals

- Unit test coverage target: 100% of new/changed code
- Integration scope: package adapter integration with `AgentManager` and CLI registration paths
- End-to-end scope: `ai-devkit agent list` and `ai-devkit agent open` behavior with Codex entries

## Unit Tests

### `CodexAdapter`
- [x] Detect and map valid Codex entries into `AgentInfo`
- [x] Return empty array when no Codex metadata exists
- [x] Skip malformed entries without failing full result
- [x] Map status values based on activity thresholds
- [x] Produce stable name/id collision handling
- [x] Match same-cwd sessions by closest process start time
- [x] Keep running processes listed even when session tail is `task_complete`/`turn_aborted`

### `AgentManager` integration seam
- [x] Aggregates Codex + Claude adapter output
- [ ] Handles Codex adapter errors while preserving other adapter results

## Integration Tests

- [x] `agent` command registers `CodexAdapter` in manager setup path(s)
- [ ] `agent list --json` includes Codex entries with expected fields
- [ ] `agent open` handles Codex agent command metadata path correctly

## End-to-End Tests

- [ ] User flow: run `ai-devkit agent list` with Codex running
- [ ] User flow: run `ai-devkit agent open <codex-id>`
- [ ] Regression: Claude list/open remains unchanged

## Test Data

- Mock Codex session/process fixtures:
  - valid, empty, partial, malformed
- Mock filesystem and process utility responses

## Test Reporting & Coverage

- Commands:
  - `npx nx run agent-manager:lint` ✅
  - `npx nx run agent-manager:build` ✅
  - `npx nx run agent-manager:test` ✅
  - `npx nx run agent-manager:test -- --runInBand src/__tests__/adapters/CodexAdapter.test.ts` ✅
  - `npx nx run cli:test -- --runInBand src/__tests__/commands/agent.test.ts` ✅
  - `npx nx run cli:lint` ✅ (warnings only, no errors)
- Capture coverage deltas and list any residual gaps in this doc

Coverage and residual gaps:
- New Codex adapter unit suite (`CodexAdapter.test.ts`) is passing with coverage on detection, filtering, status mapping, fallback naming, and time-based matching.
- Post-simplification verification: focused Codex adapter tests and lint still pass after helper extraction/set-based PID tracking refactor.
- Full `npx nx run cli:test` currently fails due to unrelated pre-existing module-resolution issues in `memory.test.ts` and baseline `agent.test.ts` mocking behavior when running the entire suite without focused filtering.
- Runtime validation confirmed targeted mapping: PID `81442` maps to session `019c7024-89e6-7880-81eb-1417bd2177b5` after time-based matching + process-day window logic.

## Manual Testing

- Verify table output readability for mixed Claude/Codex lists
- Verify JSON output schema consistency
- Validate open/focus behavior in a local Codex session

## Performance Testing

- Compare `agent list` runtime before/after Codex adapter registration
- Validate no major latency regression for typical session counts

## Bug Tracking

- Track defects by severity (`blocking`, `major`, `minor`)
- Re-run adapter + command regressions for every bug fix

## Phase 7 Execution (February 26, 2026)

### New Test Coverage Added

- Updated `packages/agent-manager/src/__tests__/adapters/CodexAdapter.test.ts` with:
  - missing-cwd phase priority over any-session fallback
  - one-session-per-process assignment behavior (no session reuse across PIDs)

### Commands Run

- `npx nx run agent-manager:test -- --runInBand src/__tests__/adapters/CodexAdapter.test.ts` ✅
  - 1 suite passed, 13 tests passed
- `npx nx run cli:test -- --runInBand src/__tests__/commands/agent.test.ts` ✅
  - 1 suite passed, 5 tests passed
  - Nx flagged `cli:test` as flaky (environment-level signal seen previously)
- `npx nx run agent-manager:test -- --coverage` ✅ (tests passed; coverage policy failed)
  - 3 suites passed, 51 tests passed

### Coverage Snapshot (`packages/agent-manager`)

- Statements: 40.65%
- Branches: 37.31%
- Functions: 49.05%
- Lines: 41.68%
- `CodexAdapter.ts`: statements 44.64%, branches 38.94%, functions 63.41%, lines 45.53%

### Phase 7 Assessment

- Codex adapter changed paths are covered, including the simplified matching orchestration branches.
- Global 80% thresholds remain unmet due broader package backlog coverage outside this feature scope.
