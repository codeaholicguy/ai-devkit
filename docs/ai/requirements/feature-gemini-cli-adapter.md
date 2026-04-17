---
phase: requirements
title: "Gemini CLI Adapter in @ai-devkit/agent-manager - Requirements"
feature: gemini-cli-adapter
description: Add a Gemini CLI adapter to the shared agent-manager package so Gemini sessions are detected and listed alongside Claude and Codex
---

# Requirements: Add Gemini CLI Adapter to @ai-devkit/agent-manager

## Problem Statement

`@ai-devkit/agent-manager` ships `ClaudeCodeAdapter` and `CodexAdapter`, while `AgentType` already includes `gemini`. The README "Agent Control Support" matrix lists Gemini CLI as unsupported (❌), even though the adapter contract is designed to be pluggable and Gemini CLI stores session metadata on disk in a stable location.

Who is affected:
- Users running Gemini CLI who expect `ai-devkit agent list` to surface Gemini sessions next to Claude/Codex
- Maintainers who want the "Agent Control Support" README matrix to reflect actual capability
- Contributors who need a reference for adapters that don't run as native binaries (Gemini CLI ships as a Node script)

## Goals & Objectives

### Primary Goals
- Implement a package-level `GeminiCliAdapter` under `packages/agent-manager`
- Export `GeminiCliAdapter` from package public entry points
- Register `GeminiCliAdapter` in CLI agent command wiring so `list`/`open` aggregate Gemini results
- Flip Gemini CLI from ❌ to ✅ in the README "Agent Control Support" matrix
- Preserve existing Claude/Codex behavior and output contracts

### Secondary Goals
- Reuse shared process/file utilities and the existing `AgentAdapter` contract
- Cover detection, session parsing, status mapping, and conversation extraction with unit tests
- Handle Gemini-specific data shapes (array-of-parts `content`) without crashing
- Follow the maintainer's guidance: "đừng custom quá nhiều" — stay close to Codex structure

### Non-Goals
- Redesigning the `ai-devkit agent` UX
- Refactoring unrelated CLI commands
- Supporting multi-user or hosted Gemini sessions (only local CLI sessions)

## User Stories & Use Cases

1. As a Gemini CLI user, I want active Gemini sessions to appear in `ai-devkit agent list` so I can inspect them alongside Claude/Codex.
2. As a CLI user, I want `ai-devkit agent open <id>` to focus a Gemini session with the same behavior as existing adapters.
3. As a maintainer, I want Gemini detection in `@ai-devkit/agent-manager` to avoid CLI/package drift.
4. As a contributor, I want the Gemini adapter to demonstrate how to support a CLI that runs as a Node script (not a native binary).

## Success Criteria

- `packages/agent-manager/src/adapters/GeminiCliAdapter.ts` exists and implements `AgentAdapter`
- `@ai-devkit/agent-manager` public exports include `GeminiCliAdapter`
- `packages/cli/src/commands/agent.ts` registers `GeminiCliAdapter` for list/open flows
- Unit tests cover happy path, empty path, malformed data, process filtering, and array-of-parts content
- `npx nx run agent-manager:test` and `npx nx run cli:test` pass without regressions
- README "Agent Control Support" table marks Gemini CLI as ✅
- Real Gemini CLI session appears in `ai-devkit agent list` during end-to-end verification

## Constraints & Assumptions

### Technical Constraints
- Must follow existing Nx TypeScript project structure and Jest test conventions
- Must keep the `AgentAdapter` contract (`type`, `canHandle`, `detectAgents`, `getConversation`)
- Must not break JSON/table output schema already consumed by users
- Must isolate adapter errors so a Gemini failure does not break list/open for other adapters

### Assumptions
- Gemini CLI stores sessions in `~/.gemini/tmp/<shortId>/chats/session-*.json`
- Session files include `sessionId`, `projectHash`, `startTime`, `lastUpdated`, `messages`, `directories`
- `projectHash = sha256(projectRootWalkedToGitBoundary)` — confirmed empirically against a live Gemini session
- `~/.gemini/projects.json` maps `projectRoot → shortId`
- Gemini CLI runs as a Node script (`node /path/to/gemini`), so process detection must inspect `node` argv rather than a dedicated binary name
- Message `content` is polymorphic: `string` for assistant messages, `Part[]` (e.g. `[{text: "..."}]`) for user messages

## Questions & Open Items

- Resolved (2026-04-22): Gemini CLI distribution is a pure Node script (unique among supported agents — Claude is native binary, Codex is Node wrapper spawning Rust). Detection uses `listAgentProcesses('node')` + a token-scan filter matching `gemini`/`gemini.exe`/`gemini.js` in argv.
- Resolved (2026-04-22): `projectHash` algorithm verified against a real session — sha256 of the project root path walked up to the nearest `.git` boundary, with fallback to the starting directory when no `.git` is found.
- Resolved (2026-04-22): User message `content` is `Part[]`; assistant `content` is a pre-joined string. Adapter normalizes via a `resolveContent(string | Part[])` helper so `.trim()` never runs on an array.
- Resolved (2026-04-22): Session membership is gated by running Gemini processes (same source-of-truth pattern as Codex); stale session files on disk without a live process are not surfaced.
