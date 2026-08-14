---
phase: requirements
title: Agent Console Fast Initial State Requirements
description: Render a defensible cached agent list before asynchronous live discovery
---

# Agent Console Fast Initial State Requirements

## Problem

`agent console` starts with an empty/loading list until every adapter finishes discovery. The persistent agent registry already contains useful identities, but it does not contain trustworthy live status, summary, or last-active data.

## Goals

- Render defensible cached agent identities on the console's first frame without awaiting adapter discovery.
- Revalidate immediately and replace the cached list atomically with sorted live results.
- Show that cached rows are cached/refreshing and never claim a live status.
- Preserve registered names, selection behavior, error and empty states, polling cadence, manual refresh, sorting, rename semantics, and non-console `AgentManager.listAgents()` callers.
- Retain cached rows with a visible error if the initial live refresh rejects; remove stale cached rows when a successful live result omits them.

## Constraints

- Cached rows must be limited to registry entries whose PID is currently alive and whose adapter type is registered in this manager.
- No wall-clock freshness threshold is used.
- The change must be additive and focused so it can compose with `feature-console-main-thread-responsiveness`.

## Success Criteria

- A deliberately unresolved `listAgents()` promise does not prevent cached rows from rendering.
- Tests cover successful reconciliation, stale removal, refresh errors, and no-cache loading behavior.
- Focused and full agent-manager/CLI tests, lint, and builds pass.
