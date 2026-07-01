---
phase: planning
title: "Grok Build CLI Adapter in @ai-devkit/agent-manager - Planning"
feature: grok-cli-adapter
description: Task plan for adding the Grok CLI detection adapter, launch map entry, and CLI wiring, following the existing adapter patterns
---

# Planning: Grok Build CLI Adapter in @ai-devkit/agent-manager

> Execution: TDD, mirror `ClaudeCodeAdapter`'s detection flow but keep parsing inline like the recent adapters (maintainer guidance "đừng custom quá nhiều"). Rebuild dependency packages (`npm run build`) before running `cli` tests — they import sibling `dist/`. The husky pre-commit hook runs the full `nx run-many -t lint test`.

## Milestones

- [x] Milestone 1: Research Grok CLI distribution + session schema (captured from real `grok 0.2.77`)
- [x] Milestone 2: Self-contained adapter + launch map + unit tests
- [x] Milestone 3: CLI/channel wiring + asserted-test updates + README matrix row
- [x] Milestone 4: Real-Grok end-to-end verification

## Global Constraints

- Agent type string: `grok_cli`. Launch command `grok`; matcher `matchArgv0('grok')` (native binary).
- Session base `~/.grok/sessions/` (override `GROK_HOME`); per-session dir `<encodeURIComponent(cwd)>/<session-id>/`.
- Conversation source: `chat_history.jsonl` (the transcript). Live cwd from `active_sessions.json`.
- Parsing kept inline in the adapter (no separate parser util).
- Vitest tests; isolate adapter errors so other adapters still render.

## Task Breakdown

### Phase 1: Research & Foundation
- [x] Confirm Grok is a native binary at `~/.grok/bin/grok`; `argv[0]` basename `grok`.
- [x] Capture real session layout `~/.grok/sessions/%2F.../<uuidv7>/` with `chat_history.jsonl`, and `~/.grok/active_sessions.json`.
- [x] Confirm schemas (`active_sessions.json` `{ pid, cwd, opened_at }[]`; `chat_history.jsonl` `{ type, content }` records with `<user_query>` prompts) and cwd encoding (`encodeURIComponent`).

### Phase 2: Adapter (agent-manager)
- [x] Add `'grok_cli'` to `AgentType` (`adapters/AgentAdapter.ts`).
- [x] Implement self-contained `GrokCliAdapter` (`canHandle`, `detectAgents` via `active_sessions.json`, inline `chat_history.jsonl` parsing, `getConversation`, `listSessions`) + unit tests.
- [x] Add `AGENTS.grok_cli` + `StartableAgentType` (`utils/agents.ts`) + `agents.test.ts`.
- [x] Export `GrokCliAdapter` from `adapters/index.ts` and `index.ts`.

### Phase 3: CLI / channel
- [x] Register adapter in `commands/agent.ts` (+ `TYPE_LABELS`, `--type` help) and `services/channel/channel-runner.ts`.
- [x] Add `'grok_cli'` to `VALID_AGENT_TYPES` (`util/sessions.ts`).
- [x] Update asserted tests (`StartAgentPane`, `sessions`, `agent`, `channel`).
- [x] Add Grok to the README matrix under Remote control (`— | yes`).

### Phase 4: Verification
- [x] End-to-end: `agent start --type grok_cli` (tmux) → `agent list` shows the running agent; `agent sessions --type grok_cli` lists the real on-disk session. Inline parsing validated against the real session dir.

## Dependencies

- `@ai-devkit/agent-manager` adapter contract + shared utils (`process`, `session`, `matching`).
- CLI agent command + channel-runner registration sites.
- A Grok CLI install for end-to-end verification (installed: `grok 0.2.77`); `tmux` for the start path.

## Risks & Mitigation

- Risk: Grok session schema evolves. Mitigation: defensive parsing, fixtures for partial/malformed inputs, prefer `active_sessions.json` cwd for live processes.
- Risk: assistant transcript shape unverified (no subscribed session). Mitigation: `type:'assistant'` records mirror the verified user records (an array of `{type:'text', text}` blocks); validate when a subscribed session is available.
- Risk: adding an `AgentType`/`StartableAgentType` member breaks exact-array test assertions. Mitigation: update them explicitly.
- Risk: cli tests import stale sibling `dist`. Mitigation: `npm run build` before cli tests.

## Out of Scope (follow-up PRs)

- Grok **setup environment** (`env.ts`/`types.ts`, `.grok/skills`) — separate PR (as Pi's environment followed its adapter).
- Console label maps (`agentTypeLabel.ts`), web docs, README-zh, channel-connector hook forwarding.

## Progress Summary

Schemas verified against a real `grok 0.2.77` session. The self-contained `GrokCliAdapter` ships in `@ai-devkit/agent-manager`, is exported and launch-mapped (`AGENTS.grok_cli`), and is registered in the CLI agent command and channel runner. Grok is listed under Remote control in the README matrix. End-to-end verified via the built CLI (start in tmux → list; sessions list against the real on-disk session).
