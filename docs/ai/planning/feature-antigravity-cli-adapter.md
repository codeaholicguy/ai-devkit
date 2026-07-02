---
phase: planning
title: "Antigravity CLI Adapter in @ai-devkit/agent-manager - Planning"
feature: antigravity-cli-adapter
description: Task plan for the Antigravity (`agy`) CLI adapter
---

# Planning: Antigravity CLI Adapter

## Key facts
- Conversation source: `brain/<id>/.system_generated/logs/transcript.jsonl`. Live cwd→id from `cache/last_conversations.json`.
- Binary `agy`; home `~/.gemini/antigravity-cli/` (override `ANTIGRAVITY_CLI_HOME`).

## Tasks
- [x] Capture real layout: `agy -p` produces `cache/last_conversations.json` (`{cwd:id}`) + `brain/<id>/.system_generated/logs/transcript.jsonl`.
- [x] Confirm schemas (`{cwd:id}` registry; transcript `{source,type,created_at,content}` with `<USER_REQUEST>` prompts and `MODEL` responses).
- [x] Implement self-contained `AntigravityCliAdapter` (`canHandle`, `detectAgents` via registry, inline `transcript.jsonl` parsing, `getConversation`, `listSessions`) + unit tests.
- [x] Add `'antigravity_cli'` to `AgentType`/`StartableAgentType`; `AGENTS.antigravity_cli` launch map; exports.
- [x] Wire CLI: register in `agent` command + channel runner; `TYPE_LABELS`; `--type` help; `VALID_AGENT_TYPES`.
- [x] Update cli test fixtures (adapter mock, registerAdapter counts, `STARTABLE_AGENT_TYPES`, `--type` list).

## Risks
- Risk: Antigravity CLI schema evolves. Mitigation: defensive parsing, fixtures for partial/malformed inputs.
- Risk: `proc.cwd` unavailable for some processes → falls back to process-only agent (still listed).
