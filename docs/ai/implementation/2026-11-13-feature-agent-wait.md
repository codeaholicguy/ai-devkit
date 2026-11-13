---
phase: implementation
title: Implementation Guide
description: What shipped for daemon status-change events and `agent wait`
---

# Implementation Guide

## Development Setup

- Build the dependency packages before running the CLI tests or typecheck: `npm run build` at the repo root. Stale `dist` typings otherwise show up as unrelated `tsc` errors.
- Build the daemon for smoke tests with `cargo build -p devkitd`, then point at it with `DEVKITD_BIN=rust/target/debug/devkitd`.

## Code Structure

| File | Change |
|---|---|
| `rust/crates/devkitd/src/server.rs` | `status_changes(prev, cur)` (pure function) and an `agent.status_changed` emit in `apply_sweep` after the appeared events |
| `packages/cli/src/services/agent/agent-wait.service.ts` | `parseWaitUntil`, `diffAgentChanges`, `waitForAgentChanges`, the `AgentWaitSource` interface, and constants |
| `packages/cli/src/commands/agent/wait.command.ts` | The command: options, `--id`/`--group` resolution, the daemon-backed source, output |
| `packages/cli/src/commands/agent/agent.command.ts` | Registers `wait` |
| `skills/agent-orchestration/SKILL.md` | Loop step 5 uses `agent wait` instead of `sleep` |
| `skills/agent-management/SKILL.md` | Command list includes `agent wait` |
| `web/content/docs/8-agent-management.md` | New "Wait for Agent Changes" section |

## Implementation Notes

- **Event payload:** `{ pid, sessionId, from, to, agent }`. Rows are matched by `(pid, session_id)`, so each session of a multi-session process is diffed on its own.
- **Wake handling:** the source calls `onWake` for any event whose kind starts with `agent.`. The loop never reads event payloads. Each check re-reads the list through `manager.listAgents({ enriched })` so it matches `agent list`.
- **Wake coalescing:** a wake that lands while a check is running sets `pendingWake`, and the next sleep returns at once, so a burst of events produces exactly one follow-up check.
- **Settle window:** 200ms. It opens on the first change and is capped at the deadline. For repeated changes to the same agent, the result keeps the first `from` and the latest `to`.
- **Watched keys:** `type:pid`. `--id`/`--group` resolve once against a fresh list, using `manager.resolveAgent` and the same not-found/ambiguous rules as `send`.

## Integration Points

- The daemon socket: `subscribe` with `liveOnly: true` and `agent.list` on the same connection. The smoke test confirmed that requests still work after subscribing.
- The console TUI already refreshes on any daemon event, so it now also refreshes on status changes, with no code change.

## Error Handling

- A failed daemon `agent.list` falls back to local detection for that check.
- A failed `subscribe` is logged with `--debug`, and the wait relies on the 30s re-check.
- If a list fails during target resolution, the source is closed before the error propagates. `waitForAgentChanges` closes the source in `finally`.

## Performance Considerations

- With the daemon there is no per-waiter scanning: one cache read per wake-up and per 30s re-check.
- Measured in the smoke test: with the original 2s settle window, the wait returned about 3.5s after a session change. With 200ms, three smoke runs returned 2242ms, 271ms and 255ms after the change. The spread is where the change landed in the 2s sweep cycle; the upper bound is about 2.2s.

## Security Notes

- No new surface. It uses the existing same-uid daemon socket.
