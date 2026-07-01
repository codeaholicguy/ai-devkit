---
phase: requirements
title: "Grok Build CLI Adapter in @ai-devkit/agent-manager - Requirements"
feature: grok-cli-adapter
description: Add a Grok Build CLI adapter to the shared agent-manager package so Grok sessions are detected, listed, inspected, and launchable alongside Claude, Codex, and Gemini
---

# Requirements: Add Grok Build CLI Adapter to @ai-devkit/agent-manager

Tracking issue: [#107 Support Grok Build CLI](https://github.com/codeaholicguy/ai-devkit/issues/107) (links https://x.ai/cli).

## Problem Statement

`@ai-devkit/agent-manager` ships adapters for Claude, Codex, Gemini, Copilot, opencode, and Pi, and the `AGENTS` launch map lets the CLI/console start each one. **Grok Build CLI** — xAI's official terminal agent (command `grok`, installed via `https://x.ai/cli/install.sh`) — is not detected or launchable, so it never appears in `ai-devkit agent list`/`console` and cannot be started with `ai-devkit agent start`.

Who is affected:
- Grok users who expect `ai-devkit agent list`/`sessions` to surface Grok sessions next to Claude/Codex/Gemini, and `agent start grok` to launch one.
- Maintainers who want the README support matrix to reflect real capability.
- Contributors who need a reference for a **native-binary** agent whose sessions are stored as **per-session directories** (distinct from Claude's single-file-per-session and Gemini's opaque-hash layout).

## Goals & Objectives

### Primary Goals
- Implement a package-level `GrokCliAdapter` under `packages/agent-manager` implementing the full `AgentAdapter` contract (`canHandle`, `detectAgents`, `getConversation`, `listSessions`).
- Add `'grok_cli'` to `AgentType` and export `GrokCliAdapter` from package entry points.
- Add a `grok_cli` entry to the `AGENTS` launch map so `agent start`, the console start-pane, and tmux launch work.
- Register `GrokCliAdapter` in the CLI agent command and channel runner, and add it to `TYPE_LABELS`, the `--type` help, and `VALID_AGENT_TYPES`.
- Add Grok to the README "Works across coding agents" matrix under **Remote control**.
- Preserve existing Claude/Codex/Gemini behavior and output contracts.

### Secondary Goals
- Reuse shared process/session utilities (`listAgentProcesses`, `enrichProcesses`, `generateAgentName`).
- Mirror `ClaudeCodeAdapter`'s detection flow; keep session parsing **inline** in the adapter as the other recent adapters do (Gemini/Codex/Copilot/Pi) — "đừng custom quá nhiều".
- Cover detection, session-directory discovery, `chat_history.jsonl` conversation extraction, status mapping, and `listSessions` with unit tests built from fixtures matching the real on-disk format.

### Non-Goals
- The **Grok setup environment** (`ai-devkit init` writing `.grok/skills` etc.) — a separate follow-up, mirroring how Pi's environment landed after its adapter PR.
- Wiring Grok lifecycle **hooks** into the channel-connector PreToolUse forwarder.
- Console label maps (`agentTypeLabel.ts`) — copilot/pi aren't listed there either; out of scope.
- Hosted/remote Grok sessions (local CLI sessions only).

## User Stories & Use Cases

1. As a Grok user, I want active Grok sessions to appear in `ai-devkit agent list`/`console` so I can inspect them alongside Claude/Codex/Gemini.
2. As a CLI user, I want `ai-devkit agent start grok` to launch Grok in a managed tmux session.
3. As a CLI user, I want `ai-devkit agent sessions --type grok_cli` to list historical Grok sessions and `agent open`/`send` to work.
4. As a maintainer, I want Grok detection in `@ai-devkit/agent-manager` to follow the existing adapter structure to avoid drift.

## Success Criteria

- `packages/agent-manager/src/adapters/GrokCliAdapter.ts` exists, implements `AgentAdapter` with `type: 'grok_cli'`, and is self-contained (parsing inline).
- `GrokCliAdapter` is exported from `adapters/index.ts` and `index.ts`; `AGENTS.grok_cli` launches `grok`.
- `GrokCliAdapter` is registered in `commands/agent.ts` and `services/channel/channel-runner.ts`; `grok_cli` appears in `TYPE_LABELS`, `--type` help, and `VALID_AGENT_TYPES`.
- Unit tests cover happy path, empty path, malformed data, process filtering, `active_sessions.json` cwd resolution, most-recent-session selection, `chat_history.jsonl` conversation extraction, status mapping, and `listSessions` cwd filter; `nx run agent-manager:test` and `nx run cli:test` pass.
- README matrix lists Grok under **Remote control** (`— | yes`).
- A real running Grok session appears in `ai-devkit agent list` during end-to-end verification.

## Constraints & Assumptions

### Technical Constraints
- Follow the existing Nx TypeScript structure and Vitest conventions; keep the `AgentAdapter` contract and JSON/table output schema unchanged.
- Isolate adapter errors so a Grok failure never breaks list/open for other adapters.

### Assumptions (verified against grok 0.2.77 on macOS-aarch64)
- Grok is a **native binary** at `~/.grok/bin/grok`; process `argv[0]` basename is `grok` → matcher is `matchArgv0('grok')` (unlike Gemini's Node-script `matchAnyToken`).
- Sessions live under `~/.grok/sessions/<encodeURIComponent(cwd)>/<session-id>/` (long paths → slug+hash + a `.cwd` file). `GROK_HOME` overrides the `~/.grok` base. `<session-id>` is a UUIDv7 and is used directly as the adapter's sessionId (the session directory name).
- `active_sessions.json` shape (at the `~/.grok` root): an array of `{ pid, cwd, opened_at }`, one entry per running session; Grok adds it on start and removes it on exit. This is the authoritative pid → cwd map for a live process.
- `chat_history.jsonl` shape (per session dir): newline-delimited `{ type: "system" | "user" | "assistant", content }` records, where `content` is a string or an array of `{ type: "text", text }` blocks. The real user prompt is wrapped in `<user_query>...</user_query>`; other user records are context injections and are ignored as prompts.

## Questions & Open Items

- Resolved (2026-06-30): Issue #107 targets xAI's **official** Grok Build CLI (`x.ai/cli`), not the community `superagent-ai/grok-cli` (SQLite `~/.grok/grok.db`). All schemas were captured from a real `grok 0.2.77` session.
- Resolved (2026-06-30): cwd encoding is `encodeURIComponent`; a live process's cwd is read from `active_sessions.json`, so encoding is only used to locate the session dir for that cwd.
- Resolved (2026-07-01): conversation source is `chat_history.jsonl` (the transcript Grok persists per session), not `summary.json`/`updates.jsonl`. An earlier draft read `updates.jsonl` (ACP); corrected after confirming `chat_history.jsonl` is the authoritative record. The real user prompt is taken from `<user_query>...</user_query>` and context-injection user records are skipped, so the system prompt is not surfaced.
- Open: real **assistant** content was not captured (the test account had no Grok credits → paywall before a reply). Assistant turns are `{ type: "assistant", content }` records in `chat_history.jsonl`, mirroring the verified user records; validate during end-to-end verification once a credited session exists.
