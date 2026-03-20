---
phase: planning
title: Generalize Process-to-Session Mapping — Planning
description: Task breakdown for extracting shared matching logic into utilities
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Shared utilities created and tested
- [x] Milestone 2: ClaudeCodeAdapter refactored to use shared utilities
- [x] Milestone 3: CodexAdapter refactored to use shared utilities
- [x] Milestone 4: Full test suite passes, dead code removed

## Task Breakdown

### Phase 1: Shared Utilities

- [x] Task 1.1: Extend `utils/process.ts` — add `listAgentProcesses(namePattern)` (runs `ps aux | grep <pattern>`, post-filters by `path.basename(executable)` match, returns `ProcessInfo[]` with pid, command, tty). Add `batchGetProcessCwds(pids)` (single `lsof -a -d cwd -Fn -p PID1,PID2,...`). Add `batchGetProcessStartTimes(pids)` (single `ps -o pid=,lstart= -p PID1,...`, parses full timestamp). Add `enrichProcesses(processes)` convenience that calls both batch functions and populates cwd + startTime on each ProcessInfo. Returns partial results on failure. Remove per-PID `getProcessCwd()`.

- [x] Task 1.2: Create `utils/session.ts` — implement `batchGetSessionFileBirthtimes(dirs)` using `stat -f '%B %N'` on macOS or `stat --format='%W %n'` on Linux. Combines all dir globs into single shell call. Parse epoch seconds + filename. Return `SessionFile[]` with `resolvedCwd` left empty (adapter sets it). Platform detection via `process.platform`. Return empty array on failure.

- [x] Task 1.3: Create `utils/matching.ts` — implement `matchProcessesToSessions(processes, sessions)`: exclude processes without `startTime`, build candidate pairs where `process.cwd === session.resolvedCwd` and `deltaMs <= 180_000`, sort by deltaMs ascending, greedy 1:1 assign. Implement `generateAgentName(cwd, pid)` returning `basename(cwd) (pid)`.

- [x] Task 1.4: Write unit tests for all new utilities — mock `execSync` at module level with `jest.mock`. Test cases: no processes, no sessions, multiple processes same CWD, no match within tolerance, exact 1:1, more sessions than processes, more processes than sessions, partial lsof failure, process without startTime excluded, platform detection for stat command.

### Phase 2: Refactor ClaudeCodeAdapter

- [x] Task 2.1: Replace process detection — use `listAgentProcesses('claude')` + `enrichProcesses()`. Remove `listClaudeProcesses()`, `getProcessStartTimes()`, `parseElapsedSeconds()`.

- [x] Task 2.2: Replace session file scanning — use `getSessionFileBirthtimes(dir)` for listing files. Adapter derives project dir via path encoding (`cwd.replace(/\//g, '-')`) instead of scanning all dirs with `sessions-index.json`. Sets `resolvedCwd` on each SessionFile. Remove `findSessionFiles()`, `calculateSessionScanLimit()`, `readSessions()`, `SessionsIndex`, `readJson` import.

- [x] Task 2.3: Replace matching — use `matchProcessesToSessions()`. Remove `assignSessionsForMode()`, `selectBestSession()`, `rankCandidatesByStartTime()`, `filterCandidateSessions()`. Remove parent-child/missing-cwd modes.

- [x] Task 2.4: Replace naming — use `generateAgentName(cwd, pid)`. Remove adapter's `generateAgentName()`.

- [x] Task 2.5: Keep adapter-specific: `canHandle()`, session dir derivation, `readSession()` (JSONL parsing), `determineStatus()`, `extractUserMessageText()`, `mapSessionToAgent()`, `mapProcessOnlyAgent()`.

- [x] Task 2.6: Remove all `execSync` calls and path comparison helpers (`pathEquals`, `pathRelated`, `isChildPath`, `normalizePath`).

- [x] Task 2.7: Update ClaudeCodeAdapter tests — mock shared util imports instead of internal methods.

### Phase 3: Refactor CodexAdapter

- [x] Task 3.1: Replace process detection — use `listAgentProcesses('codex')` + `enrichProcesses()`. Remove `listCodexProcesses()`, `getProcessStartTimes()`, `parseElapsedSeconds()`.

- [x] Task 3.2: Replace session file listing — use `batchGetSessionFileBirthtimes()` across date directories. Date-dir scanning uses process start times (±1 day window). Adapter sets `resolvedCwd` from session_meta first line. Remove `findSessionFiles()`, `findProcessDaySessionFiles()`, `readSessions()`, `calculateSessionScanLimit()`.

- [x] Task 3.3: Replace matching — use `matchProcessesToSessions()`. Remove `assignSessionsForMode()`, `selectBestSession()`, `filterCandidateSessions()`, `rankCandidatesByStartTime()`, `addMappedSessionAgent()`, `addProcessOnlyAgent()`.

- [x] Task 3.4: Replace naming — use shared `generateAgentName(cwd, pid)`. Remove adapter's `generateAgentName()`.

- [x] Task 3.5: Keep adapter-specific: `canHandle()`, date-dir scanning (`getDateDirs`), `discoverSessions()` (reads files once, caches content, sets resolvedCwd from session_meta), `parseSession(cachedContent, filePath)`, `determineStatus()`, `extractSummary()`.

- [x] Task 3.6: Remove all `execSync` calls from CodexAdapter.

- [x] Task 3.7: Update CodexAdapter tests — mock shared util imports instead of internal methods.

### Phase 4: Cleanup

- [x] Task 4.1: Remove dead code from agent-manager — removed `listProcesses()`, `getProcessCwd()`, `ListProcessesOptions` (deprecated, no callers), `getSessionFileBirthtimes()` (unused wrapper), entire `utils/file.ts` (`readLastLines`, `readJsonLines` — no production callers). Kept `getProcessTty` (used by TerminalFocusManager). Updated exports in utils/index.ts and src/index.ts.

- [x] Task 4.2: Remove dead code from CLI — removed entire `util/process.ts` (`listProcesses`, `getProcessCwd`, `getProcessTty`, `isProcessRunning`, `getProcessInfo`) and `util/file.ts` (`readLastLines`, `readJsonLines`, `fileExists`, `readJson`) — zero production imports in CLI package.

- [x] Task 4.3: Run full test suite — 145 agent-manager tests (7 suites) + 348 CLI tests (24 suites) = 493 total, all passing.

## Dependencies

```mermaid
graph LR
    T11["1.1 utils/process"] --> T21["2.1 Claude process"]
    T11 --> T31["3.1 Codex process"]
    T12["1.2 utils/session"] --> T22["2.2 Claude session"]
    T12 --> T32["3.2 Codex session"]
    T13["1.3 utils/matching"] --> T23["2.3 Claude matching"]
    T13 --> T24["2.4 Claude naming"]
    T13 --> T33["3.3 Codex matching"]
    T13 --> T34["3.4 Codex naming"]
    T14["1.4 Utils tests"]
    T27["2.7 Claude tests"] --> T42["4.2 Full suite"]
    T37["3.7 Codex tests"] --> T42
    T41["4.1 Dead code"] --> T42
```

- Phase 1 (1.1-1.3) must complete before Phase 2 and Phase 3
- Phase 2 and Phase 3 are independent (can run in parallel)
- Task 1.4 can run in parallel with Phase 2/3

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `stat` birthtime returns 0 on older Linux | Medium | Low | Fallback to `mtimeMs` in `utils/session.ts` |
| `ps -o lstart` format differs on Linux vs macOS | Medium | Medium | Test on both platforms, use `Date.parse()` with fallback parser |
| `stat` output format differs across distributions | Low | Medium | Parse defensively, test with sample output |
| Agent name format change breaks downstream | Low | Medium | Accepted as intentional breaking change |
| Partial shell command failure | Medium | Low | Return partial results, future `--verbose` mode for logging |
