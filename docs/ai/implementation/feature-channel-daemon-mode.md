---
phase: implementation
title: "Channel Daemon Mode: Implementation Guide"
description: Implementation notes for channel daemon start and stop
---

# Implementation Guide: Channel Daemon Mode

## Development Setup

- Work in `feature-channel-daemon-mode`.
- Use `npm ci` from the repository root.
- Run targeted CLI tests during development.

## Code Structure

- `packages/cli/src/commands/channel.ts`: command registration and user-facing messages.
- `packages/cli/src/services/channel/channel-runner.ts`: shared foreground bridge runtime.
- `packages/cli/src/services/channel/channel.service.ts`: bridge registry, daemon spawn, and stop lifecycle.
- `packages/cli/src/channel-daemon.ts`: internal detached child entrypoint.

## Implementation Notes

### Core Features
- `channel start --daemon` validates the same channel and agent arguments as foreground start.
- The parent process spawns a detached `channel-daemon.js` child process.
- The parent process redirects daemon stdout and stderr to `~/.ai-devkit/channel-logs/<channel>.log` and prints that path.
- `channel status` prints the log path for running daemon bridges when it is present in bridge state.
- Foreground start and daemon child execution both call `runChannelBridge()`.
- Dev mode launches `src/channel-daemon.ts` through `ts-node`; built mode launches `dist/channel-daemon.js`.
- `channel stop [name]` reads the existing bridge registry, checks PID liveness, sends `SIGTERM`, and clears state.

### Patterns & Best Practices
- Keep daemon metadata free of secrets.
- Prefer dependency injection for `spawn`, `process.kill`, and filesystem paths in tests.
- Treat stale state as recoverable and remove it before starting a new daemon.

## Integration Points

- Reuse the existing channel resolution and bridge startup logic.
- Persist daemon bridge state in the existing `~/.ai-devkit/channel-bridges.json` registry.
- Persist daemon log location in bridge state as `logPath`.
- Keep channel connector unchanged.

## Error Handling

- No daemon state: print a clear no-op message.
- Stale state: remove it and continue for start, report it for stop.
- Permission or signal failure: show a clear error and keep enough state for manual inspection.

## Performance Considerations

- Daemon start should not block on long-lived bridge loops.
- PID checks should be synchronous and cheap.

## Security Notes

- Do not write bot tokens, chat IDs, or message content to daemon state.
- Treat daemon logs as local operational logs; they capture child process stdout and stderr for debugging.
- Use restrictive file permissions for state files where supported.
