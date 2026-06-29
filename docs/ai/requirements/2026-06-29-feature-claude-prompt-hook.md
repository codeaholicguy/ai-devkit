---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

When a user connects a Telegram channel to a running Claude Code agent via `ai-devkit channel run`, the channel-runner polls the session JSONL file for new `assistant`/`system` messages and forwards them to Telegram. Claude Code does **not** write interactive prompts — tool approval requests and question/selection dialogs — into the session JSONL. As a result:

- The remote Telegram user never sees "Claude wants to run: `rm -rf /tmp/test` — approve?" prompts.
- Claude sessions get stuck silently waiting; the user has no idea why.

**Who is affected?** Developers using `ai-devkit channel run` to remotely supervise a Claude Code agent via Telegram.

**Current workaround:** None — users must be at the terminal to see approval prompts.

## Goals & Objectives

### Primary Goals
1. Capture Claude Code `PreToolUse` hook events (tool approval prompts and `AskUserQuestion` dialogs) and persist them to `~/.ai-devkit/agent-requests/<session-id>.json`.
2. Extend the channel-runner to poll the agent-request store alongside the JSONL and forward new entries to Telegram.
3. Add a `claude` agent setup step to `ai-devkit setup` that installs the hook script and registers it in `~/.claude/settings.json`.

### Secondary Goals
4. Keep the hook script as a standalone, dependency-free Node.js CJS script.
5. Avoid sending duplicate messages: JSONL-polled messages and agent-request entries are distinct event streams.

### Non-Goals
- Modifying the Claude Code binary or JSONL format.
- Rich formatting of `AskUserQuestion` payloads in this PR — forwarded as raw JSON; richer formatting is a future PR.
- Building a reply-to-prompt UI in Telegram; the existing `TtyWriter` path handles user input.

## User Stories & Use Cases

- **As a remote developer**, I want tool approval prompts from Claude to appear in my Telegram chat so I can decide whether to allow the action.
- **As a remote developer**, I want question/selection prompts from Claude to appear in Telegram, even if in raw JSON form.
- **As a developer setting up ai-devkit**, I want `ai-devkit setup --agent claude` to install the hook automatically so I don't have to edit `~/.claude/settings.json` manually.
- **As an ai-devkit contributor**, I want the setup step to be idempotent: re-running it must not duplicate the hook entry.

**Key workflow:**
1. User runs `ai-devkit setup --agent claude` → hook script installed to `~/.claude/hooks/claude-prompt-hook.js`, `~/.claude/settings.json` updated with `PreToolUse` hook entry (matcher: `Bash|Edit|Write|MultiEdit|NotebookEdit|AskUserQuestion`).
2. User starts Claude Code session, then runs `ai-devkit channel run <channel> <agent>`.
3. Claude Code fires `PreToolUse` hook → hook script overwrites `~/.ai-devkit/agent-requests/<session-id>.json` with `{ sessionId, toolName, toolInput, timestamp }`.
4. Channel-runner polls the agent-request store every 2 s → new `timestamp` detected → sends `[Tool prompt] ToolName:\n<command or JSON>` or `[Question] <text>` to Telegram.
5. Remote user reads the prompt and types a response in Telegram → `TtyWriter` sends it to the Claude terminal.

**Edge cases:**
- Session ID not yet resolved when polling starts → file doesn't exist → `readLatestAgentRequest` returns null → no-op.
- Hook fires before channel-runner starts → file exists at init time; channel-runner seeds `lastAgentRequestTimestamp` from it and does not re-send on first tick.
- `AskUserQuestion` payload uses `toolInput.questions` array (not a flat `question` field) → falls through to `JSON.stringify(toolInput)` → raw JSON in Telegram.

## Success Criteria

1. `ai-devkit setup --agent claude` creates `~/.claude/hooks/claude-prompt-hook.js` and adds `PreToolUse` hook entry to `~/.claude/settings.json`; re-running does not duplicate the entry.
2. When Claude Code fires a `PreToolUse` event, the hook script overwrites `~/.ai-devkit/agent-requests/<session-id>.json` with the entry.
3. The channel-runner detects the new entry within one poll interval (≤ 4 s) and sends the formatted message to Telegram.
4. Regular JSONL assistant/system messages continue to flow to Telegram unchanged (no regression).
5. All new code paths have unit test coverage; existing tests continue to pass.

## Constraints & Assumptions

- Hook script must be CJS, dependency-free, runnable by `node` — Claude Code's `PreToolUse` hook fires the command as a subprocess.
- `~/.claude/settings.json` uses a `hooks` key with `{ PreToolUse: [{ matcher, hooks: [{ type, command, timeout }] }] }` schema.
- Claude Code passes the `PreToolUse` payload as JSON on stdin; payload contains `session_id`, `tool_name`, `tool_input`.
- `agent-requests` read/write API lives in `@ai-devkit/agent-manager` (agent/session infrastructure, not CLI-specific).

## Questions & Open Items

- **Q (Deferred)**: Richer formatting for `AskUserQuestion` `questions` array payloads. Deferred to a follow-up PR.
- **Q (Deferred)**: Prompt store cleanup / TTL. Files are small; cleanup is a future `ai-devkit doctor` concern.
