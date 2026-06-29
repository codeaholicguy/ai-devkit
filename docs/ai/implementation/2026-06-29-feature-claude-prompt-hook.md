---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Changed Files

| File | Change |
|---|---|
| `hooks/claude/claude-prompt-hook.js` | NEW — CJS hook; overwrites `~/.ai-devkit/agent-requests/<sessionId>.json` |
| `packages/cli/assets/claude/claude-prompt-hook.js` | NEW — identical copy (installer asset) |
| `packages/cli/assets/claude/settings-hook.json` | NEW — `PreToolUse` hook entry fragment (matcher: all tool types + AskUserQuestion) |
| `packages/agent-manager/src/utils/agent-requests.ts` | NEW — `getAgentRequestPath`, `readLatestAgentRequest`, `writeAgentRequest` |
| `packages/agent-manager/src/__tests__/utils/agent-requests.test.ts` | NEW — 6 unit tests |
| `packages/agent-manager/src/index.ts` | MODIFIED — exports `AgentRequest`, `getAgentRequestPath`, `readLatestAgentRequest`, `writeAgentRequest` |
| `packages/cli/src/services/setup/setup.service.ts` | MODIFIED — `claude` agent; `setupClaudePromptHook()` |
| `packages/cli/src/services/channel/channel-runner.ts` | MODIFIED — `startOutputPolling()` extended with agent-request polling |
| `packages/cli/src/__tests__/services/channel/channel-runner.test.ts` | NEW — agent-request polling tests + AskUserQuestion fixture tests |
| `packages/cli/src/__tests__/services/setup/setup.service.test.ts` | MODIFIED — claude-agent tests appended |

## Key Implementation Notes

### Hook Script — flat file overwrite
Writes to `~/.ai-devkit/agent-requests/<sessionId>.json`. Each invocation overwrites the previous entry. The `timestamp` field (ISO 8601) distinguishes distinct calls and is the dedup key.

### Agent-Request Store — `packages/agent-manager`
Owned by `agent-manager` (agent/session infrastructure), not the CLI. Three exports:
- `getAgentRequestPath(homeDir, sessionId)` — returns the flat file path
- `readLatestAgentRequest(homeDir, sessionId)` — reads the file; null on missing or malformed JSON
- `writeAgentRequest(homeDir, entry)` — creates dir if needed; overwrites file

The CLI imports these from `@ai-devkit/agent-manager`.

### `startOutputPolling()` — ordered sends, timestamp dedupe
1. JSONL block runs first (`if agent.sessionFilePath`).
2. Agent-request block runs second (`if agent.sessionId`).
3. `lastAgentRequestTimestamp` tracks the last forwarded entry; no send if timestamp unchanged.
4. Init seeds `lastAgentRequestTimestamp` from the pre-existing file so pre-existing entries are not replayed on connect.
5. No PID file / `waitingFor` guard — agent-agnostic by design.

### `formatPromptMessage` — AskUserQuestion stays raw
- `AskUserQuestion` with direct `question` string field: `[Question] <question text>`
- `AskUserQuestion` with `questions` array (actual Claude Code payload): `[Question] <raw JSON>` — richer formatting deferred to a future PR
- Other tools: `[Tool prompt] <toolName>:\n<command or JSON>`

### Settings matcher
`"Bash|Edit|Write|MultiEdit|NotebookEdit|AskUserQuestion"` — covers all tool approval prompts and question/selection dialogs.

### Setup idempotency
`setupClaudePromptHook` checks whether any existing `hooks.PreToolUse[].hooks[].command` equals the hook command string before appending.

## Edge Cases

- `agent.sessionFilePath` undefined → JSONL block skipped; agent-request block still runs.
- Agent-request file absent → `readLatestAgentRequest` returns null; no send.
- Agent-request file malformed → returns null; no send; no crash.
- Same `timestamp` across ticks → `lastAgentRequestTimestamp` guard prevents duplicate sends.
- `agent.sessionId` absent → agent-request block skipped entirely.
- Non-Claude agents → no hook writes to `~/.ai-devkit/agent-requests/`; reads return null silently.

## Security

- `session_id` sanitized (`[a-zA-Z0-9\-]` only) before use as filename — prevents path traversal.
- All writes to `~/.ai-devkit/agent-requests/` (user's own home dir only).
- Hook always exits 0; errors swallowed — cannot disrupt Claude Code.
