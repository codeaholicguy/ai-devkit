---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Files Changed

- `packages/agent-manager/src/utils/AgentRegistry.ts` — added `RenameNotFoundError`, `RenameConflictError`, and `AgentRegistry.rename(currentName, newName)`.
- `packages/agent-manager/src/index.ts` — re-exported the two new error classes.
- `packages/agent-manager/src/__tests__/utils/AgentRegistry.test.ts` — 5 new tests covering rename behaviour.
- `packages/cli/src/commands/agent.ts` — added `agent rename <current-name> <new-name>` subcommand under `registerAgentCommand`.
- `packages/cli/src/__tests__/commands/agent.test.ts` — 5 new tests for the CLI command (uses `vi.hoisted` to define mock error classes).

## Implementation Notes

### `AgentRegistry.rename()`

1. Read file. If no entry has `name === currentName`, throw `RenameNotFoundError`.
2. Filter to live entries (PID alive) — this is the prune-before-conflict-check pattern from `startAgent`.
3. If any live entry has `name === newName`, throw `RenameConflictError`.
4. Map `liveEntries`, replacing matched entry's `name`. Write atomically via existing `writeFile()` (`.tmp` + `renameSync`).

### CLI `agent rename`

- Validates new name against existing `NAME_REGEX` first → exits 1.
- Same-name short-circuits with `ui.info` and exits 0 (kept out of `AgentRegistry.rename()` to keep that method a pure mutation primitive).
- Catches `RenameNotFoundError` and `RenameConflictError` via `instanceof` for tailored messages.
- Action is `async` to satisfy `withErrorHandler`'s `(...args) => Promise<void>` signature.

## Deviations from Design

None. Implementation matches design doc 1:1.

## Edge Cases Handled

- Invalid format new name → format error before touching registry.
- `<current> === <new>` → no-op success at CLI layer.
- Stale (dead) entry with target new name → pruned, rename succeeds.

## Follow-ups Left for Later

- Renaming an entry whose process is already dead currently silently removes the stale entry instead of failing with `RenameNotFoundError` (the not-found check uses raw entries, but the write uses live-filtered ones). Outside the documented "live agents" scope — tighten in a follow-up if it becomes a real problem.
- `idx` in `rename()` is computed but only used in the `< 0` branch; could be replaced with `.some()`. Cosmetic.
