---
phase: implementation
title: "Antigravity CLI Adapter in @ai-devkit/agent-manager - Implementation"
feature: antigravity-cli-adapter
description: Implementation notes for the Antigravity (`agy`) CLI adapter
---

# Implementation: Antigravity CLI Adapter

## What shipped
- `packages/agent-manager/src/adapters/AntigravityCliAdapter.ts` — self-contained adapter.
- `AgentType`/`StartableAgentType` gain `'antigravity_cli'`; `AGENTS.antigravity_cli = { command: 'agy', matches: matchArgv0('agy') }`; exported from `adapters/index.ts` and `index.ts`.
- CLI: registered in `commands/agent.ts` and `services/channel/channel-runner.ts`; `TYPE_LABELS.antigravity_cli = 'Antigravity CLI'`; `--type` help + `VALID_AGENT_TYPES` updated.

## Notes
- Home: `~/.gemini/antigravity-cli/` (override via `ANTIGRAVITY_CLI_HOME`). A live process is resolved to its conversation via `cache/last_conversations.json` (`{cwd:id}`); the process cwd is the join key.
- Parsing: `transcript.jsonl` → user prompts are the text inside `<USER_REQUEST>...</USER_REQUEST>` of `type:'USER_INPUT'` records; the assistant reply is a `type:'PLANNER_RESPONSE'` record; other MODEL records (tool calls like RUN_COMMAND) and `SYSTEM` records are skipped unless verbose. `lastActive` is the newest record `created_at` (else file mtime).
- `AgentInfo.sessionFilePath` / `SessionSummary.sessionFilePath` point at `transcript.jsonl`; `getConversation` accepts the file path, a session dir, or a bare conversation id.

## Patterns & best practices
- Mirror `GrokCliAdapter`'s shape (registry JSON + transcript JSONL), parsing kept **inline** like the other recent adapters.
- Fail soft: a missing/malformed `transcript.jsonl` skips the session; adapter-level failures return empty so other adapters still render.

## Error handling
- Missing `cache/last_conversations.json` → empty registry, no throw.
- Mapped conversation with no transcript → process-only RUNNING agent.
- A live `agy` process whose cwd is not in the registry → process-only RUNNING agent.
