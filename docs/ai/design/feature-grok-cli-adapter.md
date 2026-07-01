---
phase: design
title: "Grok Build CLI Adapter in @ai-devkit/agent-manager - Design"
feature: grok-cli-adapter
description: Architecture and implementation design for the Grok Build CLI detection adapter, launch map entry, and CLI wiring
---

# Design: Grok Build CLI Adapter for @ai-devkit/agent-manager

## Architecture Overview

```mermaid
graph TD
  User[User: ai-devkit agent list/start/open/sessions] --> Cmd[packages/cli/src/commands/agent.ts]
  Chan[ai-devkit channel runner] --> Runner[services/channel/channel-runner.ts]
  Cmd --> Manager[AgentManager.detectAgents/listSessions]
  Runner --> Manager

  subgraph Pkg[@ai-devkit/agent-manager]
    Manager --> Claude[ClaudeCodeAdapter]
    Manager --> Codex[CodexAdapter]
    Manager --> Gemini[GeminiCliAdapter]
    Manager --> Grok[GrokCliAdapter]
    Grok --> Proc[process utils: ps scan, matchArgv0 'grok']
    Grok --> Active[~/.grok/active_sessions.json: pid to cwd]
    Grok --> Parse[inline chat_history.jsonl parsing]
    Grok --> Types[AgentAdapter/AgentInfo/AgentStatus]
  end

  Start[ai-devkit agent start grok] --> AGENTS[utils/agents.ts AGENTS.grok_cli]
  AGENTS --> Tmux[tmux send-keys 'grok']
```

Responsibilities:
- `GrokCliAdapter`: discover running `grok` processes, resolve each to its cwd via `~/.grok/active_sessions.json`, read its session transcript from `chat_history.jsonl`, emit `AgentInfo`, and enumerate historical sessions — with parsing kept inline (as in the other recent adapters).
- `AGENTS.grok_cli`: launch command + `ps` matcher (consumed by `agent start`, the console start-pane, and `agent.service`).
- CLI/channel: register the adapter, label the type, validate `--type`.

## Data Models

Reuse `AgentAdapter`, `AgentInfo`, `AgentStatus`, `AgentType`, `SessionSummary`. `AgentType` gains `'grok_cli'`.

Grok on-disk shapes (verified against `grok 0.2.77`):
- Layout: `~/.grok/sessions/<encodeURIComponent(cwd)>/<session-id>/` (long paths → slug+hash + a `.cwd` file). `GROK_HOME` overrides `~/.grok`.
- `active_sessions.json` (at the `~/.grok` root): an array of `{ pid, cwd, opened_at }`, one per running session. This is the authoritative pid → cwd map for a live process; Grok adds an entry on start and removes it on exit.
- `chat_history.jsonl` (per session dir): the transcript, one `{ type: 'system' | 'user' | 'assistant', content }` record per line, where `content` is a string or an array of `{ type: 'text', text }` blocks. Grok wraps the real user prompt in `<user_query>...</user_query>`; other user records are context injections (`<user_info>`, `<system-reminder>`, ...) and are ignored as prompts. The file's mtime is the last-activity time.

Normalized into `AgentInfo`: `name` ← `generateAgentName(projectPath, pid)`; `projectPath` ← cwd from `active_sessions.json` (else the process cwd); `sessionId` ← the session directory name; `summary` ← the last `<user_query>` in `chat_history.jsonl`; `status` ← time-threshold + last-transcript-role heuristic; `sessionFilePath` ← the session dir's `chat_history.jsonl` (so the console's `fs.stat().mtime` cache invalidation tracks conversation growth).

## API Design

### Package
- Add `'grok_cli'` to `AgentType` (`adapters/AgentAdapter.ts`).
- New `adapters/GrokCliAdapter.ts` (self-contained); export from `adapters/index.ts` and `index.ts`.
- `utils/agents.ts`: `StartableAgentType` += `'grok_cli'`; `AGENTS.grok_cli = { command: 'grok', matches: matchArgv0('grok') }`.

### CLI
- `commands/agent.ts`: import + `registerAdapter(new GrokCliAdapter())`; `TYPE_LABELS.grok_cli = 'Grok CLI'`; extend `--type`/sessions help.
- `services/channel/channel-runner.ts`: import + `registerAdapter(new GrokCliAdapter())`.
- `util/sessions.ts`: add `'grok_cli'` to `VALID_AGENT_TYPES`.

## Component Breakdown

1. `packages/agent-manager/src/adapters/GrokCliAdapter.ts` (new, self-contained)
   - `canHandle`: `argv[0]` basename `grok`/`grok.exe`.
   - `detectAgents`: `enrichProcesses(listAgentProcesses('grok'))`; for each live process resolve its cwd from `readActiveSessions()` (pid → cwd, falling back to the process cwd), pick the most recently active session dir under `<sessionsDir>/<enc(cwd)>/` via `latestSessionDir`, and read it; live processes with no session dir → process-only RUNNING agents.
   - inline parsing: `readActiveSessions`, `latestSessionDir`, `readSession`, `parseChatHistory` (extracts `<user_query>` prompts + assistant turns), `determineStatus`, `getConversation`, `decodeGroupCwd`.
   - `getConversation`/`listSessions`: `listSessions` walks `<sessionsDir>/*/*/` dirs containing `chat_history.jsonl`, strict `cwd` filter against the decoded group cwd.

2. `packages/agent-manager/src/__tests__/adapters/GrokCliAdapter.test.ts` (new)
   - Fixtures from the real captured format: `canHandle`, no-process → `[]`, active_sessions.json cwd resolution (authoritative over process cwd), process-cwd fallback, most-recent-session selection, process-only fallback, missing-transcript dir, conversation extraction (`<user_query>` prompts, context-injection skip, verbose system), status mapping, `listSessions` + cwd filter.

3. Exports, launch map, CLI registration, labels, validation — per API Design. README matrix Remote-control row.

## Design Decisions

- Detect Grok via `matchArgv0('grok')` — Grok is a native binary at `~/.grok/bin/grok` (`argv[0]` is the binary), unlike Gemini's Node script.
- Resolve a live process's cwd from `~/.grok/active_sessions.json` (the pid → cwd registry Grok maintains), not from `--resume <id>` or CWD + birth-time heuristics; the lsof-derived process cwd is only a fallback when the pid is not registered.
- Keep parsing **inline** in the adapter (no separate parser util) — matches Gemini/Codex/Copilot/Pi and the maintainer's "đừng custom quá nhiều" guidance; only the original Claude adapter externalizes its parser.
- Treat each session **directory** as the unit; the directory name is the sessionId; the cwd comes from `active_sessions.json` (live) or the decoded group dir / `.cwd` file (historical).
- Parse `chat_history.jsonl` (the transcript) for conversation and summary, not `summary.json`/`updates.jsonl`; take the prompt inside `<user_query>...</user_query>` and skip context-injection user records.
- `sessionFilePath` points at `chat_history.jsonl` so live-tail cache invalidation works; `getConversation` accepts either the file path or the session dir.
- Keep parsing resilient — a missing/malformed `chat_history.jsonl` skips the session; adapter-level failures return empty results so other adapters still render.

## Non-Functional Requirements

- Performance: detection session reads are scoped to the encoded-cwd group dirs of live processes; `listSessions` walks `~/.grok/sessions` once.
- Reliability: Grok adapter failures are isolated so Claude/Codex/Gemini entries still render.
- Maintainability: detection flow and helper names mirror the existing adapters.
- Security: reads only local files under `~/.grok` and local `ps`/`lsof` output already permitted by existing adapters.
