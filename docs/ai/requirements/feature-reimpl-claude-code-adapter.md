---
phase: requirements
title: "Re-implement Claude Code Adapter - Requirements"
feature: reimpl-claude-code-adapter
description: Requirements for re-implementing ClaudeCodeAdapter using the same architectural patterns as CodexAdapter
---

# Requirements: Re-implement Claude Code Adapter

## Problem Statement

The current `ClaudeCodeAdapter` (598 lines) uses a different architectural approach than the newer `CodexAdapter` (585 lines). Key issues:

- **No process start time matching**: Claude adapter relies solely on CWD and parent-path matching to pair processes with sessions, which is fragile when multiple Claude processes share the same project directory.
- **Unbounded session scanning**: Reads all session files across all projects in `~/.claude/projects/`, which degrades performance as session history grows.
- **Inconsistent matching phases**: Uses `cwd` → `history` → `project-parent` → `process-only` flow, while Codex uses the cleaner `cwd` → `missing-cwd` → `parent-child` pattern with extracted helpers and PID/session tracking sets.
- **Structural divergence**: Two adapters in the same package follow different patterns, making maintenance harder.

## Goals & Objectives

### Primary Goals
- Re-implement `ClaudeCodeAdapter` using the same architectural patterns as `CodexAdapter`
- Add process start time matching (`getProcessStartTimes` + `rankCandidatesByStartTime`) for accurate process-session pairing
- Introduce bounded session scanning to keep `agent list` latency predictable
- Align matching phases to `cwd` → `missing-cwd` → `parent-child` with extracted helper methods

### Secondary Goals
- Improve disambiguation when multiple Claude processes share the same CWD
- Extract summary from session JSONL directly (no history.jsonl dependency)

### Non-Goals
- Changing Claude Code's session file structure (`~/.claude/projects/`)
- Modifying the public API (`AgentAdapter` interface, `AgentInfo` shape, constructor signature)
- Changing CLI output or UX behavior
- Adding new adapter capabilities beyond what CodexAdapter provides

## User Stories & Use Cases

- As a developer running multiple Claude Code sessions, I want `agent list` to accurately pair each process with its correct session, even when sessions share the same project directory.
- As a developer with large session history, I want `agent list` to remain fast regardless of how many past sessions exist.
- As a maintainer of `@ai-devkit/agent-manager`, I want both adapters to follow the same structural patterns so I can reason about and modify them consistently.

## Success Criteria

- All existing `ClaudeCodeAdapter` unit tests pass (with updated mocking as needed)
- Process-session matching accuracy improves for multi-session-same-CWD scenarios
- Session scanning is bounded (configurable limits, not reading all files)
- Code structure mirrors `CodexAdapter` (same matching phase flow, extracted helpers)
- No changes to public exports or `AgentInfo` output shape
- `agent list` latency does not regress

## Constraints & Assumptions

- **Session structure is fixed**: Claude Code stores sessions in `~/.claude/projects/{encoded-path}/` with optional `sessions-index.json` and `*.jsonl` files — this cannot change.
- **Process detection**: Uses existing `listProcesses()` utility — no changes.
- **Status determination**: Based on session entry type; no age-based IDLE override since every listed agent is backed by a running process.
- **Platform**: macOS/Linux only (same as existing adapter).

## Questions & Open Items

- None — scope is well-defined as an internal refactor following established CodexAdapter patterns.
