---
phase: planning
title: Agent Console Fast Initial State Plan
description: Test-first implementation tasks for cached first-frame rendering
---

# Agent Console Fast Initial State Plan

- [x] Add a failing manager test for a synchronous, filtered cached identity snapshot.
- [x] Add deterministic failing Ink hook tests using an unresolved live-list promise.
- [x] Implement the additive cached snapshot API without changing `listAgents()`.
- [x] Seed `useAgentList` synchronously and reconcile atomically on live success.
- [x] Add failing UI render tests for cached, refreshing, failed-refresh, and visible-error labels.
- [x] Implement cached list/footer representation.
- [x] Document merge-order and overlap risks with `feature-console-main-thread-responsiveness`.
- [x] Run focused and full agent-manager/CLI tests, lint, builds, and docs lint.
- [ ] Review, commit, push, and open a PR targeting `main`.
