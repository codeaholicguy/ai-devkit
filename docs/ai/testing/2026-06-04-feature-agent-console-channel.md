---
phase: testing
title: Agent Console Channel Controls Test Plan
description: Test plan for Telegram daemon controls in agent console
---

# Agent Console Channel Controls Test Plan

## Test Coverage Goals

- Unit test 100% of new action mapping and status formatting logic.
- Component-render tests cover connected and disconnected visual states.
- Existing console shortcut tests remain green.
- Manual smoke validates real Ink rendering after automated tests.

## Unit Tests

### Channel Actions Hook
- [x] Explicit subprocess errors are surfaced for channel start/stop.
- [x] Non-zero exits without stderr use fallback channel action error text.
- [x] Successful channel actions report no error.
- [x] Stop target selection returns the selected agent's connected channel.
- [x] Stop target selection returns no channel when the selected agent is disconnected or missing.

### Action Runner
- [x] `channel-start` action maps to `channel start <selected-channel> --agent <name> --daemon`.
- [x] `channel-stop` action maps to `channel stop <selected-channel>`.
- [x] Channel action arguments are passed as argv entries, not shell strings.

### Channel Status State
- [x] Live bridge records are converted to an agent-name keyed status map.
- [x] Empty live bridge list produces an empty status map.
- [x] Configured channels are read into non-secret selector metadata.
- [x] Refresh errors do not crash the console context.
- [x] Equivalent channel status/config polling results are detected so unchanged data does not update state.

### Channel Selector
- [x] Configured channels are formatted with selected marker, type, bot, and enabled state.
- [ ] Keyboard navigation selects the channel to start. Covered by implementation; render/input integration test not added.
- [ ] Empty channel config renders a useful message. Covered by implementation; render test not added.

### Agent List
- [x] Connected agents render a compact `remote` marker.
- [x] Disconnected agents reserve blank marker spacing.
- [x] List alignment remains stable when only some agents have channel status.

### Preview Pane
- [x] Connected selected agent uses green border color.
- [x] Disconnected selected agent uses the normal border color.
- [x] Connected selected agent shows `Connected: <channel-name>`.
- [x] Preview still renders normally when no agent is selected.

### Footer and Help
- [x] Footer includes `c channel` and `C stop`.
- [x] Help pane documents channel shortcuts.

## Integration Tests

- [ ] `ConsoleAppShell` invokes `channel-start` for the selected agent when a channel is selected after pressing `c`. Covered by implementation; shell input integration test not added.
- [ ] `ConsoleAppShell` invokes `channel-stop` for the selected agent's connected channel when `C` is pressed outside text input. Covered by implementation; shell input integration test not added.
- [ ] Successful channel start refreshes channel state. Covered by implementation; shell integration test not added.
- [ ] Successful channel stop refreshes channel state. Covered by implementation; shell integration test not added.
- [x] Failed channel start/stop error derivation is covered by `useChannelActions` helper tests.

## End-to-End Tests

- [ ] User starts an agent, opens `ai-devkit agent console`, presses `c`, selects a configured channel, and sees connected indicators after daemon start.
- [ ] User presses `C` and sees connected indicators disappear after daemon stop.
- [ ] User sends a Telegram message to the configured bot and sees it delivered to the selected agent.
- [ ] User stops the daemon and confirms no further Telegram messages are processed.

## Test Data

- Mock agents with names and PIDs matching existing console test fixtures.
- Mock `ChannelService.getLiveBridges()` responses for connected/disconnected states.
- Mock `ConfigStore.getConfig()` responses for multiple configured channels.
- Mock `runAction` results for start/stop success and failure.

## Manual Testing

- [ ] Run `npm run dev -- agent console`.
- [ ] Verify footer shows `c channel` and `C stop`.
- [ ] Press `c` on a selected agent with multiple configured channels.
- [ ] Select the intended channel.
- [ ] Verify the daemon starts, list `remote` marker appears, preview border is green, and preview status names the selected channel.
- [ ] Press `C`.
- [ ] Verify the daemon stops and connected indicators clear.

## Performance Testing

- [ ] Switching connected indicators after refresh should be effectively immediate after the CLI action completes.
- [ ] Channel status polling should not introduce visible flicker or block agent preview rendering.

## Reporting

- Coverage command attempted: `npm test --workspace packages/cli -- --coverage src/__tests__/tui/console`.
- Coverage is blocked in this worktree because Vitest resolves from root `node_modules/vitest` but `@vitest/coverage-v8` is installed under `packages/cli/node_modules`; Vitest throws `ERR_MODULE_NOT_FOUND` for `@vitest/coverage-v8`.
- Focused selector tests passed: `npm test -- src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/tui/console/channelStatus.test.ts src/__tests__/tui/console/ChannelSelectPane.test.ts` (3 files, 16 tests).
- New hook-helper test passed: `npm test -- src/__tests__/tui/console/hooks/useChannelActions.test.ts` (1 file, 7 tests).
- Channel status tests passed: `npm test -- src/__tests__/tui/console/channelStatus.test.ts` (1 file, 7 tests).
- Console suite passed: `npm test -- src/__tests__/tui/console` (15 files, 95 tests).
- Full CLI suite passed: `npm test --workspace packages/cli -- --testTimeout=15000` (55 files, 694 tests).
- Note manual Telegram validation separately if bot credentials are not available during automated work.
