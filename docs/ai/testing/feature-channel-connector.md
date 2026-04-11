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

## Coverage Results

```
---------------------|---------|----------|---------|---------|
File                 | % Stmts | % Branch | % Funcs | % Lines |
---------------------|---------|----------|---------|---------|
All files            |     100 |      100 |     100 |     100 |
 ChannelManager.ts   |     100 |      100 |     100 |     100 |
 ConfigStore.ts      |     100 |      100 |     100 |     100 |
 TelegramAdapter.ts  |     100 |      100 |     100 |     100 |
---------------------|---------|----------|---------|---------|
```

**34 tests, all passing.**

## Test Files

- `packages/channel-connector/src/__tests__/ChannelManager.test.ts` (8 tests)
- `packages/channel-connector/src/__tests__/ConfigStore.test.ts` (12 tests)
- `packages/channel-connector/src/__tests__/adapters/TelegramAdapter.test.ts` (14 tests)

## Unit Tests

### ChannelManager (8 tests)
- [x] Register adapter and retrieve by type
- [x] startAll() calls start() on all registered adapters
- [x] stopAll() calls stop() on all registered adapters
- [x] Duplicate adapter type registration throws error
- [x] getAdapter() returns undefined for unregistered type
- [x] startAll() works with no adapters
- [x] stopAll() works with no adapters
- [x] Returns registered adapter by type

### ConfigStore (12 tests)
- [x] Uses default path when no configPath provided
- [x] Write config creates file with correct permissions (0600)
- [x] Read config returns parsed JSON
- [x] Read missing config returns default empty config
- [x] Creates parent directory if missing
- [x] Handles corrupted JSON gracefully
- [x] saveChannel() adds entry
- [x] saveChannel() preserves existing channels
- [x] removeChannel() removes entry
- [x] removeChannel() handles non-existent channel
- [x] getChannel() returns entry
- [x] getChannel() returns undefined for non-existent channel

### TelegramAdapter (14 tests)
- [x] Returns type "telegram"
- [x] Starts telegraf bot with correct token
- [x] Stops bot cleanly
- [x] Silently ignores messages when no handler registered
- [x] Maps telegraf message to IncomingMessage
- [x] Calls registered MessageHandler on incoming text (fire-and-forget)
- [x] Handles handler errors gracefully (Error instance)
- [x] Handles handler errors gracefully (non-Error thrown)
- [x] isHealthy() returns true after start
- [x] isHealthy() returns false before start
- [x] isHealthy() returns false after stop
- [x] sendMessage() sends text to specified chatId
- [x] sendMessage() chunks messages exceeding 4096 chars at newline boundaries
- [x] sendMessage() handles messages with no newlines (hard split at 4096)

### CLI Channel Commands
CLI channel commands are integration-tested via manual E2E testing (requires running agent and Telegram bot).

## Manual Testing

- [ ] Create Telegram bot via BotFather
- [ ] Run `ai-devkit channel connect telegram` with token
- [ ] Run `ai-devkit channel list` — verify telegram shown
- [ ] Start an agent (e.g., Claude Code)
- [ ] Run `ai-devkit channel start --agent <agent-name>`
- [ ] Send message in Telegram — verify agent receives input
- [ ] Verify agent response appears in Telegram
- [ ] Kill agent — verify error message in Telegram
- [ ] Test reconnection after network interruption
- [ ] Run `ai-devkit channel disconnect telegram` — verify removal
