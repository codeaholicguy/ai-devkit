---
phase: implementation
title: "Codex Adapter in @ai-devkit/agent-manager - Implementation"
feature: codex-adapter-agent-manager-package
description: Implementation notes for Codex adapter support in package agent manager and CLI integration
---

# Implementation Guide: Codex Adapter in @ai-devkit/agent-manager

## Development Setup

- Use branch/worktree: `feature-codex-adapter-agent-manager-package`
- Install dependencies with `npm ci`
- Validate docs and feature scope with:
  - `npx ai-devkit@latest lint`
  - `npx ai-devkit@latest lint --feature codex-adapter-agent-manager-package`

## Code Structure

- Package adapter implementation:
  - `packages/agent-manager/src/adapters/CodexAdapter.ts`
- Package exports:
  - `packages/agent-manager/src/adapters/index.ts`
  - `packages/agent-manager/src/index.ts`
- CLI wiring:
  - `packages/cli/src/commands/agent.ts`
- Tests:
  - `packages/agent-manager/src/__tests__/adapters/CodexAdapter.test.ts`
  - CLI tests touching adapter registration/open flow

## Implementation Notes

### Core Features
- Implement Codex adapter contract (`type`, `canHandle`, `detectAgents`) using existing utilities where possible.
- Normalize Codex metadata into stable `AgentInfo` output.
- Register Codex adapter in command paths that instantiate `AgentManager`.
- Match process/session pairs by `cwd` plus process-start-time proximity (`etime` vs `session_meta.timestamp`) using configurable tolerance.

### Patterns & Best Practices
- Follow `ClaudeCodeAdapter` structure for consistency.
- Keep adapter-specific parsing in adapter module; keep formatting in CLI.
- Fail soft on malformed/partial entries; avoid throwing across adapter boundary.
- Keep `detectAgents` orchestration readable via small private helpers for each matching stage.

## Integration Points

- `AgentManager` parallel aggregation behavior
- `TerminalFocusManager` open/focus flow compatibility for Codex command metadata
- CLI list/json output mapping

## Error Handling

- Handle missing/unreadable Codex source data by returning empty results.
- Catch parsing errors per-entry and continue processing valid entries.
- Let manager collect adapter errors without crashing full command.

## Performance Considerations

- Avoid full session-history scans per run; use bounded recent-file selection.
- Include process-start day windows to preserve long-lived session mapping without scanning all days.
- Keep parsing linear to selected entries only.
- Reuse existing async aggregation model.

## Security Notes

- Read only local metadata/process information necessary for agent detection.
- Do not execute arbitrary commands during detection.

## Implementation Status

- Completed:
  - Added `packages/agent-manager/src/adapters/CodexAdapter.ts`
  - Added package exports in `packages/agent-manager/src/adapters/index.ts` and `packages/agent-manager/src/index.ts`
  - Updated `packages/cli/src/commands/agent.ts` to register `CodexAdapter` for `list` and `open`
  - Added adapter unit tests and CLI command test mock update for Codex export
- Notes:
  - CLI TypeScript tests resolve workspace package exports from built artifacts; run `npx nx run agent-manager:build` before focused CLI agent-command tests when export surface changes.
  - Matching/performance constants are defined in `CodexAdapter`:
    - `PROCESS_SESSION_TIME_TOLERANCE_MS`
    - `PROCESS_START_DAY_WINDOW_DAYS`
    - session-scan bound constants (`MIN/MAX/SCAN_MULTIPLIER`)
  - Simplification refactor (no behavior change):
    - extracted orchestration helpers:
      - `listCodexProcesses`
      - `calculateSessionScanLimit`
      - `assignSessionsForMode`
      - `addMappedSessionAgent`
      - `addProcessOnlyAgent`
      - `filterCandidateSessions`
      - `rankCandidatesByStartTime`
    - replaced repeated `agents.some(...)` PID checks with `assignedPids` set tracking
