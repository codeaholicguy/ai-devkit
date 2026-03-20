---
phase: implementation
title: Generalize Process-to-Session Mapping — Implementation
description: Implementation notes for shared utilities and adapter refactoring
---

# Implementation Guide

## Code Structure

```
packages/agent-manager/src/
├── adapters/
│   ├── AgentAdapter.ts          # Interface + ProcessInfo (added startTime?)
│   ├── ClaudeCodeAdapter.ts     # ~419 lines — session dir via path encoding
│   └── CodexAdapter.ts          # ~319 lines — session dir via date dirs
├── utils/
│   ├── process.ts               # Shell wrappers: ps aux, lsof, ps lstart
│   ├── session.ts               # Shell wrappers: stat for birthtimes
│   ├── matching.ts              # 1:1 greedy matching + agent naming
│   ├── file.ts                  # readLastLines, readJsonLines
│   └── index.ts                 # Re-exports
└── AgentManager.ts              # Orchestrates adapters
```

## Implementation Notes

### Shared Utilities

**`utils/process.ts`** — All `execSync` calls for process data:
- `listAgentProcesses(namePattern)`: Uses `[c]laude` grep trick to avoid matching grep itself. Post-filters by `path.basename(executable)` for exact match. Input validated against `/^[a-zA-Z0-9_-]+$/` to prevent shell injection.
- `batchGetProcessCwds(pids)`: Single `lsof -a -d cwd -Fn -p PID1,PID2,...`. Falls back to per-PID `pwdx` on Linux if lsof fails.
- `batchGetProcessStartTimes(pids)`: Single `ps -o pid=,lstart=`. Parses full timestamp via `new Date(dateStr)`.
- `enrichProcesses(processes)`: Convenience — calls both batch functions, populates in-place.

**`utils/session.ts`** — Session file discovery:
- `batchGetSessionFileBirthtimes(dirs)`: Combines all dir globs into single `stat` call. Uses `|| true` to handle empty globs gracefully.
- `getSessionFileBirthtimes(dir)`: Thin wrapper around batch version.

**`utils/matching.ts`** — Matching algorithm:
- `matchProcessesToSessions`: Builds candidate pairs (CWD match + within 3min tolerance), sorts by delta ascending, greedy 1:1 assign.
- `generateAgentName(cwd, pid)`: Returns `basename(cwd) (pid)` or `unknown (pid)`.

### Adapter-Specific Logic

**ClaudeCodeAdapter**:
- Session dir: `~/.claude/projects/<encoded>/` where encoded = `cwd.replace(/\//g, '-')`
- `discoverSessions`: Encodes each unique process CWD, checks if dir exists, calls `batchGetSessionFileBirthtimes`, sets `resolvedCwd` from dir-to-CWD mapping
- `readSession(filePath, projectPath)`: Parses all JSONL lines for timestamps, slug, cwd, entry type, interruption state, user message text
- Status: Based on `lastEntryType` (user/assistant/progress/thinking/system). No age-based override since process is confirmed running.

**CodexAdapter**:
- Session dir: `~/.codex/sessions/YYYY/MM/DD/`
- `discoverSessions`: Scans ±1 day window around each process start time. Reads each file once into `contentCache: Map<string, string>`. Sets `resolvedCwd` from `session_meta` first line.
- `parseSession(cachedContent, filePath)`: Uses cached content when available, falls back to disk read. Extracts session ID, project path, summary, timestamps, last payload type.
- Status: Based on `lastPayloadType` and 5-minute idle threshold.

## Error Handling

- Shell command utils return partial results — if lsof/ps fails for one PID, others still return
- Session file read failures are silently skipped (file may have been deleted between stat and read)
- Adapters fall back to process-only AgentInfo for unmatched processes
- `listAgentProcesses` rejects patterns with shell metacharacters (returns `[]`)

## Performance

- 1 `ps aux | grep` per adapter (not per process)
- 1 `lsof` for all PIDs (not per PID)
- 1 `ps -o lstart` for all PIDs
- 1 `stat` per adapter across all session directories
- JSONL files only read for matched sessions (CodexAdapter caches content from discovery phase)
- Legacy `listProcesses` + `getProcessCwd` kept for backward compatibility but deprecated
