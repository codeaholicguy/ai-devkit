---
phase: requirements
title: "Multi Telegram Channels"
description: Support multiple Telegram bot channels, each with its own token and active agent bridge
---

# Requirements: Multi Telegram Channels

## Problem Statement

The current channel feature effectively supports one Telegram channel configuration and one active Telegram bridge process. This blocks users who want to run multiple Telegram bots at the same time, each backed by a different bot token and mapped to a different active agent process.

**Who is affected?** Developers who use ai-devkit to manage multiple long-running agents and want a separate Telegram bot/chat surface for each one.

**Current situation:** The channel connector design stores channels in a named config map, but the CLI flow and examples assume a single `telegram` entry. Starting another Telegram bot with a different token risks overwriting configuration or colliding with the existing bridge process.

## Goals & Objectives

### Primary Goals
- Allow users to configure multiple Telegram channel entries, each with a unique channel name and bot token.
- Allow users to start multiple Telegram bot bridge processes concurrently.
- Bind each started Telegram channel instance to exactly one active agent process.
- Preserve the separation from `feature-channel-connector`: `@ai-devkit/channel-connector` remains a generic messaging pipe with no agent knowledge.
- Keep existing single-channel workflows working for users who already configured `telegram`.

### Secondary Goals
- Make channel names visible in `channel list`, `channel start`, `channel status`, and `channel disconnect`.
- Avoid leaking bot tokens in CLI output, process metadata, logs, or errors.
- Keep the data model extensible for future non-Telegram channel instances.

### Non-Goals
- A single Telegram bot routing to multiple agents from one chat.
- Multi-user or group-chat routing policies beyond the existing authorized chat ID model.
- Slack, WhatsApp, or other adapter implementation work.
- Background daemon management beyond the existing channel process model.
- `channel stop <name>` or managed daemon lifecycle commands. This will be handled by a later daemon feature.
- Shared conversation history across channel instances.

## User Stories & Use Cases

### US-1: Connect a Named Telegram Bot
As a user, I want to connect a Telegram bot token under a channel name so that I can create more than one Telegram channel.

Example:
```bash
ai-devkit channel connect telegram --name personal
ai-devkit channel connect telegram --name work
```

### US-1a: Connect or Update the Default Telegram Bot
As a user, I want `channel connect telegram` without `--name` to use the default `telegram` channel so that the simple single-bot workflow remains unchanged.

Example:
```bash
ai-devkit channel connect telegram
```

This creates `telegram` when it does not exist and updates `telegram` when it already exists.

### US-2: List All Telegram Channel Instances
As a user, I want to list configured channel instances so that I can see each Telegram bot separately.

Example output includes name, type, enabled state, bot username, authorization state, and whether a bridge process is active.

### US-3: Start a Specific Channel for a Specific Agent
As a user, I want to start a named Telegram channel with a selected agent so that each bot chats with the intended agent.

Example:
```bash
ai-devkit channel start personal --agent codex-main
ai-devkit channel start work --agent claude-review
```

### US-4: Run Multiple Bridges Concurrently
As a user, I want to run several Telegram channel bridge processes at the same time so that I can chat with multiple agents through different bots.

### US-5: Disconnect One Channel Without Affecting Others
As a user, I want to disconnect a named Telegram channel so that removing one bot does not remove other channel configs.

Example:
```bash
ai-devkit channel disconnect personal
```

### Edge Cases
- Starting a non-existent channel name fails with a clear message and shows available channel names.
- Starting a channel whose bot token is invalid fails without affecting other channels.
- Starting the same channel name twice should fail or identify the already-running bridge process.
- Two configured channels cannot share the same name.
- Two different configured channels cannot share the same Telegram bot token. Updating the same channel with the same token is allowed.
- Unauthorized chat IDs remain scoped to the individual channel instance.
- Existing `telegram` config entries should be migrated or read as the default channel instance.
- `channel start --agent <agent-name>` remains valid only when the target channel can be resolved unambiguously; otherwise the user must pass a channel name.

## Success Criteria

1. A user can configure at least two Telegram channel entries with different tokens.
2. A user can start two channel bridge processes concurrently, each mapped to a different active agent.
3. Messages sent to bot A are forwarded only to agent A; messages sent to bot B are forwarded only to agent B.
4. Agent responses from agent A are sent only through bot A; responses from agent B are sent only through bot B.
5. `channel list` and `channel status` clearly distinguish configured and running channel instances by name.
6. Existing single-channel `telegram` users have a documented compatibility path.
7. `channel connect telegram` without `--name` creates or updates the default `telegram` channel entry.
8. Duplicate Telegram bot tokens are rejected across different channel entries.
9. Unit and integration tests cover config storage, CLI argument parsing, process identity, and per-channel routing.

## Constraints & Assumptions

### Constraints
- Must continue using Telegram Bot API long polling.
- Must follow existing monorepo TypeScript, Jest, and CLI command patterns.
- Must not add an agent-manager dependency to `@ai-devkit/channel-connector`.
- Bot tokens must remain secret and stored with restrictive file permissions.
- Bridge process metadata must identify channel instance and agent mapping without storing full tokens.

### Assumptions
- Feature name is `multi-telegram-channels`.
- A channel instance name is kebab-case or otherwise CLI-safe.
- The default existing channel name remains `telegram` for backwards compatibility.
- Users can specify a channel instance name with `--name`.
- When `channel connect telegram` is called without `--name`, the CLI creates or updates the default `telegram` channel entry.
- Users provide one Telegram bot token per concurrently running Telegram bot.
- Agent process identity is still resolved by the CLI through agent-manager.

## Questions & Open Items

- None blocking for Phase 2 review.
