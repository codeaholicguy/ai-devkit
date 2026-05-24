---
phase: implementation
title: "Multi Telegram Channels: Implementation Guide"
description: Technical notes for implementing named Telegram channel instances
---

# Implementation Guide: Multi Telegram Channels

## Development Setup

- Work in branch/worktree `feature-multi-telegram-channels`.
- Use the root `package-lock.json` and `npm ci` for dependency bootstrap.
- Validate feature docs with `npx ai-devkit@latest lint --feature multi-telegram-channels`.

## Code Structure

Expected touch points:

- `packages/channel-connector/src/ConfigStore.ts`
- `packages/channel-connector/src/types.ts`
- `packages/channel-connector/src/__tests__/ConfigStore.test.ts`
- `packages/cli/src/commands/channel.ts`
- `packages/cli/src/__tests__/commands/channel.test.ts`
- `packages/cli/src/services/channel/channel.service.ts`
- `packages/cli/src/__tests__/services/channel/channel.service.test.ts`

## Implementation Notes

### Named Channel Instances

- Treat the `channels` record key as the channel instance name.
- Do not use channel type as the unique identifier once a name is available.
- Keep `telegram` as the default compatibility name.

### CLI Parsing

- Prefer `channel start <name> --agent <agent-name>` for explicit multi-channel use.
- Preserve `channel start --agent <agent-name>` when the target channel can be resolved unambiguously.
- Add `--name <name>` to `channel connect telegram`.
- When connecting without `--name`, create or update the default `telegram` channel entry.
- Reject duplicate Telegram bot tokens across channel entries.
- Do not implement `channel stop <name>` in this feature.

### Runtime Isolation

- Create a new Telegram adapter per bridge process.
- Keep `activeChatId`, output polling cursor, and agent mapping inside the bridge context.
- Register running process metadata under channel name.
- Initialize `activeChatId` from the selected channel entry's `authorizedChatId` when present.
- Persist the first accepted chat ID back to the same channel entry when no authorization exists.
- Use a dedicated channel bridge metadata file to report running status and prune stale bridge PIDs.

## Implemented Behavior

- `channel connect telegram --name <name>` stores a named Telegram channel.
- `channel connect telegram` creates or updates the default `telegram` channel.
- Duplicate Telegram bot tokens are rejected across different channel names.
- `channel list` includes authorization and bridge running state.
- `channel disconnect <name>` removes a named channel.
- `channel start [name] --agent <agent>` starts the selected channel; omitting `name` is allowed only when exactly one Telegram channel is configured.
- `channel status [name]` reports configured channel details plus live bridge metadata.
- `channel stop <name>` remains out of scope.

## Integration Points

- `ConfigStore` persists named channel entries in `~/.ai-devkit/channels.json`.
- `ChannelService` owns channel naming, duplicate-token validation, live bridge lookup, bridge registration/removal, and active foreground bridge metadata persistence in `~/.ai-devkit/channel-bridges.json`.
- CLI resolves agents through `@ai-devkit/agent-manager`.
- Telegram adapter continues to own Bot API long polling and message sending.

## Error Handling

- Unknown channel name: show a clear error and available names.
- Ambiguous default start: require explicit channel name.
- Already-running channel name: fail clearly and show the existing bridge PID when available.
- Invalid token: reject connect/start without printing the token.
- Duplicate token: reject connect/update without printing the token.

## Performance Considerations

- Each channel bridge has its own Telegram long-polling loop and agent output polling loop.
- Avoid shared timers or global mutable chat state that can cross channel boundaries.

## Security Notes

- Never log bot tokens.
- Keep config permissions at `0600`.
- Scope authorized chat IDs to the channel instance.
- Do not write transcript content into bridge process metadata.

## Verification Evidence

- `packages/cli`: `npm test -- --runTestsByPath src/__tests__/commands/channel.test.ts src/__tests__/services/channel/channel.service.test.ts` passed with 25 tests.
- `packages/cli`: `npm test -- --coverage --runTestsByPath src/__tests__/services/channel/channel.service.test.ts --collectCoverageFrom=src/services/channel/channel.service.ts --coverageThreshold='{}'` reported `channel.service.ts` at 92.85% statements, 83.33% branches, 93.33% functions, 92.3% lines.
- `packages/cli`: `npm run build` passed.
- `packages/cli`: `npm run lint` passed with 0 errors and 4 pre-existing warnings outside touched files.
- `packages/channel-connector`: `npm test -- --runTestsByPath src/__tests__/ConfigStore.test.ts` passed with 13 tests.
