---
phase: design
title: "Antigravity CLI Adapter in @ai-devkit/agent-manager - Design"
feature: antigravity-cli-adapter
description: Architecture for the Antigravity (`agy`) CLI detection adapter, launch map entry, and CLI wiring
---

# Design: Antigravity CLI Adapter for @ai-devkit/agent-manager

## Responsibilities
- `AntigravityCliAdapter`: discover running `agy` processes, resolve each to its conversation via `cache/last_conversations.json`, read its transcript, emit `AgentInfo`, and enumerate conversations — parsing kept inline like the other recent adapters.
- `AGENTS.antigravity_cli`: launch command (`agy`) + `ps` matcher.
- CLI/channel: register the adapter, label the type, validate `--type`.

## Data model
Reuse `AgentAdapter`, `AgentInfo`, `AgentStatus`, `AgentType`, `SessionSummary`. `AgentType` gains `'antigravity_cli'`.

- `cache/last_conversations.json` (at the CLI home root): `{ <cwd>: <conversationId> }`. The live process cwd is the join key; there is no pid in this file, so `proc.cwd` is the lookup key.
- `brain/<conversationId>/.system_generated/logs/transcript.jsonl`: `{ source, type, created_at, content }` per line. `content` is a string or an array of `{ type: "text", text }` blocks. User prompt = text inside `<USER_REQUEST>...</USER_REQUEST>` of a `type: "USER_INPUT"` record; assistant reply = `type: "PLANNER_RESPONSE"`. Other MODEL records (tool calls like RUN_COMMAND) and `SYSTEM` records are execution detail, skipped unless verbose.

Normalized into `AgentInfo`: `name` ← `generateAgentName(projectPath, pid)`; `projectPath` ← cwd from the registry (else process cwd); `sessionId` ← the conversation id; `summary` ← last `<USER_REQUEST>`; `status` ← time-threshold + last-transcript-role heuristic; `sessionFilePath` ← the conversation's `transcript.jsonl`.

## Component breakdown
1. `packages/agent-manager/src/adapters/AntigravityCliAdapter.ts` (new, self-contained)
   - `canHandle`: argv[0] basename `agy`/`agy.exe`.
   - `detectAgents`: `enrichProcesses(listAgentProcesses('agy'))`; per process resolve cwd → conversationId via `readRegistry()`, read the transcript; live processes with no conversation → process-only RUNNING agents.
   - inline parsing: `readRegistry`, `readSession`, `parseTranscript` (`<USER_REQUEST>` prompts + `PLANNER_RESPONSE` replies), `determineStatus`, `getConversation`.
   - `listSessions`: iterate the `cwd → id` registry, parse each transcript, strict `cwd` filter.
2. `AntigravityCliAdapter.test.ts` (new): fixtures from the captured real format.
3. Exports, launch map, CLI registration, labels, validation.

## Design decisions
- Resolve a live process's conversation from `cache/last_conversations.json` (cwd → id), not from cwd-encoded session dirs; there is one current conversation per workspace.
- Parse `transcript.jsonl` for conversation and summary; take the prompt inside `<USER_REQUEST>...</USER_REQUEST>`.
- `sessionFilePath` points at `transcript.jsonl` so the console's `fs.stat().mtime` cache invalidation tracks conversation growth.
- Keep parsing resilient — a missing/malformed transcript skips the session; adapter-level failures return empty so other adapters still render.
- Independent of the `antigravity` IDE environment (same split as `gemini_cli` vs `gemini`).
