---
phase: testing
title: "Multi Telegram Channels: Testing Strategy"
description: Test plan for named Telegram channel instances and concurrent bridge processes
---

# Testing Strategy: Multi Telegram Channels

## Test Coverage Goals

- Target 100% coverage for new or changed branching logic.
- Cover compatibility with the existing implicit `telegram` channel.
- Cover multi-channel config, command parsing, ambiguity handling, and bridge process metadata.

## Unit Tests

### ConfigStore
- [ ] Save two Telegram entries with different names and tokens.
- [ ] Preserve separate `authorizedChatId` values for each channel entry.
- [ ] Remove one channel without changing the other.
- [ ] Reject invalid channel names if validation is implemented in ConfigStore.

### CLI Channel Command
- [ ] `connect telegram --name personal` stores a `personal` channel entry.
- [ ] `connect telegram` without `--name` creates or updates the default `telegram` entry.
- [ ] Duplicate Telegram bot tokens are rejected without printing the token.
- [ ] `list` shows multiple configured Telegram entries.
- [ ] `disconnect personal` removes only `personal`.
- [ ] `start --agent <agent>` works with only the default `telegram` channel.
- [ ] `start --agent <agent>` fails with a clear ambiguity error when multiple Telegram channels exist.
- [ ] `start personal --agent <agent>` starts the selected channel.

### Channel Bridge Registry
- [ ] Running bridge metadata includes `channelName`.
- [ ] Multiple bridge metadata entries can exist concurrently.
- [ ] Looking up status by channel name returns the correct bridge.
- [ ] Stale bridge PIDs are pruned before status/start decisions.
- [ ] Shutdown cleanup removes only the current channel metadata.

## Integration Tests

- [ ] CLI connect/list/disconnect flow with a temporary config path.
- [ ] CLI start flow with mocked Telegram adapter and mocked agent-manager agent.
- [ ] Per-channel message handler forwards bot A messages only to agent A.
- [ ] Per-channel output polling sends agent A output only through bot A.
- [ ] First accepted chat ID is persisted to the selected channel entry only.
- [ ] Invalid or missing channel name does not instantiate a Telegram adapter.

## End-to-End Tests

- [ ] Configure two real Telegram bot tokens.
- [ ] Start two active agent processes.
- [ ] Start two channel bridge processes, one per channel-agent pair.
- [ ] Send messages to each Telegram bot and confirm responses are isolated.
- [ ] Stop one bridge and confirm the other bridge continues working.

## Test Data

- Temporary `channels.json` with `personal` and `work` entries.
- Mock bot tokens that are never printed in snapshots.
- Mock agent records with different names, PIDs, and session files.

## Test Reporting & Coverage

- Run focused package tests after implementation.
- Run root test suite if command runtime remains reasonable.
- Run `npx ai-devkit@latest lint --feature multi-telegram-channels` before phase transitions.

## Manual Testing

- Manual Telegram E2E requires real bot tokens and active network access.
- Confirm token redaction in command output and error messages.

## Performance Testing

- Start two mocked bridge contexts and confirm polling loops stay independent.
- Verify no shared global state causes cross-channel message delivery.

## Bug Tracking

- Treat cross-channel message leakage, token leakage, or wrong-agent routing as blocking severity.
