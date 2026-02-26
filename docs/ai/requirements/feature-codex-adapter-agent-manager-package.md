---
phase: requirements
title: "Codex Adapter in @ai-devkit/agent-manager - Requirements"
feature: codex-adapter-agent-manager-package
description: Add a Codex adapter to the shared agent-manager package and wire CLI consumption through package exports
---

# Requirements: Add Codex Adapter to @ai-devkit/agent-manager

## Problem Statement

`@ai-devkit/agent-manager` currently ships `ClaudeCodeAdapter` as the only concrete adapter, while `AgentType` already includes `codex`. As a result, Codex sessions are not detected/listed/opened through the shared package flow used by CLI agent commands.

Who is affected:
- Users running Codex alongside other supported agents who expect `ai-devkit agent list/open` to include Codex
- CLI maintainers who want adapter support centralized in `@ai-devkit/agent-manager`
- Contributors who need a reference implementation for adding new adapters

## Goals & Objectives

### Primary Goals
- Implement a package-level `CodexAdapter` under `packages/agent-manager`
- Export `CodexAdapter` from package public entry points
- Update CLI agent command wiring to register `CodexAdapter` through package imports
- Preserve existing behavior for Claude and existing output/error contracts

### Secondary Goals
- Reuse shared process/file utilities and adapter contract patterns
- Add tests for Codex adapter discovery, status mapping, and command metadata
- Establish a clean extension path for future adapters (Gemini/others)

### Non-Goals
- Reworking overall `ai-devkit agent` UX
- Refactoring unrelated CLI command modules
- Introducing a new plugin system for adapters in this phase

## User Stories & Use Cases

1. As a Codex user, I want running Codex sessions to appear in `ai-devkit agent list` so I can inspect active work quickly.
2. As a CLI user, I want `ai-devkit agent open <id>` to support Codex agents with the same behavior guarantees as existing agents.
3. As a maintainer, I want Codex detection logic in `@ai-devkit/agent-manager` so package/CLI behavior does not drift.
4. As an adapter author, I want Codex adapter tests to act as a template for future adapter implementations.

## Success Criteria

- `packages/agent-manager/src/adapters/CodexAdapter.ts` exists and implements `AgentAdapter`
- `@ai-devkit/agent-manager` public exports include `CodexAdapter`
- `packages/cli/src/commands/agent.ts` registers `CodexAdapter` from package exports
- Unit tests cover Codex adapter happy path, empty/no-session path, and invalid data handling
- Existing agent command tests continue to pass without regressions

## Constraints & Assumptions

### Technical Constraints
- Must follow existing Nx TypeScript project structure and test setup
- Must keep adapter contract compatibility (`AgentAdapter`, `AgentInfo`, `AgentStatus`)
- Must not break JSON/table output schema consumed by users

### Assumptions
- Codex session metadata is available in `~/.codex/sessions/YYYY/MM/DD/*.jsonl` with a stable first-line `session_meta` payload
- `TerminalFocusManager` can open Codex sessions using command metadata supplied by adapter or existing CLI flow
- Codex naming and workspace path conventions are stable enough for first-pass implementation

## Questions & Open Items

- Resolved (2026-02-26): Canonical discovery source is `~/.codex/sessions` JSONL files. In 88/88 sampled files, line 1 is `type=session_meta` with `payload.id`, `payload.cwd`, and `payload.timestamp`.
- Resolved (2026-02-26): Active-vs-ended heuristic should use latest event in session file.
  - `payload.type` of `task_complete` or `turn_aborted` => session ended.
  - other trailing event/message types + recent timestamp => potentially active.
- Resolved (2026-02-26): Use the same status threshold values across all adapters (Codex uses existing shared/Claude-equivalent thresholds).
- Resolved (2026-02-26): If `cwd` is missing, fallback display identifier is `codex-<session-id-prefix>`.
