---
phase: testing
title: "Channel Connector: Testing Strategy"
description: Test plan for the channel-connector package (pure messaging bridge)
---

# Testing Strategy: Channel Connector

## Test Coverage Goals

- Unit test coverage target: 100% of new code
- Integration tests: Core message flow paths + error handling
- E2E tests: Manual verification of Telegram round-trip with agent

## Unit Tests

### ChannelManager
- [ ] Register adapter and retrieve by type
- [ ] startAll() calls start() on all registered adapters
- [ ] stopAll() calls stop() on all registered adapters
- [ ] Duplicate adapter type registration throws error
- [ ] getAdapter() returns undefined for unregistered type

### ConfigStore
- [ ] Write config creates file with correct permissions (0600)
- [ ] Read config returns parsed JSON
- [ ] Read missing config returns default empty config
- [ ] Creates ~/.ai-devkit/ directory if missing
- [ ] Handles corrupted JSON gracefully
- [ ] saveChannel() adds entry, removeChannel() removes entry

### TelegramAdapter
- [ ] Starts telegraf bot with correct token
- [ ] Stops bot cleanly
- [ ] Maps telegraf message to IncomingMessage
- [ ] Calls registered MessageHandler on incoming text (fire-and-forget)
- [ ] Handler receives IncomingMessage, returns void
- [ ] Auto-authorizes first user's chatId
- [ ] Rejects messages from non-first-user chat IDs
- [ ] isHealthy() returns correct status
- [ ] sendMessage() sends text to specified chatId
- [ ] sendMessage() chunks messages exceeding 4096 chars at newline boundaries
- [ ] sendMessage() handles messages with no newlines (hard split at 4096)
- [ ] Handles handler errors gracefully (catches, sends error reply)

### CLI Channel Commands (in cli package tests)
- [ ] `channel connect telegram` validates token and persists config
- [ ] `channel list` displays configured channels
- [ ] `channel disconnect telegram` removes config
- [ ] `channel start --agent <name>` resolves agent by name and creates bridge
- [ ] Input handler sends text to agent via TtyWriter (fire-and-forget)
- [ ] Output polling loop detects new assistant messages from getConversation()
- [ ] Output polling loop calls sendMessage() for each new assistant message
- [ ] Polling loop handles agent termination gracefully

## Integration Tests

- [ ] ConfigStore: write then read round-trip
- [ ] TelegramAdapter + mock handler: incoming message triggers handler (void)
- [ ] CLI input handler + mock TtyWriter: message forwarded to agent
- [ ] CLI output loop + mock getConversation: new messages pushed via sendMessage

## Test Data

- Mock telegraf context objects for Telegram adapter tests
- Mock MessageHandler functions for adapter tests
- Temporary directory for ConfigStore file tests
- Mock AgentManager/TtyWriter for CLI handler tests

## Manual Testing

- [ ] Create Telegram bot via BotFather
- [ ] Run `ai-devkit channel connect telegram` with token
- [ ] Run `ai-devkit channel list` — verify telegram shown
- [ ] Start an agent (e.g., Claude Code)
- [ ] Run `ai-devkit channel start --agent <agent-id>`
- [ ] Send message in Telegram — verify agent receives input
- [ ] Verify agent response appears in Telegram
- [ ] Kill agent — verify error message in Telegram
- [ ] Test reconnection after network interruption
- [ ] Run `ai-devkit channel disconnect telegram` — verify removal
