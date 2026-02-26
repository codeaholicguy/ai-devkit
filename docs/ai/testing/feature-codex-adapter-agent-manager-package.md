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
- [ ] Detect and map valid Codex entries into `AgentInfo`
- [ ] Return empty array when no Codex metadata exists
- [ ] Skip malformed entries without failing full result
- [ ] Map status values based on activity thresholds
- [ ] Produce stable name/id collision handling

### `AgentManager` integration seam
- [ ] Aggregates Codex + Claude adapter output
- [ ] Handles Codex adapter errors while preserving other adapter results

## Integration Tests

- [ ] `agent` command registers `CodexAdapter` in manager setup path(s)
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
  - `npm run lint`
  - `npm run build`
  - `npm run test -- --coverage`
  - project-scoped Nx tests for `agent-manager` and `cli`
- Capture coverage deltas and list any residual gaps in this doc

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
