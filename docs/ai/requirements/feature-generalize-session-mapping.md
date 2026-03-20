---
phase: requirements
title: Generalize Process-to-Session Mapping
description: Extract shared matching logic from adapters into reusable utilities
---

# Generalize Process-to-Session Mapping

## Problem Statement

ClaudeCodeAdapter (768 lines) and CodexAdapter (573 lines) duplicate ~70% of their logic:
- Process discovery (`ps aux`, `lsof` for CWD)
- Process start time calculation (`ps -o etime=`)
- Session scan limiting
- Multi-pass session-to-process matching (CWD filter → start-time ranking → greedy assignment)
- Agent name generation and fallback handling

Adding a new CLI agent requires rewriting all of this. Shell command calls (`execSync`) are scattered inside each adapter instead of being centralized. Per-PID `lsof` calls are not batched.

## Goals & Objectives

**Primary goals:**
- Extract all shell command wrappers into shared utils — no adapter calls `execSync` directly
  - `ps -o pid=,lstart=,comm= -p PID1,...` for process start times (single batched call, full timestamp)
  - `lsof -a -d cwd -Fn -p PID1,PID2,...` for CWDs (single batched call)
  - `stat -f '%B %N' <dir>/*.jsonl` (macOS) / `stat --format='%W %n'` (Linux) for session file birthtimes (batched across all directories)
  - `ps aux | grep <pattern>` for process discovery (filtered at shell level, not in code)
- Extract shared matching algorithm into `utils/matching.ts`
- Use file `birthtimeMs` as the primary matching signal
- Enforce 1:1 process-to-session constraint with greedy assignment
- Only parse JSONL content for matched files (status, summary)
- Move `generateAgentName()` to shared utils — naming convention: `cwdFolderName (pid)`

**Secondary goals:**
- Make adding a new adapter require only agent-specific logic (~50-100 lines)

**Non-goals:**
- Changing the `AgentAdapter` interface
- Adding new agent adapters in this PR
- Solving the session-resumption edge case — accepted as known limitation
- Windows support — macOS and Linux only
- Exposing unmatched/inactive sessions

## User Stories & Use Cases

1. **As a maintainer**, I add a new CLI agent adapter by implementing only: executable name matching, session directory scanning, JSONL parsing, and status determination.

2. **As a user**, I get faster agent listing — fewer shell calls, no unnecessary file reads.

3. **As a maintainer**, I fix a matching bug once in `utils/matching.ts`.

4. **As an adapter author**, I call shared utils for all OS-level commands.

**Edge cases:**
- Multiple processes with same CWD — disambiguated by birthtime proximity to process start time
- Process with no matching session file — falls back to process-only agent (name + pid)
- Session file with no matching process — ignored
- Process that created a new session without restarting — birthtime matches original session (accepted)
- No session within tolerance — process-only fallback (not a wrong match)

## Success Criteria

- Equivalent test coverage with updated mocks (existing tests will change due to refactored internals)
- Runtime output identical to current adapters for non-edge-case scenarios
- No adapter contains direct `execSync` calls
- Shared `matchProcessesToSessions()` used by both adapters
- JSONL files only read for matched sessions

## Constraints & Assumptions

- **macOS and Linux only**: No Windows support. `birthtimeMs` reliable on APFS/HFS+ and modern ext4 (kernel 4.11+).
- **`AgentAdapter` interface is frozen**: No changes to `type`, `detectAgents()`, or `canHandle()`.
- **Platform differences**: `stat -f '%B %N'` (macOS) vs `stat --format='%W %n'` (Linux) — utils handle internally.
- **birthtimeMs limitation**: accepted — process switching sessions without restart matches original session.
- **Tolerance threshold**: 3-minute maximum delta between process start time and session file birthtime. Beyond this → process-only fallback.

## Clarified Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Batch shell commands wherever possible | Performance — 1 `lsof` for N PIDs instead of N calls |
| 2 | Agent name = `cwdFolderName (pid)` | Simpler, deterministic, no JSONL parse needed for naming. Breaking change from current slug-based naming — accepted. |
| 3 | Use `grep` at shell level for process filtering | `ps aux \| grep claude` instead of listing all processes and filtering in code |
| 4 | Use `ps -o pid=,lstart=,comm=` for start times | Full timestamp (not lossy `START` column from `ps aux`). Single batched call for all PIDs. |
| 5 | Session scanning logic stays in adapter | Only exec functions (`ps`, `ls`, `lsof`) move to shared utils. Adapters control which dirs to scan. |
| 6 | No session scan limit | `stat` is cheap (no file reads). List all `.jsonl` files in project dirs. |
| 7 | Drop parent-child path matching | Simpler. Process CWD must match session project dir exactly. |
| 8 | Remove redundant `canHandle()` logic | `listAgentProcesses` already filters by executable name via grep. `canHandle()` kept for interface contract only. |
| 9 | 3-minute tolerance, then process-only fallback | Covers all observed deltas (max 2m24s). Wrong match is worse than no match. |
| 10 | JSONL parsing stays per-adapter | Each agent has different JSONL schema, status mapping, summary extraction. |
| 11 | Focus on active sessions only | Unmatched sessions ignored — not running agents. |

## Questions & Open Items

None — all decisions resolved.
