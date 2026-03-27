---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

- Newer versions of Claude Code write a file at `~/.claude/sessions/<pid>.json` for each running process. This file contains `{ pid, sessionId, cwd, startedAt }`.
- The current Claude adapter in agent-manager matches processes to sessions by encoding the process CWD into a `~/.claude/projects/<encoded>/` directory path and then finding the closest JSONL session file by birthtime (within a 3-minute tolerance).
- This birthtime-based heuristic can produce incorrect matches when multiple Claude processes share the same CWD, or when the session file birthtime diverges significantly from the process start time.
- Users of the agent-manager CLI (`agent list`) may see stale, mismatched, or missing session data as a result.

## Goals & Objectives
**What do we want to achieve?**

- **Primary**: Use `~/.claude/sessions/<pid>.json` as the authoritative source for process-to-session mapping when the file exists for a given PID.
- **Secondary**: Fall back to the existing CWD-encoding + birthtime heuristic for processes where no `~/.claude/sessions/<pid>.json` file is present (older Claude Code versions or sessions not yet written).
- **Non-goals**:
  - Changing how session JSONL content is parsed or how status is determined.
  - Modifying any adapter other than `ClaudeCodeAdapter`.
  - Supporting Windows-specific paths (existing macOS/Linux conventions apply).

## User Stories & Use Cases
**How will users interact with the solution?**

- As an agent-manager user, I want `agent list` to correctly associate each running Claude process with its active session, so that I see accurate status and message summaries.
- As a developer running multiple Claude instances in the same directory, I want each instance to be matched to its own session (not mixed up), so the list output is unambiguous.

**Edge cases to consider:**
- PID file exists but references a `sessionId` whose JSONL does not exist → fall back to legacy matching for that process.
- PID file exists but `cwd` in the file differs from the process's actual CWD reported by `lsof` → trust the PID file's `sessionId` and `cwd` (it is authoritative).
- Stale PID file (process exited, PID reused by a new Claude process) → cross-check `startedAt` (epoch ms) against `proc.startTime` from enrichment; if the delta exceeds 60 seconds, treat as stale and fall back to legacy matching for that process.
- PID file absent for a given process (e.g. older Claude Code) → fall back to legacy matching for that process only. No directory-level check is needed; each PID is tried individually.
- Multiple processes; only some have PID files → use PID files for those that have them, legacy matching for the rest.

## Success Criteria
**How will we know when we're done?**

- `ClaudeCodeAdapter.detectAgents()` reads `~/.claude/sessions/<pid>.json` for each discovered PID and uses the `sessionId` from the file to locate the correct JSONL in `~/.claude/projects/`.
- Processes without a matching PID file are matched via the existing legacy algorithm without regression.
- All existing tests continue to pass.
- New unit tests cover: PID-file happy path, PID-file missing JSONL fallback, directory absent, mixed (some PIDs have files, some don't).

## Constraints & Assumptions
**What limitations do we need to work within?**

- `~/.claude/sessions/<pid>.json` schema (verified from real files):
  ```json
  { "pid": 81665, "sessionId": "87ada2e7-...", "cwd": "/Users/...", "startedAt": 1774598167519, "kind": "interactive", "entrypoint": "cli" }
  ```
  - `startedAt` is **epoch milliseconds** (not an ISO string).
  - `kind` and `entrypoint` fields are present but not used by this feature.
- The JSONL for a session lives at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` — the same location the legacy algorithm already discovers.
- Reading individual small JSON files per PID is acceptable; no batching of the PID file reads is required (files are tiny).
- `enrichProcesses()` continues to run on all processes (direct + fallback) before the PID-file split — the batched `lsof`/`ps` call is cheap and `proc.startTime` is needed for the stale-file guard.
- The feature must remain backward-compatible with older Claude Code installs that do not write PID files.

## Questions & Open Items

- None — requirements are clear from the user's description and existing code analysis.
