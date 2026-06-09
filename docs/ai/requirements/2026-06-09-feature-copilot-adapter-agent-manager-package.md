---
phase: requirements
title: "Copilot Adapter in @ai-devkit/agent-manager - Requirements"
feature: copilot-adapter-agent-manager-package
description: Add a GitHub Copilot CLI adapter to the shared agent-manager package
---

# Requirements: Add Copilot Adapter to @ai-devkit/agent-manager

## Problem Statement

`@ai-devkit/agent-manager` supports several concrete agent adapters, but GitHub Copilot CLI sessions are not detected, listed, or readable through the shared package. Users running Copilot alongside Claude, Codex, Gemini CLI, or OpenCode cannot use the common `ai-devkit agent` workflows for Copilot sessions.

Who is affected:
- Users running GitHub Copilot CLI who expect active sessions to appear in `ai-devkit agent list`
- Users who want historical Copilot sessions to appear through `ai-devkit agent sessions`
- Maintainers adding adapter support who need Copilot to follow existing package patterns

## Goals & Objectives

### Primary Goals
- Implement a package-level `CopilotAdapter` under `packages/agent-manager`
- Add `copilot` to the adapter type model and public exports
- Detect active Copilot sessions using running Copilot processes and `~/.copilot/session-state/{sessionId}/inuse.{pid}.lock`
- Parse session metadata and conversation messages from `~/.copilot/session-state/{sessionId}/events.jsonl`
- Use `workspace.yaml` as a fallback metadata source for cwd, name, and timestamps
- Support `listSessions` and `getConversation` for adapter parity with existing agents

### Secondary Goals
- Keep the implementation cross-platform where practical by matching executable basename (`copilot` / `copilot.exe`) instead of hard-coding Homebrew paths
- Preserve the existing `AgentAdapter`, `AgentInfo`, `SessionSummary`, and CLI output contracts
- Add focused unit coverage for process detection, lock handling, event parsing, and fallback behavior

### Non-Goals
- Implement Copilot session resume/start commands
- Change CLI table/JSON output shape
- Depend on Copilot's SQLite databases unless JSONL/workspace files prove insufficient
- Modify unrelated adapter behavior

## User Stories & Use Cases

1. As a Copilot CLI user, I want active Copilot sessions to appear in `ai-devkit agent list` so I can inspect and manage them alongside other agents.
2. As a user with multiple Copilot sessions, I want active-session matching to use `inuse.{pid}.lock` so the displayed PID/session pair is accurate.
3. As a user reviewing previous work, I want Copilot sessions listed from disk so I can find prior conversations by cwd and first user message.
4. As a maintainer, I want Copilot parsing to be resilient to malformed lines, missing optional files, and platform-specific executable paths.

## Success Criteria

- `packages/agent-manager/src/adapters/CopilotAdapter.ts` implements `AgentAdapter`
- `AgentType` includes `copilot`
- `CopilotAdapter` is exported from package public entry points
- Active detection returns Copilot agents only when a matching process/lock is present, with process-only fallback for unmatched running processes
- Historical `listSessions` returns sessions from `~/.copilot/session-state/*` without requiring active locks
- `getConversation` returns normalized user/assistant/system messages from `events.jsonl`
- Unit tests cover happy path, no-process path, lock-only/invalid-PID cases, malformed JSONL, workspace fallback, and conversation parsing
- Existing `agent-manager` tests continue to pass

## Constraints & Assumptions

### Technical Constraints
- Must follow the existing TypeScript/Nx/Vitest package structure
- Must keep adapter failures isolated so other adapters still work
- Must avoid shell string interpolation in process detection, following existing process utility conventions
- Must not require Copilot-specific SQLite schema stability for v1

### Assumptions
- Copilot session directories live under `~/.copilot/session-state/{sessionId}`
- `events.jsonl` starts with a `session.start` event containing session id, start time, and cwd context
- `workspace.yaml` contains enough fallback metadata when `events.jsonl` is missing or sparse
- `inuse.{pid}.lock` exists only while the associated Copilot process is running
- Active Copilot process executables can be identified by basename `copilot` or `copilot.exe`, including Homebrew paths such as `/opt/homebrew/Caskroom/copilot-cli/<version>/copilot`

## Questions & Open Items

- Resolved (2026-06-09): Scope is full adapter parity: active detection, `listSessions`, and `getConversation`.
- Resolved (2026-06-09): Use `events.jsonl` as primary source and `workspace.yaml` as fallback metadata.
- Resolved (2026-06-09): Treat SQLite databases as optional/future fallback, not a v1 dependency.
- Resolved (2026-06-09): `inuse.{pid}.lock` exists only for running Copilot processes and must not be treated as historical metadata.
