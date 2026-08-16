---
phase: requirements
title: Agent Pinning in the Console
description: Pin live agents to a persistent top section of the console list
---

# Agent Pinning in the Console

## Problem Statement

The console polls live agents and status-sorts them, so status changes can continually move an important agent. Operators coordinating several agents need a fast way to keep selected live processes at the top without changing the established ordering of other agents.

## Goals & Objectives

- Let an operator press lowercase `p` while the agent list has focus to toggle the selected live agent's pin.
- Persist the pin across console polling, refreshes, and in-place renames.
- Show pinned live agents first, ordered by existing `lastActive` recency descending; retain input/status order for unpinned agents.
- Make pins and the pinned/unpinned boundary visible without changing per-agent height.
- Select the first pinned live agent at startup, falling back to the first agent.
- Return a clear error when the selected process disappears before the toggle or when the database is readonly.

### Non-goals

- Pinning print-mode agents, which use a separate JSON store.
- Retaining ghost pins after a process row is pruned.
- Adding a pin timestamp, pin-management pane, uppercase `P`, or a new CLI command.
- Implementing the separately planned agent filter.

## User Stories & Use Cases

- As an operator, I can press `p` in list focus to pin or unpin the selected agent.
- As an operator, I see pinned agents in a top block with `*` markers and a labeled `OTHERS` divider before unpinned agents.
- As an operator, I retain a pin while an agent is renamed or refreshed by the polling loop.
- As an operator reopening the console, I initially select the first live pinned agent.
- As an operator, I receive an actionable message if the process vanishes during a toggle instead of a silent no-op.
- In detail focus, lowercase `p` remains unbound; in input focus it remains ordinary text.

## Success Criteria

- Migration `002_pins.sql` adds `agents.pinned INTEGER NOT NULL DEFAULT 0` and ships with the agent-manager package.
- Registry reads expose `pinned`; `togglePin(type, pid)` atomically flips it and updates `updated_at`, returning the new Boolean or `null` for a missing row.
- Poll refresh never clears a pin: `pinned` is absent from `insertOrUpdate`'s `ON CONFLICT ... DO UPDATE SET` list and from registry equality/write decisions.
- Manager results copy persisted pin state to `AgentInfo.pinned`, and a manager toggle resolves name to process identity.
- Rename retains the pin; prune removes the row and its pin.
- A pure `partitionPinned` function produces pinned-first recency order and otherwise preserves input order, with 100% coverage.
- Markers render as `▶*`, ` *`, `▶ `, and two spaces within the existing two-column marker allocation, with remote channel markers unaffected.
- A normal inter-agent divider becomes an `OTHERS` divider only at a mixed pinned/unpinned boundary; no extra row is added.
- Header total and continuous-list scroll indicators retain current behavior; list-mode hints include `p pin`.
- All required edge cases and the full repository test suite pass; feature lint and final review pass.

## Constraints & Assumptions

- Storage is one Boolean-like SQLite column on the existing `agents` table. There is no separate table, JSON persistence, or `pinned_at`.
- Toggling updates existing `updated_at`; this intentionally makes the most recently touched pin first. Rename/session activity may also reorder pinned agents.
- Pin lifetime equals process-row lifetime. Existing delete/prune behavior requires no retention logic.
- SQLite WAL and `busy_timeout=5000` remain the concurrency mechanism; no dependency is added.
- `pinned?: boolean` is additive at the public `AgentInfo` boundary; missing means unpinned.
- Future filter composition is: status-sort, partition, filter each partition, concatenate.
- Agent names are the console selection key, while persistence and mutation use `(type, pid)` identity after name resolution.

## Considered Alternatives

- Global config or JSON pins keyed by name/project: rejected because they create stale identities and ghost cleanup.
- Separate SQLite pins table: rejected because pin lifetime deliberately matches the existing process row.
- Dedicated `pinned_at`: rejected; existing activity recency is the accepted ordering signal.
- Pin management pane: deferred because a reversible Boolean toggle needs no form workflow.

## Questions & Open Items

None. Storage, identity, ordering, lifetime, key scope, rendering, failure behavior, and deferred integrations are binding user decisions.
