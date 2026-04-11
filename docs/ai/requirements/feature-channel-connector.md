---
phase: requirements
title: "Channel Connector: Generic Messaging Bridge"
description: A generic package for connecting to messaging platforms (Telegram, Slack, WhatsApp) with callback-based message handling
---

# Requirements: Channel Connector

## Problem Statement

Developers using ai-devkit can only interact with their AI agents through the terminal. When away from their computer (commuting, in meetings, on mobile), they lose visibility into agent activity and cannot provide input. There is no mechanism to bridge the gap between a running agent and external messaging platforms.

**Who is affected?** Developers who run long-lived agent sessions and need to monitor or interact with them remotely.

**Current workaround:** Developers must return to their terminal or use remote desktop/SSH to check agent status and respond to prompts.

## Goals & Objectives

### Primary Goals
- Build a generic `@ai-devkit/channel-connector` package that provides a clean messaging abstraction for external platforms
- The package is a **pure message pipe** — receives messages, calls a handler, sends back responses. No knowledge of agents.
- Implement Telegram adapter as the first channel (via Bot API)
- CLI integrates channel-connector with agent-manager to bridge agents and messaging platforms

### Secondary Goals
- Design the adapter interface to support future channels (Slack, WhatsApp) without breaking changes
- Keep the package independently useful beyond ai-devkit (generic messaging bridge)

### Non-Goals (Out of Scope for v1)
- Slack and WhatsApp adapters (architecture supports them, but only Telegram is implemented)
- Rich media support (images, files, voice) — text-only for v1
- Multi-user access control (single developer per bot)
- Web dashboard or custom UI
- End-to-end encryption beyond what Telegram provides natively
- Agent-specific logic inside channel-connector (no agent-manager dependency)

## User Stories & Use Cases

### US-1: Connect Telegram
> As a developer, I want to connect my Telegram bot to ai-devkit so that I can interact with my agents from my phone.

**Flow:** `ai-devkit channel connect telegram` → prompts for bot token → validates token → stores config → confirms connection.

### US-2: Start Channel Bridge with Agent
> As a developer, I want to start the channel bridge targeting a specific agent so that all Telegram messages are forwarded to that agent.

**Flow:** `ai-devkit channel start --agent <agent-name>` → resolves agent by name via agent-manager → starts Telegram bot → starts two concurrent loops: (1) incoming messages forwarded to agent via TtyWriter, (2) polling loop observes agent conversation and pushes new output to Telegram.

### US-3: Chat with an Agent via Telegram
> As a developer, I want to send a message in Telegram and have it forwarded to my agent, then receive the agent's response back in Telegram.

**Flow (async, non-blocking):**
1. Developer sends text in Telegram → channel-connector passes it to CLI-provided handler → handler sends to agent via TtyWriter (fire-and-forget, no waiting for response)
2. Separate polling loop in CLI: polls `getConversation()` from agent-manager → detects new assistant messages → calls `connector.sendMessage()` to push response to Telegram

The two directions (input and output) are decoupled. This avoids blocking when agents take time to respond.

### US-4: List Connected Channels
> As a developer, I want to run `ai-devkit channel list` to see all configured channels and their status.

### US-5: Disconnect a Channel
> As a developer, I want to run `ai-devkit channel disconnect telegram` to remove a channel configuration.

### US-6: Receive Agent Output
> As a developer, I want to see all agent output (responses, task completion, errors, prompts for input) in Telegram as they happen, without having to ask.

**Flow:** CLI runs a continuous polling loop that reads the agent's conversation via `getConversation()` from agent-manager. When new assistant messages are detected (by tracking message count/timestamps), CLI calls `connector.sendMessage()` to push them to Telegram. This is the same loop that delivers responses for US-3 — all agent output flows through this single observation mechanism.

### Edge Cases
- Agent terminates while user is chatting → CLI detects via agent-manager, sends notification through channel-connector
- Bot token is invalid or revoked → clear error message on connect and in Telegram
- Multiple Telegram users message the same bot → reject unauthorized users (only bot owner)
- Network interruption → reconnect with backoff, queue messages
- No agent specified at start → CLI shows error with available agents

## Success Criteria

1. Developer can set up Telegram connection in under 2 minutes via CLI
2. Messages round-trip (Telegram → agent → Telegram) in under 5 seconds on stable network
3. `@ai-devkit/channel-connector` has zero dependency on `@ai-devkit/agent-manager`
4. Package follows pluggable adapter pattern for extensibility
5. CLI commands (`channel connect/list/disconnect/start`) work consistently
6. Bot handles disconnections gracefully with automatic reconnection

## Constraints & Assumptions

### Constraints
- Must use Telegram Bot API (not Telegram client API / user accounts)
- `@ai-devkit/channel-connector` must NOT depend on `@ai-devkit/agent-manager` — all integration happens in CLI
- Must follow existing monorepo patterns (Nx, TypeScript, CommonJS, Jest)
- Package must be independently publishable as `@ai-devkit/channel-connector`

### Assumptions
- Developer has a Telegram account and can create a bot via BotFather
- Developer runs ai-devkit on a machine with internet access
- CLI provides the message handler that bridges channel-connector to agent-manager
- One channel session connects to one agent (specified via `--agent <name>` flag, agent identified by `name` field from AgentInfo)

## Resolved Decisions

1. **Output capture**: CLI polls agent conversation via `getConversation(sessionFilePath)` from agent-manager. Tracks last seen message count/timestamp. Detects new assistant messages and pushes to channel via `sendMessage()`. No terminal monitoring needed.
2. **Config storage**: Global at `~/.ai-devkit/channels.json`. Channels are machine-wide, not per-project.
3. **Long-running process**: Foreground process via `ai-devkit channel start` for v1. Background daemon deferred.
4. **Rate limiting**: Skip for v1. Single-user use case.
5. **Agent identification**: By `name` field from `AgentInfo` (e.g., "ai-devkit"). PID is unique for disambiguation if needed.
6. **Message flow**: Fully async/non-blocking. Incoming messages fire-and-forget to agent. Separate polling loop observes agent output and pushes to channel. Handler signature is `Promise<void>`, not `Promise<string>`.

## Open Items

- None blocking for v1.
