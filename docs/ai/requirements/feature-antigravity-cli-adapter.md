---
phase: requirements
title: "Antigravity CLI Adapter in @ai-devkit/agent-manager - Requirements"
feature: antigravity-cli-adapter
description: Detect, list, and manage Google's Antigravity (`agy`) CLI agents in the ai-devkit control plane
---

# Requirements: Antigravity CLI Adapter for @ai-devkit/agent-manager

## Problem
ai-devkit already configures the Antigravity **IDE** via the `antigravity` environment, but it cannot see or control the Antigravity **CLI** (`agy`). Running `agy` sessions do not show in `agent list`, `agent sessions`, the console, or `agent send`. This mirrors how `gemini` (env) and `gemini_cli` (adapter) are separate; Antigravity needs its CLI adapter.

## Goals
- Detect running `agy` processes and surface them in `agent list` / console.
- List historical Antigravity CLI conversations in `agent sessions --type antigravity_cli`.
- Read a conversation transcript for `agent detail` / `agent send` targeting.
- Keep the existing `antigravity` IDE environment untouched.

## Non-goals
- Launching is data-driven from `AGENTS`; no bespoke start flow.
- No changes to the Antigravity IDE environment or its skill paths.

## On-disk facts (verified against `agy`, Google Gemini-family CLI)
- Home: `~/.gemini/antigravity-cli/` (`ANTIGRAVITY_CLI_HOME` overrides it).
- `cache/last_conversations.json`: a `{ "<cwd>": "<conversationId>" }` map of the current conversation per workspace. This is the join key from a live process's cwd to its conversation.
- Transcript: `brain/<conversationId>/.system_generated/logs/transcript.jsonl`, newline-delimited `{ source, type, created_at, content }`. User turns are `type: "USER_INPUT"` with the prompt inside `<USER_REQUEST>...</USER_REQUEST>`; the model reply is a `type: "PLANNER_RESPONSE"` record. Other MODEL records (tool calls such as RUN_COMMAND) and `SYSTEM` records (conversation history, checkpoints) are non-conversational.
- The `agy` binary's argv[0] basename is `agy`.

## Acceptance
- Unit tests cover: `canHandle`, no-process, registry cwd→id resolution, process-only fallback, missing transcript, transcript conversation extraction, status mapping, `listSessions` + cwd filter.
- Verified end-to-end against a real `agy 0.x` session on disk (`agent-manager:test` and `cli:test` pass).
