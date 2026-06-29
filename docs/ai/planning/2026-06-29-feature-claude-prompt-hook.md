---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] M1: Hook script + assets — standalone Claude hook script, asset files in place
- [x] M2: Agent-request store — `agent-requests.ts` in `agent-manager`, unit-tested
- [x] M3: Setup service — `claude` agent added, idempotent settings.json merge
- [x] M4: Channel runner — agent-request store polling wired into `startOutputPolling`
- [x] M5: Tests green — all new and existing tests passing; no regressions

## Task Breakdown

### M1: Hook Script + Assets

- [x] **T1.1** — Create `hooks/claude/claude-prompt-hook.js`
  - CJS, dependency-free; reads stdin JSON; extracts `session_id`, `tool_name`, `tool_input`
  - Sanitizes `session_id` (strip non-`[a-zA-Z0-9\-]`); overwrites `~/.ai-devkit/agent-requests/<id>.json`
  - Creates dir recursively; always exits 0
  - Outcome: runnable standalone via `echo '{"session_id":"abc","tool_name":"Bash","tool_input":{"command":"ls"}}' | node hooks/claude/claude-prompt-hook.js`

- [x] **T1.2** — Copy hook script to `packages/cli/assets/claude/claude-prompt-hook.js`

- [x] **T1.3** — Create `packages/cli/assets/claude/settings-hook.json`
  - `PreToolUse` hook entry; matcher: `"Bash|Edit|Write|MultiEdit|NotebookEdit|AskUserQuestion"`

### M2: Agent-Request Store Module

- [x] **T2.1** — Create `packages/agent-manager/src/utils/agent-requests.ts`
  - Export `AgentRequest` interface: `{ sessionId, toolName, toolInput, timestamp }`
  - Export `getAgentRequestPath(homeDir, sessionId): string` → `~/.ai-devkit/agent-requests/<sessionId>.json`
  - Export `readLatestAgentRequest(homeDir, sessionId): AgentRequest | null` — reads flat file; null on missing/malformed
  - Export `writeAgentRequest(homeDir, entry): void` — creates dir; overwrites file
  - All three exported from `@ai-devkit/agent-manager`

- [x] **T2.2** — Write unit tests for `agent-requests.ts`
  - File: `packages/agent-manager/src/__tests__/utils/agent-requests.test.ts`
  - Covers: path shape, write creates dir + file, overwrite replaces, read returns null for missing, null for malformed, correct entry for valid
  - Outcome: `npx nx run agent-manager:test` passes

### M3: Setup Service — Claude Agent

- [x] **T3.1** — Add `claude` to `SUPPORTED_SETUP_AGENTS` in `setup.service.ts`

- [x] **T3.2** — Implement `setupClaudePromptHook(context, agent)` in `setup.service.ts`
  - Copy `assets/claude/claude-prompt-hook.js` → `~/.claude/hooks/claude-prompt-hook.js`
  - Idempotent merge of `settings-hook.json` entry into `~/.claude/settings.json`

- [x] **T3.3** — Add `claude` agent setup definition with steps `[claude-prompt-hook, built-in-skills]`

- [x] **T3.4** — Write/extend setup service tests for claude agent

### M4: Channel Runner — Agent-Request Store Polling

- [x] **T4.1** — Import `readLatestAgentRequest` from `@ai-devkit/agent-manager` in `channel-runner.ts`

- [x] **T4.2** — Extend `startOutputPolling()` with agent-request polling
  - New state: `lastAgentRequestTimestamp: string | undefined`
  - On each tick (after JSONL block): `readLatestAgentRequest(home, agent.sessionId)`
  - If entry exists and `entry.timestamp !== lastAgentRequestTimestamp`: send `formatPromptMessage(toolName, toolInput)` and update cursor
  - Init seeds `lastAgentRequestTimestamp` from pre-existing file (skip replay on connect)
  - `formatPromptMessage`: `AskUserQuestion` → `[Question] <question or raw JSON>`; others → `[Tool prompt] ToolName:\n<command or JSON>`

- [x] **T4.3** — Write unit tests for agent-request store polling in `channel-runner.test.ts`

### M5: Validate & Tidy

- [x] **T5.1** — Full test suite passes (1,465 tests across 5 packages)
- [x] **T5.2** — TypeScript build clean across all packages
- [x] **T5.3** — All feature docs updated to match final implementation

## Dependencies & Sequencing

```
T1.1 → T1.2
T1.3 (independent)
T2.1 → T2.2
T3.1 → T3.2 → T3.3 → T3.4 (after T1 assets)
T4.1 → T4.2 → T4.3 (after T2)
T5.x after all above
```

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Claude Code version changes `PreToolUse` payload shape | Low | Defensive key reads; `session_id` confirmed present |
| `~/.claude/settings.json` malformed on user's machine | Low | Try/catch; treat as `{}`; no destructive writes |
| Existing setup tests broken by adding claude agent | Very low | Existing tests use `agents: ['codex']` or `agents: ['pi']`; new tests use `agents: ['claude']` |

## Progress Summary

**All tasks complete.** Implementation shipped: M1 hook script + assets, M2 agent-request store in `agent-manager`, M3 claude setup agent, M4 channel-runner agent-request polling. 1,465 tests pass across 5 packages. TypeScript build clean.

**Key scope changes from initial design:**
- `Notification` hook event does not exist in Claude Code; pivoted to `PreToolUse` with matcher `Bash|Edit|Write|MultiEdit|NotebookEdit|AskUserQuestion`.
- Agent-request store moved from CLI to `agent-manager` package (agent/session infrastructure).
- PID file / `waitingFor` guard removed (Claude-specific, complicates multi-agent support).
- `AskUserQuestion` rich formatting deferred; raw JSON forwarded for now.
