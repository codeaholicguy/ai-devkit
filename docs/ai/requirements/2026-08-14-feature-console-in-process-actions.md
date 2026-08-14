---
phase: requirements
title: Console In-Process Actions Requirements
description: Remove per-action CLI subprocesses from the agent console
---

# Console In-Process Actions Requirements

## Problem Statement

`packages/cli/src/tui/console/actions/runAction.ts` starts a new CLI process for every console action. Startup and module-loading latency delays feedback for send, open, start, kill, rename, channel start, and channel stop, while duplicating orchestration between Commander and the TUI.

## Goals

- Invoke reusable application services directly from both Commander handlers and the console.
- Cover send, open, start, kill, rename, channel start, and channel stop in one coherent boundary.
- Preserve existing command output, exit behavior, validation, dependency/security boundaries, and test seams.
- Show `Sending`, `Opening`, and `Stopping channel` immediately when those actions begin.
- Suppress duplicate submission of an action while that action is pending.
- Keep acknowledgement under the 50 ms target by making the state transition synchronous and testing it without wall-clock timing.
- Add tests before production changes for direct invocation, immediate feedback, duplicate suppression, success, and errors.

## Non-Goals

- Removing the channel daemon child process; the daemon is the long-lived workload and remains intentionally detached.
- Changing command syntax, output wording, terminal resolution, tmux behavior, registry formats, or channel authorization/configuration.
- Adding new console actions or redesigning the console UI.

## Acceptance Criteria

- Console action execution no longer imports or calls `child_process.spawn` to reinvoke the CLI.
- Commander actions are thin adapters over the same application services used by the console.
- User-controlled values remain structured arguments/data and are never interpolated into a shell command.
- Existing CLI behavior and focused command tests remain green.
- Pending feedback is observable synchronously before the action promise settles.
- A second submission with the same pending key is ignored until settlement; retry is possible afterward.
- Focused tests, full CLI tests, CLI lint, and CLI build pass.

## Assumptions

- The user-approved objective is the authoritative requirements source for this feature.
- Existing feature documents for agent console start/kill/rename/channel and agent send define compatibility behavior.
- The configured Vercel React best-practices skill is unavailable in this runtime; repository React conventions and deterministic state tests are used instead.
