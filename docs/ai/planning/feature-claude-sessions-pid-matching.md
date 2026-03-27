---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Implementation — `ClaudeCodeAdapter` updated with PID-file matching
- [x] Milestone 2: Tests — unit tests for new code paths pass, existing tests remain green
- [ ] Milestone 3: Review — code review complete, ready to merge

## Task Breakdown

### Phase 1: Implementation

- [x] Task 1.1: Add `tryPidFileMatching()` private method to `ClaudeCodeAdapter`
- [x] Task 1.2: Integrate `tryPidFileMatching()` into `detectAgents()`
- [x] Task 1.3: Define `PidFileEntry` and `DirectMatch` interfaces (internal to `ClaudeCodeAdapter.ts`)

### Phase 2: Tests

- [x] Task 2.1: Unit tests for `tryPidFileMatching()` — 8 cases covering all branches
- [x] Task 2.2: Integration tests for `detectAgents()` — direct-only and mixed scenarios
- [x] Task 2.3: All 156 tests pass (145 existing + 11 new)

### Phase 3: Cleanup & Review

- [x] Task 3.1: Run `npx ai-devkit@latest lint --feature claude-sessions-pid-matching`
- [ ] Task 3.2: Code review

## Dependencies

- Tasks 1.2 and 1.3 depend on Task 1.1.
- Task 2.1 depends on Task 1.1.
- Task 2.2 depends on Tasks 1.2 + 1.3.
- Task 2.3 can run in parallel with Task 2.1/2.2 as a sanity check.

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| PID file `cwd` encoding differs from lsof cwd (e.g. symlinks) | Low | Use PID file cwd for encoding; document this as the authoritative source |
| `~/.claude/sessions/` path differs across Claude Code versions | Low | Derive path from `os.homedir()` same as existing `~/.claude/projects/` |
| Race condition: process exits between ps and PID file read | Very low | `fs.existsSync` + try-catch; treat as fallback |
