---
phase: requirements
title: Agent Detail Command
description: CLI command to fetch detailed information about a running agent including session data and conversation history
---

# Requirements & Problem Understanding

## Problem Statement

Users of `ai-devkit` can list running agents via `agent list`, but there is no way to inspect the full details of a specific agent. When debugging, monitoring, or reviewing an agent's work, users need to see:

- The session ID and metadata (cwd, start time)
- Current status
- The full conversation history (all messages)

Currently, users must manually navigate to `~/.claude/projects/` or `~/.codex/sessions/`, find the correct JSONL file, and parse it themselves.

## Goals & Objectives

**Primary goals:**
- Provide a `ai-devkit agent detail --id <identifier>` command that displays comprehensive agent information
- Show session metadata: session ID, cwd, start time, current status
- Show the last N conversation messages by default, with `--full` to show all and `--tail <n>` to control count
- Show text content by default; `--verbose` to include tool call/result details

**Non-goals:**
- Editing or modifying session data
- Real-time streaming/tailing of the conversation
- Exporting conversation to external formats (PDF, HTML, etc.)
- Supporting terminated/non-running agents (only agents visible in `agent list`)

## User Stories & Use Cases

- **As a developer**, I want to run `ai-devkit agent detail --id "abc"` so that I can see what a specific agent has been doing, including its recent conversation.
- **As a team lead**, I want to inspect an agent's session details (start time, status, cwd) to understand its context and current state.
- **As a developer**, I want JSON output (`--json` flag) so I can pipe agent details into other tools for analysis.
- **As a developer**, I want `--verbose` to see tool call details when debugging what an agent actually executed.
- **As a developer**, I want `--full` or `--tail <n>` to control how much conversation history is shown.

**Key workflows:**
1. User runs `agent list` to see all running agents
2. User picks an agent name from the list
3. User runs `agent detail --id <name>` to see details + recent conversation
4. Output shows metadata header + last N conversation messages (text only by default)

**Edge cases:**
- Agent name matches multiple agents → show error with available matches
- Agent name matches no agent → show error with available agents
- Session file is missing or corrupted → graceful error message
- Agent is from Codex (not just Claude) → adapter-agnostic detail fetching

## Success Criteria

- `ai-devkit agent detail --id <name>` resolves the agent by name and displays:
  - Session ID
  - CWD (working directory)
  - Start time
  - Current status
  - Last 20 conversation messages (text only) by default
- `--full` shows entire conversation history
- `--tail <n>` shows last N messages
- `--verbose` includes tool call/result details in messages
- `--json` flag outputs structured JSON
- Works for both Claude Code and Codex agents
- Only works for running agents (those visible in `agent list`)
- Handles ambiguous/missing names gracefully with helpful messages
- Uses existing `AgentManager.resolveAgent()` for name resolution

## Constraints & Assumptions

- Reuses the existing adapter architecture (`AgentManager`, `ClaudeCodeAdapter`, `CodexAdapter`)
- Session data is read from JSONL files already discovered during agent detection
- The conversation reader needs access to the session file path, which is available via the matched `SessionFile`
- Conversation parsing must handle both Claude and Codex JSONL formats
- Must not break existing `agent list`, `agent open`, or `agent send` commands

## Resolved Questions

- **Identifier type:** Accept agent name only (from `agent list` output), not session IDs or slugs
- **Conversation length:** Show last 20 messages by default; `--full` for all, `--tail <n>` for custom count
- **Tool use display:** Text-only by default; `--verbose` includes tool call/result details
- **Non-running agents:** Not supported — only agents with a running process (visible in `agent list`)
