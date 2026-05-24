---
phase: planning
title: "Channel Daemon Mode: Planning"
description: Task breakdown for adding daemon start and channel stop
---

# Planning: Channel Daemon Mode

## Milestones

- [x] Milestone 1: Document and review daemon requirements/design
- [x] Milestone 2: Implement daemon lifecycle service
- [x] Milestone 3: Wire CLI options and stop command
- [x] Milestone 4: Add focused tests and verification

## Task Breakdown

### Phase 1: Foundation
- [x] Task 1.1: Identify current channel command structure and bridge execution path.
- [x] Task 1.2: Add daemon state model and state file helpers.
- [x] Task 1.3: Add PID liveness checks with stale state cleanup.

### Phase 2: Core Features
- [x] Task 2.1: Add `--daemon` option to `channel start`.
- [x] Task 2.2: Spawn detached child process for daemon start.
- [x] Task 2.3: Add an internal daemon entrypoint to avoid recursive CLI spawning.
- [x] Task 2.4: Add `channel stop` command that terminates the recorded daemon.

### Phase 3: Integration & Polish
- [x] Task 3.1: Prevent duplicate daemon starts while a recorded daemon is alive.
- [x] Task 3.2: Improve user-facing messages for started, stopped, absent, and stale daemon states.
- [x] Task 3.3: Add unit tests for daemon start/stop behavior.
- [x] Task 3.4: Run CLI/package tests and feature lint.

## Dependencies

- Existing `packages/cli/src/commands/channel.ts` bridge implementation.
- Existing channel service tests and config path conventions.
- Node.js `child_process.spawn` and process signaling.

## Timeline & Estimates

- Foundation: Small
- Core CLI lifecycle: Medium
- Tests and verification: Small to medium

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Detached child cannot be reliably confirmed as healthy immediately | Start may report success before bridge fully connects | Record process spawn success in v1; keep foreground mode for debugging |
| Stale PID points to an unrelated process after PID reuse | Stop could signal the wrong process | Store command metadata and keep stale checks conservative; future work can add heartbeat |
| Duplicate Telegram polling daemons conflict | Bot updates may be consumed unpredictably | Enforce one live daemon state in v1 |

## Resources Needed

- Existing Jest test setup.
- Existing CLI command and channel service patterns.

## Progress Summary

Implemented daemon lifecycle support in the existing channel service and command layer. `channel start --daemon` now spawns a detached `channel-daemon.js` child, records the child PID in the existing bridge registry, and prevents duplicate live bridges. Foreground start and daemon child execution share `runChannelBridge()`. `channel stop [name]` terminates a recorded live bridge with `SIGTERM` and cleans up registry state. Feature lint, CLI lint, CLI build, dependency builds, and the full CLI Jest suite pass.
