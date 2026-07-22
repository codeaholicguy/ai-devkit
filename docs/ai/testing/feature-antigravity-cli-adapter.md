---
phase: testing
title: "Antigravity CLI Adapter in @ai-devkit/agent-manager - Testing"
feature: antigravity-cli-adapter
description: Test strategy and coverage for the Antigravity (`agy`) CLI adapter
---

# Testing Strategy: Antigravity CLI Adapter

## Unit Tests (`AntigravityCliAdapter.test.ts`)
- [x] Exposes `antigravity_cli` type
- [x] `canHandle` true for `agy` (plain + full path + args); false for non-agy / arg-only matches
- [x] `detectAgents` returns `[]` with no processes
- [x] Resolves the conversation via `last_conversations.json` (cwd → id)
- [x] Process-only RUNNING fallback when the cwd is not in the registry
- [x] Process-only when the mapped conversation has no transcript
- [x] `getConversation` maps `USER_INPUT` (`<USER_REQUEST>`) + `PLANNER_RESPONSE` records to roles; excludes MODEL tool calls (RUN_COMMAND) except in verbose; skips malformed lines
- [x] `getConversation` excludes `SYSTEM` records unless verbose
- [x] Status: WAITING on trailing MODEL turn; RUNNING on trailing USER_INPUT; IDLE past threshold
- [x] Agent summary is the last user request
- [x] `listSessions` returns `[]` without a registry; lists from the registry with cwd; applies the cwd filter

## Integration / launch map
- [x] `AGENTS.antigravity_cli.command === 'agy'`; registered in `agent` command + channel runner; `STARTABLE_AGENT_TYPES` includes `antigravity_cli`; `--type antigravity_cli` accepted.

## End-to-End (verified against a real `agy` install)
- [x] `listSessions()` against the real `~/.gemini/antigravity-cli` lists the on-disk conversation with `cwd`, `firstUserMessage`, and the `transcript.jsonl` `sessionFilePath`.
- [x] `getConversation()` against the real transcript returns the `[{user}, {assistant}]` turns (`<USER_REQUEST>` extracted, `MODEL` response, `SYSTEM` skipped).
- [x] `detectAgents()` with a live `agy` process + real registry resolves the cwd, picks the conversation, and surfaces `{type:"antigravity_cli", projectPath:<repo>, summary:<prompt>}`.
- [x] Regression: full `agent-manager` and `cli` suites pass.
