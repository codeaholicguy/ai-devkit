---
phase: design
title: "Copilot Adapter in @ai-devkit/agent-manager - Design"
feature: copilot-adapter-agent-manager-package
description: Architecture and implementation design for introducing GitHub Copilot CLI adapter support
---

# Design: Copilot Adapter for @ai-devkit/agent-manager

## Architecture Overview

```mermaid
graph TD
  User[User runs ai-devkit agent list/sessions/show] --> Cmd[CLI agent commands]
  Cmd --> Manager[AgentManager]

  subgraph Pkg[@ai-devkit/agent-manager]
    Manager --> Copilot[CopilotAdapter]
    Copilot --> Proc[process utils]
    Copilot --> Locks[inuse PID locks]
    Copilot --> Events[events.jsonl parser]
    Copilot --> Workspace[workspace.yaml fallback]
    Copilot --> Types[AgentAdapter models]
  end

  Cmd --> Output[CLI table/json rendering]
```

Responsibilities:
- `CopilotAdapter`: detect active Copilot CLI processes, map session-state directories to `AgentInfo`, list historical sessions, and read conversations
- `AgentManager`: aggregate Copilot results with existing adapters
- CLI commands: continue to consume adapters through existing package APIs and render unchanged output

## Data Models

- Reuse `AgentAdapter`, `AgentInfo`, `AgentStatus`, `SessionSummary`, and `ConversationMessage`
- Extend `AgentType` with `copilot`
- Copilot session directory:
  - `~/.copilot/session-state/{sessionId}/events.jsonl`
  - `~/.copilot/session-state/{sessionId}/workspace.yaml`
  - `~/.copilot/session-state/{sessionId}/inuse.{pid}.lock` while running
  - `session.db` may exist but is not required by v1
- Primary event shape:
  - `type`: examples include `session.start`, `session.model_change`, `session.info`, `session.warning`
  - `data.sessionId`, `data.startTime`, `data.context.cwd`, `data.context.gitRoot`, `data.context.branch`
  - `timestamp`, `id`, `parentId`
- Normalized active agent:
  - `type`: `copilot`
  - `pid`: from `inuse.{pid}.lock`, validated against a running Copilot process where possible
  - `projectPath`: `session.start.data.context.cwd`, falling back to `workspace.yaml` `cwd`, then process cwd
  - `sessionId`: directory name or `session.start.data.sessionId`
  - `summary`: first meaningful user message when available, falling back to workspace name or `Copilot session active`
  - `lastActive`: latest event timestamp or workspace updated timestamp
- Normalized historical session:
  - session id, cwd, first user message, last activity, started timestamp, and `events.jsonl` path

## API Design

### Package Exports
- Add `CopilotAdapter` to:
  - `packages/agent-manager/src/adapters/index.ts`
  - `packages/agent-manager/src/index.ts`

### Adapter Contract
- `detectAgents()`: process-first active detection
- `canHandle(processInfo)`: executable basename match for `copilot` / `copilot.exe`
- `listSessions(opts)`: enumerate session-state directories and apply strict cwd filter
- `getConversation(sessionFilePath, options)`: parse `events.jsonl` into normalized messages

## Component Breakdown

1. `packages/agent-manager/src/adapters/CopilotAdapter.ts`
   - Resolve `~/.copilot/session-state`
   - Detect Copilot processes via `listAgentProcesses('copilot')` and `enrichProcesses`
   - Discover active locks by scanning `inuse.{pid}.lock`
   - Parse `events.jsonl` for session metadata, timestamps, summaries, and conversation messages
   - Parse `workspace.yaml` with a small tolerant key/value reader for fallback metadata
   - Map active and historical sessions to existing adapter models

2. `packages/agent-manager/src/__tests__/adapters/CopilotAdapter.test.ts`
   - Unit coverage for detection, parsing, list sessions, and conversation behavior

3. Adapter exports and shared type updates
   - Extend `AgentType`
   - Export `CopilotAdapter`

4. CLI integration if current CLI adapter registration is explicit
   - Register `CopilotAdapter` alongside existing package adapters

## Design Decisions

- Decision: Use `events.jsonl` as the primary data source.
  - Rationale: it contains session id, timestamps, cwd context, and event stream data without depending on private SQLite schemas.
- Decision: Use `inuse.{pid}.lock` only for active-session mapping.
  - Rationale: the file exists only while Copilot is running, so it is reliable for active detection but not historical listing.
- Decision: Validate active lock PIDs against detected Copilot processes when possible.
  - Rationale: stale or unrelated lock files should not create active agents.
- Decision: Suppress process-only fallback entries for Copilot wrapper/child process pairs sharing the same terminal.
  - Rationale: observed macOS Copilot sessions can show both `copilot` and the Caskroom executable, while `inuse.{pid}.lock` points at the real child PID. The list should show one active session, not a duplicate wrapper process.
- Decision: Match Copilot executables by basename, not Homebrew path.
  - Rationale: macOS Homebrew currently uses `/opt/homebrew/Caskroom/copilot-cli/<version>/copilot`, while Linux and other installs may use different directories.
- Decision: Keep SQLite out of v1.
  - Rationale: `events.jsonl` and `workspace.yaml` provide enough adapter data and are simpler to test.
- Decision: Implement a tolerant YAML fallback parser instead of adding a dependency.
  - Rationale: `workspace.yaml` fields needed by the adapter are flat scalar keys.
- Decision: Follow Codex/OpenCode adapter structure.
  - Rationale: maintain consistent adapter behavior and reduce cognitive overhead.

## Non-Functional Requirements

- Performance: active detection scans only session-state directories and known lock files; historical listing reads one event/workspace pair per session.
- Reliability: malformed event lines, missing workspace files, and missing optional SQLite files are skipped or handled with fallbacks.
- Security: adapter only reads local Copilot metadata and process info already needed for existing adapter workflows.
- Maintainability: parsing helpers stay private and focused; no CLI presentation logic enters the package.
