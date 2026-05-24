---
phase: planning
title: "Multi Telegram Channels: Planning & Task Breakdown"
description: Implementation plan for named Telegram channel instances and concurrent bridge processes
---

# Planning: Multi Telegram Channels

## Milestones

- [ ] Milestone 1: Confirm existing channel config and process tracking behavior
- [ ] Milestone 2: Add named Telegram channel configuration support
- [ ] Milestone 3: Add per-channel bridge start/status behavior
- [ ] Milestone 4: Add tests and compatibility coverage

## Task Breakdown

### Phase 1: Discovery and Compatibility
- [x] Task 1.1: Inspect current `channel` CLI command implementation and identify type-only assumptions.
- [x] Task 1.2: Inspect `ConfigStore` tests and implementation for multi-entry support.
- [x] Task 1.3: Inspect current channel status behavior and define bridge metadata needs.
- [x] Task 1.4: Define compatibility behavior for legacy `telegram` commands and config.

### Phase 2: Config and CLI Naming
- [x] Task 2.1: Add channel instance name validation helper.
- [x] Task 2.2: Update `channel connect telegram` to accept `--name <name>`.
- [x] Task 2.3: When connecting without `--name`, create or update the default `telegram` channel entry.
- [x] Task 2.4: Update `channel list` output to display all channel names, types, bot usernames, enabled states, and auth states.
- [x] Task 2.5: Update `channel disconnect` to remove by channel name.
- [x] Task 2.6: Reject duplicate Telegram bot tokens without printing the token.

### Phase 3: Runtime Bridge Mapping
- [x] Task 3.1: Update `channel start` to accept an explicit channel name.
- [x] Task 3.2: Keep `channel start --agent <agent>` working when exactly one Telegram channel is available.
- [x] Task 3.3: Create an isolated bridge context per started channel instance.
- [x] Task 3.4: Add channel service files under `packages/cli/src/services/channel/` to track running bridge metadata by `channelName`, `agentName`, `agentPid`, and bridge PID.
- [x] Task 3.5: Update `channel status [name]` to show per-channel process state.
- [x] Task 3.6: Keep `channel stop <name>` out of scope and document that managed stop will arrive with daemon support.

### Phase 4: Tests and Documentation
- [x] Task 4.1: Add `ConfigStore` tests for multiple Telegram entries and per-entry authorized chat IDs.
- [x] Task 4.2: Add CLI tests for connect/list/disconnect with named channels.
- [x] Task 4.3: Add CLI tests for start ambiguity when multiple Telegram channels exist.
- [x] Task 4.4: Add channel service tests for multiple running bridge metadata entries and stale PID pruning.
- [x] Task 4.5: Update implementation and testing docs with final behavior and verification evidence.

## Dependencies

```mermaid
graph LR
    D1["1.1 CLI discovery"] --> C1["2.2 connect --name"]
    D2["1.2 ConfigStore discovery"] --> C1
    D3["1.3 session discovery"] --> R4["3.4 bridge metadata"]
    C1 --> C2["2.3 list names"]
    C1 --> R1["3.1 start <name>"]
    R1 --> R3["3.3 bridge context"]
    R3 --> R4
    R4 --> R5["3.5 status"]
    C2 --> T2["4.2 CLI tests"]
    R1 --> T3["4.3 ambiguity tests"]
    R4 --> T4["4.4 session tests"]
```

## Timeline & Estimates

| Phase | Tasks | Effort |
|-------|-------|--------|
| Discovery and compatibility | 4 tasks | Small |
| Config and CLI naming | 5 tasks | Medium |
| Runtime bridge mapping | 6 tasks | Medium |
| Tests and documentation | 5 tasks | Medium |

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing CLI syntax conflicts with adding positional channel names | Users may hit confusing command behavior | Preserve current commands and require explicit names only when ambiguous |
| Process tracking is currently config-only | Multiple active bots cannot be reported reliably | Add channel bridge metadata keyed by `channelName` |
| Duplicate Telegram token long polling conflicts | Messages may be missed or polling may fail | Reject duplicate tokens at connect/update time |
| Existing user config migration breaks | Current users lose channel access | Treat `telegram` as the default channel instance and test the compatibility path |

## Resources Needed

- Existing `docs/ai/design/feature-channel-connector.md`
- `packages/channel-connector` ConfigStore and Telegram adapter tests
- `packages/cli/src/commands/channel.ts`
- `packages/cli/src/services/channel/channel.service.ts`
- Telegram bot tokens for optional manual end-to-end validation

## Progress Summary

Phase 4 implementation is complete for named Telegram channel configuration, duplicate-token rejection, named start/list/disconnect/status behavior, per-channel authorization persistence, and foreground bridge tracking. Channel rules and bridge metadata persistence now live in `ChannelService`, keeping Commander wiring thin without a separate registry abstraction. `channel stop <name>` remains intentionally out of scope until daemon support. Remaining risk is limited to manual Telegram end-to-end validation with real bot tokens and active agents; automated coverage now exercises the core config, CLI resolution, bridge file persistence, and status/list behavior.
