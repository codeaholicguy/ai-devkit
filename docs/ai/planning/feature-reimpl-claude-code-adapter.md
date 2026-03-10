---
phase: planning
title: "Re-implement Claude Code Adapter - Planning"
feature: reimpl-claude-code-adapter
description: Task breakdown for re-implementing ClaudeCodeAdapter
---

# Planning: Re-implement Claude Code Adapter

## Milestones

- [ ] Milestone 1: Core rewrite — adapter compiles and passes existing tests
- [ ] Milestone 2: Process start time matching — improved accuracy
- [ ] Milestone 3: Bounded scanning + test coverage — performance + quality

## Task Breakdown

### Phase 1: Core Structural Rewrite

- [ ] Task 1.1: Restructure `ClaudeCodeAdapter` internal session model
  - Add `sessionStart`, `lastEntryType`, `summary` fields to `ClaudeSession`
  - Remove `lastEntry` (replace with `lastEntryType`)
  - Keep `slug` field (Claude-specific)
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [ ] Task 1.2: Extract `listClaudeProcesses()` helper
  - Mirror CodexAdapter's `listCodexProcesses()` pattern
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [ ] Task 1.3: Rewrite `readSessions()` with bounded scanning
  - Implement `calculateSessionScanLimit()` with same constants as CodexAdapter
  - Implement `findSessionFiles()` adapted for Claude's `~/.claude/projects/*/` structure
  - Limit to most-recent N session files by mtime
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [ ] Task 1.4: Rewrite `readSession()` for single session parsing
  - Parse first entry for `sessionStart` timestamp
  - Read last N lines for `lastEntryType`, `lastActive`, `lastCwd`, `slug`
  - Simple history.jsonl lookup for summary
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [ ] Task 1.5: Rewrite matching flow to `cwd` → `missing-cwd` → `any`
  - Implement `assignSessionsForMode()`, `filterCandidateSessions()`, `addMappedSessionAgent()`, `addProcessOnlyAgent()`
  - Remove `assignHistoryEntriesForExactProcessCwd()` and `project-parent` mode
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [ ] Task 1.6: Rewrite `determineStatus()` and `generateAgentName()`
  - Status: same logic but using `lastEntryType` string instead of `lastEntry` object
  - Name: keep slug-based disambiguation
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

### Phase 2: Process Start Time Matching

- [ ] Task 2.1: Implement `getProcessStartTimes()`
  - Use `ps -o pid=,etime=` to get elapsed time, calculate start time
  - Implement `parseElapsedSeconds()` helper
  - Skip in test environment (`JEST_WORKER_ID`)
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [ ] Task 2.2: Implement `rankCandidatesByStartTime()`
  - Tolerance-based ranking matching CodexAdapter pattern
  - Use same `PROCESS_SESSION_TIME_TOLERANCE_MS` constant
  - Integrate into `selectBestSession()`
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [ ] Task 2.3: Wire process start times into `detectAgents()` and `assignSessionsForMode()`
  - Pass `processStartByPid` through matching pipeline
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

### Phase 3: Tests + Cleanup

- [ ] Task 3.1: Update existing unit tests for new internal structure
  - Update mocking to match new method signatures
  - Keep all behavioral assertions
  - Files: `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts`

- [ ] Task 3.2: Add tests for process start time matching
  - Test `getProcessStartTimes()`, `parseElapsedSeconds()`, `rankCandidatesByStartTime()`
  - Test multi-process same-CWD disambiguation
  - Files: `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts`

- [ ] Task 3.3: Add tests for bounded session scanning
  - Test `calculateSessionScanLimit()`, `findSessionFiles()`
  - Verify scan limits are respected
  - Files: `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts`

- [ ] Task 3.4: Verify CLI integration (manual smoke test)
  - Run `agent list` with Claude processes, confirm output matches expectations
  - No code changes expected

## Dependencies

- Task 1.1 → Tasks 1.2–1.6 (session model must be defined first)
- Tasks 1.2–1.6 can be done in any order after 1.1
- Phase 2 depends on Phase 1 completion
- Phase 3 depends on Phase 2 completion

## Risks & Mitigation

- **Risk**: Session file format assumptions may differ from edge cases.
  - Mitigation: Keep `readSession()` defensive with try/catch; test with varied fixtures.
- **Risk**: Process start time unavailable on some systems.
  - Mitigation: Graceful fallback to recency-based ranking (same as CodexAdapter).
- **Risk**: Bounded scanning may miss relevant sessions.
  - Mitigation: Include process-start-day window files (same as CodexAdapter pattern).
