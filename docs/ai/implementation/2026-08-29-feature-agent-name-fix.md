---
phase: implementation
title: Agent Registry Name Fix Implementation
description: Implementation notes and incident evidence
---

# Agent Registry Name Fix Implementation

## Root cause

At `2026-08-29T08:10:16Z`, an FTS agent invoked
`npx ai-devkit agent list --json` in a Codex exec sandbox. The sandbox could not
see host PIDs, and list-time `pruneIfDue` interpreted `ESRCH` as authoritative
death. It deleted managed rows. Subsequent host-side Codex detection reused the
original PIDs from session metadata but, with no rows left to inherit, generated
default names and registered empty tmux links. This exactly explains original
PIDs plus replaced names plus empty `tmux_session`.

## Changes

- Removed `pruneAt`, `prune`, `pruneIfDue`, their refresh/start call sites, and
  all liveness-based deletion in registration, rename conflicts, and pinning.
- Added exact registry removal to the explicit kill service; `ESRCH` still permits
  tmux cleanup and row removal.
- Made refresh inheritance require exact type/PID plus compatible session ID.
  Recycled PIDs receive an available suffixed display name without a registry
  write, preserving the old row.
- Kept list output detection-based: retained but undetected rows are invisible.
- Made no changes to `durable_agents`.

## Safety properties

SQL remains parameterized. No shell execution or new external input surface was
introduced. Observer paths cannot destroy registry history merely because their
process namespace is incomplete.
