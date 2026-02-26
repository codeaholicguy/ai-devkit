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

## Phase 6 Check Implementation (February 26, 2026)

### Alignment Summary

- Overall status: aligned with requirements and design.
- Codex adapter implementation remains package-owned and exported through public entry points.
- CLI registration for `list` and `open` includes `CodexAdapter` and preserves existing command UX boundaries.

### File-by-File Comparison

- `packages/agent-manager/src/adapters/CodexAdapter.ts`
  - Implements required adapter contract and process-first list membership.
  - Uses configured time-based matching (`etime` start time vs `session_meta.timestamp`) with tolerance and day-window file inclusion.
  - Includes simplification refactor helpers and set-based PID/session assignment tracking with no behavior drift.
- `packages/agent-manager/src/adapters/index.ts`
  - Exports `CodexAdapter` as designed.
- `packages/agent-manager/src/index.ts`
  - Re-exports `CodexAdapter` from package root as designed.
- `packages/cli/src/commands/agent.ts`
  - Registers `CodexAdapter` for both list and open manager paths; no CLI presentation logic moved into package.
- `packages/agent-manager/src/__tests__/adapters/CodexAdapter.test.ts`
  - Covers core mapping/status behavior plus simplified matching-phase behavior (`cwd`, `missing-cwd`, `any`) and no-session-reuse expectations.

### Deviations / Concerns

- No requirement/design deviations found.
- Residual validation note: full `cli:test` still has known unrelated pre-existing failures outside this feature scope; focused Codex adapter tests pass.

## Phase 8 Code Review (February 26, 2026)

### Findings

1. No blocking correctness, security, or design-alignment issues found in the Codex adapter implementation or CLI integration paths.
2. Non-blocking performance follow-up: `readFirstLine` currently reads full file content (`fs.readFileSync`) before splitting first line in `CodexAdapter`; this is acceptable for current bounded scan but can be optimized later for very large transcripts.
3. Test-phase risk remains low for changed paths (focused suites pass), with residual global coverage/flaky-suite signals tracked as pre-existing workspace-level issues.

### Final Checklist

- Design/requirements match: ✅
- Logic gaps on changed paths: ✅ none identified
- Security concerns introduced: ✅ none identified
- Tests for changed behavior: ✅ focused adapter + CLI command suites pass
- Docs updated across lifecycle phases: ✅

### Review Verdict

- Ready for push/PR from a Phase 8 review perspective.
