---
phase: testing
title: "Channel Daemon Mode: Testing Strategy"
description: Test coverage plan for channel daemon start and stop
---

# Testing Strategy: Channel Daemon Mode

## Test Coverage Goals

- Cover all new daemon lifecycle branches in unit tests.
- Keep foreground `channel start` behavior covered by existing tests.
- Avoid tests that require a real Telegram bot or real long-running child process.

## Unit Tests

### ChannelService
- [x] Starts a daemon by spawning a detached child process and writing state.
- [x] Redirects daemon stdout and stderr to the per-channel log file.
- [x] Refuses to start when recorded daemon PID is alive.
- [x] Removes stale state when recorded PID is not alive.
- [x] Stops a running bridge with `SIGTERM` and clears state.
- [x] Requires a channel name when multiple live bridges are running.

### Channel Command
- [x] `channel start --daemon` delegates to daemon service.
- [x] `channel start` without `--daemon` uses existing foreground behavior.
- [x] Daemon start launches `channel-daemon.js` instead of using a hidden CLI child option.
- [x] Dev-mode daemon start launches `channel-daemon.ts` through `ts-node`.
- [x] `channel stop` delegates to daemon stop and prints useful output.
- [x] `channel start --daemon` prints the daemon log path.
- [x] `channel status` shows the daemon log path for a running bridge.

## Integration Tests

- [x] CLI command parser accepts `channel start <name> --agent <name> --daemon`.
- [x] CLI command parser accepts `channel stop`.

## End-to-End Tests

- Manual later: connect a Telegram channel, start daemon bridge, send a message, stop daemon, confirm no further messages are processed.

## Test Data

- Temporary daemon state directory.
- Mock child process spawn result.
- Mock PID liveness and kill behavior.

## Test Reporting & Coverage

- Run targeted CLI tests after implementation.
- Run `npx ai-devkit@latest lint --feature channel-daemon-mode`.

Targeted evidence:
- `npx jest src/__tests__/commands/channel.test.ts src/__tests__/services/channel/channel.service.test.ts --runInBand`: 35 passed.
- `npm run test --workspace packages/cli -- --runInBand`: 35 suites passed, 559 tests passed.
- `npm run build`: 4 projects built successfully.

## Manual Testing

- Optional manual Telegram smoke test requires a real bot token and a running agent.

## Performance Testing

- Not required for v1; daemon lifecycle operations are local process and file operations.

## Bug Tracking

- Regressions should be covered by focused Jest tests before broader CLI test execution.
