---
phase: design
title: "Gemini CLI Adapter in @ai-devkit/agent-manager - Design"
feature: gemini-cli-adapter
description: Architecture and implementation design for introducing Gemini CLI adapter support in the shared agent manager package
---

# Design: Gemini CLI Adapter for @ai-devkit/agent-manager

## Architecture Overview

```mermaid
graph TD
  User[User runs ai-devkit agent list/open] --> Cmd[packages/cli/src/commands/agent.ts]
  Cmd --> Manager[AgentManager]

  subgraph Pkg[@ai-devkit/agent-manager]
    Manager --> Claude[ClaudeCodeAdapter]
    Manager --> Codex[CodexAdapter]
    Manager --> Gemini[GeminiCliAdapter]
    Gemini --> Proc[process utils - node argv scan]
    Gemini --> File[fs read of ~/.gemini/tmp]
    Gemini --> Hash[sha256 projectHash]
    Gemini --> Types[AgentAdapter/AgentInfo/AgentStatus]
    Focus[TerminalFocusManager]
  end

  Cmd --> Focus
  Cmd --> Output[CLI table/json rendering]
```

Responsibilities:
- `GeminiCliAdapter`: discover running Gemini processes, match them to local session files, and emit `AgentInfo`
- `AgentManager`: aggregate Gemini + Claude + Codex results in parallel
- CLI command: register adapter, render results, invoke open/focus

## Data Models

- Reuse `AgentAdapter`, `AgentInfo`, `AgentStatus`, and `AgentType`
- `AgentType` already supports `gemini`; adapter emits `type: 'gemini'`
- Gemini raw session shape (on disk):
  - `sessionId`: uuid string
  - `projectHash`: sha256 of the project root path (walked to nearest `.git` boundary)
  - `startTime`, `lastUpdated`: ISO timestamps
  - `messages[]`: entries with `id`, `timestamp`, `type` (`user` | `gemini` | `thought` | `tool`), and `content` / `displayContent`
  - `content` is polymorphic: `string` for assistant-side, `Part[]` (e.g. `[{text: "..."}]`) for user-side
  - `directories[]`, `kind`
- Normalized into `AgentInfo`:
  - `id`: `gemini-<sessionId prefix>`
  - `name`: derived from session project directory (basename of registry path)
  - `cwd`: project root
  - `sessionStart`: parsed from `startTime`
  - `status`: computed from `lastUpdated` vs shared status thresholds
  - `pid`: matched live `node` process running the `gemini` script

## API Design

### Package Exports
- Add `GeminiCliAdapter` to:
  - `packages/agent-manager/src/adapters/index.ts`
  - `packages/agent-manager/src/index.ts`

### CLI Integration
- Update `packages/cli/src/commands/agent.ts` to register `GeminiCliAdapter` alongside `ClaudeCodeAdapter` and `CodexAdapter`
- No presentation logic moves into the package; CLI retains formatting

## Component Breakdown

1. `packages/agent-manager/src/adapters/GeminiCliAdapter.ts`
   - Implements adapter contract
   - Detects live Gemini processes by scanning `node` processes for a `gemini` argv token
   - Resolves the project-to-shortId mapping from `~/.gemini/projects.json`
   - Reads session files from `~/.gemini/tmp/<shortId>/chats/session-*.json`
   - Computes `projectHash` by walking the candidate project root up to `.git` and hashing with sha256
   - Normalizes `content`/`displayContent` via a shared `resolveContent(string | Part[])` helper
   - Exposes `getConversation` for reading message history

2. `packages/agent-manager/src/__tests__/adapters/GeminiCliAdapter.test.ts`
   - Unit tests for process filtering, session parsing, array-of-parts content, empty/malformed cases, and status mapping

3. `packages/agent-manager/src/adapters/index.ts` and `src/index.ts`
   - Export adapter class

4. `packages/cli/src/commands/agent.ts`
   - Register Gemini adapter in manager setup paths

5. `README.md`
   - Flip Gemini CLI row to ✅ in the "Agent Control Support" matrix

## Design Decisions

- Decision: Detect Gemini CLI by scanning `node` processes and filtering argv for a `gemini`/`gemini.exe`/`gemini.js` token.
  - Rationale: Gemini CLI is distributed as a pure Node script (unlike Claude's native binary or Codex's Node wrapper around Rust). `listAgentProcesses('gemini')` returns empty on macOS/Linux because `argv[0]` is `node`.
- Decision: Compute `projectHash` by walking from the candidate cwd up to the nearest `.git` directory, falling back to the starting directory when no `.git` is found.
  - Rationale: matches the algorithm Gemini CLI uses internally (verified by sha256-hashing against a live session file's `projectHash`).
- Decision: Normalize polymorphic `content` through a single `resolveContent(string | Part[])` helper that extracts `.text` from each part and concatenates.
  - Rationale: user messages are stored as `Part[]`; calling `.trim()` on an array throws `.trim is not a function`, which earlier caused `detectAgents` to throw and `AgentManager` to return an empty list.
- Decision: Keep `displayContent` preferred over `content` when both are present.
  - Rationale: `displayContent` is the user-visible rendered string; `content` can include raw tool/thought payloads.
- Decision: Gate list membership on running `node` processes that match the Gemini token filter (process-first, like Codex).
  - Rationale: stale session files from previous runs should not surface as active agents.
- Decision: Keep parsing resilient — adapter-level failures are caught and translated to empty results.
  - Rationale: a malformed session file must not break the entire `agent list` command.
- Decision: Follow `CodexAdapter` structure for method names, helper extraction, and error handling.
  - Rationale: maintainer guidance "đừng custom quá nhiều" — reduce cognitive load across adapters and keep the extension path uniform.

## Non-Functional Requirements

- Performance: adapter aggregation remains bounded by existing manager patterns; session file reads are limited to the directories of live processes.
- Reliability: Gemini adapter failures must be isolated so Claude/Codex entries still render.
- Maintainability: code structure mirrors Codex adapter for consistency.
- Security: only reads local files under `~/.gemini` and local `ps` output already permitted by existing adapters.
