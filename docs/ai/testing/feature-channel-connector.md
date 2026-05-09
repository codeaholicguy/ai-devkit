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
 utils/telegramHtml.ts |   100 |      100 |     100 |     100 |
---------------------|---------|----------|---------|---------|
```

**54 tests, all passing.**

## Test Files

- `packages/channel-connector/src/__tests__/ChannelManager.test.ts` (8 tests)
- `packages/channel-connector/src/__tests__/ConfigStore.test.ts` (12 tests)
- `packages/channel-connector/src/__tests__/adapters/TelegramAdapter.test.ts` (20 tests)
- `packages/channel-connector/src/__tests__/utils/telegramHtml.test.ts` (14 tests)

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

### TelegramAdapter (20 tests)
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
- [x] sendMessage() sends plain text with parse_mode HTML
- [x] sendMessage() renders markdown to Telegram HTML (`**bold**`, `*italic*`, `` `code` ``)
- [x] sendMessage() chunks messages exceeding 4096 chars
- [x] sendMessage() hard-splits at 4096 when no newlines
- [x] sendMessage() prefers paragraph (`\n\n`) boundaries over single `\n`
- [x] sendMessage() retries chunk as plain text on Telegram parse-entities rejection
- [x] sendMessage() detects parse-entities marker on `message` field too
- [x] sendMessage() decodes HTML entities (`&lt;`, `&amp;`, etc.) when falling back
- [x] sendMessage() propagates non-parse-entities errors without retry

### markdownToTelegramHtml (14 tests)
- [x] Renders bold, italic, strikethrough
- [x] Renders inline code and fenced code with language hint
- [x] Renders links and converts headings to bold
- [x] Renders images as alt-text links
- [x] Falls back to URL when image has no alt text
- [x] Renders unordered lists with `•` bullets (no `<ul>`)
- [x] Renders ordered lists with numeric prefixes (no `<ol>`)
- [x] Renders tables as ASCII inside `<pre>`
- [x] Uses `<blockquote>` for quoted text
- [x] HTML-escapes special chars in plain text
- [x] HTML-escapes special chars inside code
- [x] Strips raw HTML blocks
- [x] Renders horizontal rule as `———`
- [x] Passes plain text through unchanged

### CLI Channel Commands — `startOutputPolling` (8 tests)
- [x] Seeds `lastMessageCount` from initial getConversation so existing messages are not re-sent
- [x] Skips ticks when no chat is authorized yet
- [x] Skips ticks when agent has no `sessionFilePath`
- [x] Sends new assistant messages to Telegram with the authorized chatId
- [x] Skips messages with role "user" (already delivered to terminal)
- [x] Skips messages with empty/missing content
- [x] Does not crash when `getConversation` throws (agent terminated) — loop continues, next tick recovers
- [x] Logs `ui.error` when `sendMessage` throws but keeps loop alive; failed message is not retried (lastMessageCount advanced) and subsequent messages still flow

Test file: `packages/cli/src/__tests__/commands/channel.test.ts`. Uses jest fake timers + mocked `terminal-ui`, `agentAdapter`, and `telegram` adapter.

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
