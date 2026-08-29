---
phase: planning
title: Agent Name Fix Plan
description: Minimal implementation task breakdown
---

# Agent Name Fix Plan

- [x] Capture and validate the PID-namespace deletion evidence.
- [x] Add failing regressions for non-destructive refresh, dead-agent pinning and
  killing, recycled PID isolation, and unchanged list visibility.
- [x] Remove pruning and every liveness-based deletion path.
- [x] Add kill-only registry removal.
- [x] Guard exact-PID inheritance with session identity and unique display names.
- [x] Confirm `durable_agents` has no interaction with interactive refresh.
- [x] Run build, full tests, lint, and e2e gates.
- [x] Commit and prepare PR #205 for an update without merging.

The implementation deliberately excludes PID-rollover migration, tmux liveness
guards, kill-order changes, and collision takeover.
